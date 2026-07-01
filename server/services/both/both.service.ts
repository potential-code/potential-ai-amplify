import { db } from '../../db'
import {
  bothContentPool, bothUserPaths, bothPathContentRefs, bothPathBlockRefs,
  bothMilestoneAssessments, bothUserQuizResults, bothUserItemProgress,
  courses, modules, units, learningBlocks, blockQuestions,
} from '../../db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { AppError } from '../../utils/app-error'
import { callBothPathBuilder, type BothPathBuilderInput, type BlockCatalogItem } from '../learning/bothAiClient'

const PASS_THRESHOLD = 0.7

// ── Internal types ────────────────────────────────────────────────────────────

/** Shape of a milestone row stored in the path's jsonb column. */
type StoredMilestone = { milestoneId: string; title: string; order: number; rationale: string }

/**
 * Unified content item returned in each milestone's `content` array.
 * Discriminated by `itemType`: 'external' for YouTube/article, 'internal' for SMEEP blocks.
 */
export type BothContentItem = {
  id: string
  itemType: 'external' | 'internal'
  orderInMilestone: number
  rationale?: string | null
  title: string
  // ── External fields ──────────────────────────────────────────────────────
  url?: string | null
  type?: 'youtube' | 'article' | null
  description?: string | null
  youtubeVideoId?: string | null
  durationSeconds?: number | null
  articleText?: string | null
  progress?: { status: string; videoWatchPct: number | null } | null
  // ── Internal block fields ────────────────────────────────────────────────
  blockId?: string | null
  blockType?: string | null
  body?: string | null
  videoUrl?: string | null
  imageUrl?: string | null
  transcript?: string | null
  questions?: Array<{
    id: string; prompt: string; kind: string; format: string
    options?: string[] | null; correctIndex?: number | null; order: number
  }> | null
  blockProgress?: { status: string; videoWatchPct: number | null } | null
}

// ── Block catalog helper ──────────────────────────────────────────────────────

/**
 * Fetches the full catalog of published-course learning blocks, joining through
 * modules/units to gather course and unit titles. Used to populate the AI input.
 *
 * @returns Array of BlockCatalogItem ready to send to the AI.
 */
async function fetchBlockCatalog(): Promise<BlockCatalogItem[]> {
  const publishedCourses = await db.select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.status, 'published'))

  if (publishedCourses.length === 0) return []

  const courseIds = publishedCourses.map(c => c.id)
  const courseById = new Map(publishedCourses.map(c => [c.id, c]))

  const courseModules = await db.select({ id: modules.id, courseId: modules.courseId })
    .from(modules)
    .where(inArray(modules.courseId, courseIds))

  if (courseModules.length === 0) return []

  const moduleToCourse = new Map(courseModules.map(m => [m.id, m.courseId]))
  const moduleIds = courseModules.map(m => m.id)

  const courseUnits = await db.select({ id: units.id, moduleId: units.moduleId, title: units.title })
    .from(units)
    .where(inArray(units.moduleId, moduleIds))

  if (courseUnits.length === 0) return []

  const unitById = new Map(courseUnits.map(u => [u.id, u]))
  const unitIds = courseUnits.map(u => u.id)

  const blocks = await db.select().from(learningBlocks)
    .where(inArray(learningBlocks.unitId, unitIds))

  return blocks.map((b): BlockCatalogItem => {
    const unit = unitById.get(b.unitId)
    const courseId = unit ? moduleToCourse.get(unit.moduleId) : undefined
    const course = courseId ? courseById.get(courseId) : undefined
    return {
      id: b.id,
      title: b.title,
      type: b.type,
      courseTitle: course?.title ?? '',
      unitTitle: unit?.title ?? '',
      text: b.body ?? null,
      transcript: b.transcript ?? null,
    }
  })
}

// ── Public service functions ──────────────────────────────────────────────────

/**
 * Creates a 'building' path row, fetches the block catalog, and fires async
 * path generation. The client should poll GET /both/path for status changes.
 *
 * @param userId  - Learner UUID.
 * @param profile - Discovery profile from the questionnaire.
 * @returns       - The newly created path ID.
 */
export async function initiateBothPath(
  userId: string,
  profile: BothPathBuilderInput['profile'],
): Promise<{ pathId: string }> {
  // Fetch catalog BEFORE creating the path row so failures surface early.
  const blocks = await fetchBlockCatalog()

  const [path] = await db.insert(bothUserPaths).values({
    userId,
    discoveryProfile: profile,
    milestones: [],
    status: 'building',
  }).returning({ id: bothUserPaths.id })

  if (!path) throw new AppError('Failed to create path', 500, 'PATH_CREATE_FAILED')

  // Fire and forget — mark as failed on error so the client sees a terminal state.
  buildBothPath(userId, path.id, profile, blocks).catch(async (err) => {
    console.error(`[both] buildBothPath failed for path ${path.id}:`, err)
    await db.update(bothUserPaths)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(bothUserPaths.id, path.id))
      .catch(() => { /* best effort */ })
  })

  return { pathId: path.id }
}

/**
 * Async builder — calls the AI, persists all results in a single transaction,
 * and flips the path status to 'active'.
 *
 * @param userId  - Learner UUID (passed to AI client for tracing).
 * @param pathId  - The pre-created path row to populate.
 * @param profile - Learner profile.
 * @param blocks  - Pre-fetched block catalog.
 */
async function buildBothPath(
  userId: string,
  pathId: string,
  profile: BothPathBuilderInput['profile'],
  blocks: BlockCatalogItem[],
): Promise<void> {
  const result = await callBothPathBuilder(userId, { profile, blocks })

  await db.transaction(async (tx) => {
    // ── 1. Dedup + upsert external content pool ────────────────────────────
    const contentItems = result.contentRefs.map((r) => r.contentItem)
    const poolByUrl = new Map<string, string>()

    for (const item of contentItems) {
      if (poolByUrl.has(item.url)) continue

      const [existing] = await tx.select({ id: bothContentPool.id, url: bothContentPool.url })
        .from(bothContentPool).where(eq(bothContentPool.url, item.url)).limit(1)

      if (existing) {
        poolByUrl.set(existing.url, existing.id)
      } else {
        const [inserted] = await tx.insert(bothContentPool).values({
          url: item.url,
          type: item.type,
          title: item.title,
          description: item.description,
          sourceQuery: item.sourceQuery,
          youtubeVideoId: item.youtubeVideoId ?? null,
          channelTitle: item.channelTitle ?? null,
          durationSeconds: item.durationSeconds ?? null,
          articleText: item.articleText ?? null,
          qualityScore: item.qualityScore,
          status: 'active',
        }).returning({ id: bothContentPool.id, url: bothContentPool.url })
        if (inserted) poolByUrl.set(inserted.url, inserted.id)
      }
    }

    // ── 2. Insert external content refs ───────────────────────────────────
    const contentRefsToInsert = result.contentRefs
      .filter((r) => poolByUrl.has(r.contentItem.url))
      .map((r) => ({
        bothUserPathId: pathId,
        contentPoolId: poolByUrl.get(r.contentItem.url)!,
        milestoneId: r.milestoneId,
        orderInMilestone: r.orderInMilestone,
        rationale: r.rationale,
      }))

    if (contentRefsToInsert.length > 0) {
      await tx.insert(bothPathContentRefs).values(contentRefsToInsert)
    }

    // ── 3. Insert internal block refs ──────────────────────────────────────
    const blockRefsToInsert = result.blockRefs.map((r) => ({
      bothUserPathId: pathId,
      blockId: r.blockId,
      milestoneId: r.milestoneId,
      orderInMilestone: r.orderInMilestone,
      rationale: r.rationale,
    }))

    if (blockRefsToInsert.length > 0) {
      await tx.insert(bothPathBlockRefs).values(blockRefsToInsert)
    }

    // ── 4. Insert milestone assessments ────────────────────────────────────
    for (const assessment of result.assessments) {
      await tx.insert(bothMilestoneAssessments).values({
        bothUserPathId: pathId,
        milestoneId: assessment.milestoneId,
        milestoneTitle: assessment.milestoneTitle,
        pretestQuestions: assessment.pretestQuestions,
        questions: assessment.questions,
      })
    }

    // ── 5. Update path header ──────────────────────────────────────────────
    await tx.update(bothUserPaths).set({
      milestones: result.milestones,
      status: 'active',
      internalBlockCount: result.blockRefs.length,
      updatedAt: new Date(),
    }).where(eq(bothUserPaths.id, pathId))
  })
}

/**
 * Returns the most recent Both path for a user, with all content, block data,
 * progress, and milestone unlock state. Returns null when no path exists.
 *
 * @param userId - Learner UUID.
 */
export async function getBothPath(userId: string) {
  const [path] = await db.select().from(bothUserPaths)
    .where(and(eq(bothUserPaths.userId, userId), eq(bothUserPaths.platformId, 'smeep')))
    .orderBy(desc(bothUserPaths.createdAt)).limit(1)

  if (!path) return null

  // ── Fetch external content refs + pool items ────────────────────────────
  const contentRefs = await db.select({
    ref: bothPathContentRefs,
    pool: bothContentPool,
  }).from(bothPathContentRefs)
    .innerJoin(bothContentPool, eq(bothPathContentRefs.contentPoolId, bothContentPool.id))
    .where(eq(bothPathContentRefs.bothUserPathId, path.id))

  // ── Fetch internal block refs + block data ──────────────────────────────
  const blockRefs = await db.select({
    ref: bothPathBlockRefs,
    block: learningBlocks,
  }).from(bothPathBlockRefs)
    .innerJoin(learningBlocks, eq(bothPathBlockRefs.blockId, learningBlocks.id))
    .where(eq(bothPathBlockRefs.bothUserPathId, path.id))

  // Fetch questions for each selected block in one query.
  const blockIds = blockRefs.map(r => r.block.id)
  const allBlockQuestions = blockIds.length > 0
    ? await db.select().from(blockQuestions).where(inArray(blockQuestions.blockId, blockIds))
    : []

  const questionsByBlock = new Map<string, typeof allBlockQuestions>()
  for (const q of allBlockQuestions) {
    if (!questionsByBlock.has(q.blockId)) questionsByBlock.set(q.blockId, [])
    questionsByBlock.get(q.blockId)!.push(q)
  }

  // ── Fetch unified progress ──────────────────────────────────────────────
  const progressRows = await db.select().from(bothUserItemProgress)
    .where(and(eq(bothUserItemProgress.userId, userId), eq(bothUserItemProgress.bothUserPathId, path.id)))

  // Key: `${itemType}:${itemId}`
  const progressByKey = new Map(progressRows.map(p => [`${p.itemType}:${p.itemId}`, p]))

  // ── Fetch quiz results ──────────────────────────────────────────────────
  const quizResults = await db.select().from(bothUserQuizResults)
    .where(and(eq(bothUserQuizResults.userId, userId), eq(bothUserQuizResults.bothUserPathId, path.id)))

  // Fetch assessments to know which milestones have a pretest
  const assessments = await db.select({
    milestoneId: bothMilestoneAssessments.milestoneId,
    pretestQuestions: bothMilestoneAssessments.pretestQuestions,
  }).from(bothMilestoneAssessments)
    .where(eq(bothMilestoneAssessments.bothUserPathId, path.id))

  const hasPretestByMilestone = new Map(
    assessments.map((a) => [a.milestoneId, a.pretestQuestions != null])
  )

  const latestQuizByMilestone = new Map<string, typeof quizResults[0]>()
  const pretestCompletedByMilestone = new Set<string>()

  for (const r of quizResults) {
    if (r.quizType === 'pretest') {
      pretestCompletedByMilestone.add(r.milestoneId)
    } else {
      const existing = latestQuizByMilestone.get(r.milestoneId)
      if (!existing || r.attemptNumber > existing.attemptNumber) latestQuizByMilestone.set(r.milestoneId, r)
    }
  }

  // ── Build milestone output ──────────────────────────────────────────────

  const learningStyle = (path.discoveryProfile as { learningStyle?: string } | null)?.learningStyle

  const milestones = (path.milestones as StoredMilestone[])
    .sort((a, b) => a.order - b.order)
    .map((m, idx, arr) => {
      // Determine unlock state: first milestone always unlocked, subsequent
      // ones require the previous milestone's posttest to have passed at 70%.
      const prevMilestone = arr[idx - 1]
      const prevQuizPassed = idx === 0 || latestQuizByMilestone.get(prevMilestone?.milestoneId ?? '')?.passed === true
      const unlocked = idx === 0 || prevQuizPassed
      const pretestCompleted = pretestCompletedByMilestone.has(m.milestoneId)
      const quiz = latestQuizByMilestone.get(m.milestoneId)

      let content: BothContentItem[] = []

      if (pretestCompleted) {
        // ── External items for this milestone ──────────────────────────────
        const externalItems: BothContentItem[] = contentRefs
          .filter((r) => r.ref.milestoneId === m.milestoneId)
          .filter((r) => {
            // Apply learning-style filter for external content only
            if (learningStyle === 'visual') return r.pool.type === 'youtube'
            if (learningStyle === 'reading') return r.pool.type === 'article'
            return true
          })
          .map((r): BothContentItem => {
            const prog = progressByKey.get(`external:${r.ref.contentPoolId}`)
            return {
              id: r.ref.contentPoolId,
              itemType: 'external',
              orderInMilestone: r.ref.orderInMilestone,
              rationale: r.ref.rationale,
              title: r.pool.title,
              url: r.pool.url,
              type: r.pool.type,
              description: r.pool.description,
              youtubeVideoId: r.pool.youtubeVideoId,
              durationSeconds: r.pool.durationSeconds,
              articleText: r.pool.articleText,
              progress: prog ? { status: prog.status, videoWatchPct: prog.videoWatchPct } : null,
            }
          })

        // ── Internal block items for this milestone ────────────────────────
        const internalItems: BothContentItem[] = blockRefs
          .filter((r) => r.ref.milestoneId === m.milestoneId)
          .map((r): BothContentItem => {
            const prog = progressByKey.get(`internal:${r.ref.blockId}`)
            const qs = questionsByBlock.get(r.block.id) ?? []
            return {
              id: r.ref.blockId,
              itemType: 'internal',
              orderInMilestone: r.ref.orderInMilestone,
              rationale: r.ref.rationale,
              title: r.block.title,
              blockId: r.block.id,
              blockType: r.block.type,
              body: r.block.body,
              videoUrl: r.block.videoUrl,
              imageUrl: r.block.imageUrl,
              transcript: r.block.transcript,
              questions: qs
                .sort((a, b) => a.order - b.order)
                .map(q => ({
                  id: q.id,
                  prompt: q.prompt,
                  kind: q.kind,
                  format: q.format,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  order: q.order,
                })),
              blockProgress: prog ? { status: prog.status, videoWatchPct: prog.videoWatchPct } : null,
            }
          })

        // Merge and sort by orderInMilestone
        content = [...externalItems, ...internalItems].sort((a, b) => a.orderInMilestone - b.orderInMilestone)
      }

      // Completion: all non-empty content rows must be 'completed' AND posttest passed
      const allExternalComplete = contentRefs
        .filter(r => r.ref.milestoneId === m.milestoneId)
        .every(r => progressByKey.get(`external:${r.ref.contentPoolId}`)?.status === 'completed')
      const allInternalComplete = blockRefs
        .filter(r => r.ref.milestoneId === m.milestoneId)
        .every(r => progressByKey.get(`internal:${r.ref.blockId}`)?.status === 'completed')

      const hasExternalContent = contentRefs.some(r => r.ref.milestoneId === m.milestoneId)
      const hasInternalContent = blockRefs.some(r => r.ref.milestoneId === m.milestoneId)
      const allComplete = (
        (!hasExternalContent || allExternalComplete) &&
        (!hasInternalContent || allInternalComplete) &&
        (hasExternalContent || hasInternalContent)
      )

      return {
        ...m,
        unlocked,
        pretestCompleted,
        hasPretest: hasPretestByMilestone.get(m.milestoneId) ?? false,
        completed: allComplete && quiz?.passed === true,
        content,
        quiz: quiz ? { score: quiz.score, total: quiz.totalQuestions, passed: quiz.passed, attempts: quiz.attemptNumber } : null,
        quizAvailable: pretestCompleted && allComplete && !quiz?.passed,
      }
    })

  return {
    path: {
      ...path,
      noSmeepContent: path.internalBlockCount === 0,
    },
    milestones,
  }
}

/**
 * Marks an item (external or internal) as completed, or updates video progress.
 * Uses an upsert so duplicate calls are safe.
 *
 * @param userId       - Learner UUID.
 * @param itemType     - 'external' (content pool) or 'internal' (learning block).
 * @param itemId       - contentPoolId or blockId.
 * @param pathId       - The both_user_paths row ID.
 * @param milestoneId  - Which milestone this item belongs to.
 * @param videoWatchPct - Optional video watch percentage.
 */
export async function completeItem(
  userId: string,
  itemType: 'external' | 'internal',
  itemId: string,
  pathId: string,
  milestoneId: string,
  videoWatchPct?: number,
): Promise<void> {
  await db.insert(bothUserItemProgress).values({
    userId,
    itemType,
    itemId,
    bothUserPathId: pathId,
    milestoneId,
    status: 'completed',
    videoWatchPct: videoWatchPct ?? null,
    completedAt: new Date(),
  }).onConflictDoUpdate({
    target: [bothUserItemProgress.userId, bothUserItemProgress.itemType, bothUserItemProgress.itemId, bothUserItemProgress.bothUserPathId],
    set: {
      status: 'completed',
      videoWatchPct: videoWatchPct ?? null,
      completedAt: new Date(),
    },
  })
}

/**
 * Returns pretest questions for a milestone, with correct answers stripped.
 *
 * @param userId      - Learner UUID (unused in query but kept for symmetry / future auditing).
 * @param pathId      - The both_user_paths row ID.
 * @param milestoneId - Target milestone.
 */
export async function getMilestonePretest(userId: string, pathId: string, milestoneId: string) {
  const [assessment] = await db.select().from(bothMilestoneAssessments)
    .where(and(eq(bothMilestoneAssessments.bothUserPathId, pathId), eq(bothMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  const questions = (assessment.pretestQuestions as Array<{ question: string; options: string[]; correctIndex: number; explanation: string }> ?? [])
    .map(({ correctIndex: _ci, ...q }) => q)

  return { milestoneId, milestoneTitle: assessment.milestoneTitle, questions }
}

/**
 * Records a pretest submission. No pass/fail gate — the pretest is a diagnostic.
 * A second submission for the same milestone is silently returned as-is.
 *
 * @param userId      - Learner UUID.
 * @param pathId      - The both_user_paths row ID.
 * @param milestoneId - Target milestone.
 * @param answers     - Array of answer indices (same length as pretestQuestions).
 */
export async function submitPretest(userId: string, pathId: string, milestoneId: string, answers: number[]) {
  const [assessment] = await db.select().from(bothMilestoneAssessments)
    .where(and(eq(bothMilestoneAssessments.bothUserPathId, pathId), eq(bothMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  // Guard: only one pretest attempt per milestone
  const [existing] = await db.select().from(bothUserQuizResults).where(
    and(
      eq(bothUserQuizResults.userId, userId),
      eq(bothUserQuizResults.bothUserPathId, pathId),
      eq(bothUserQuizResults.milestoneId, milestoneId),
      eq(bothUserQuizResults.quizType, 'pretest'),
    )
  ).limit(1)
  if (existing) return { alreadySubmitted: true, score: existing.score, total: existing.totalQuestions }

  const questions = assessment.pretestQuestions as Array<{ correctIndex: number }> ?? []
  const score = answers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctIndex ? 1 : 0), 0)

  await db.insert(bothUserQuizResults).values({
    userId,
    bothUserPathId: pathId,
    milestoneId,
    quizType: 'pretest',
    score,
    totalQuestions: questions.length,
    passed: true, // pretests always "pass" — they're diagnostic only
    attemptNumber: 1,
    answers,
  })

  return { score, total: questions.length }
}

/**
 * Returns posttest questions for a milestone, with correct answers stripped.
 *
 * @param userId      - Learner UUID (unused in query; kept for symmetry).
 * @param pathId      - The both_user_paths row ID.
 * @param milestoneId - Target milestone.
 */
export async function getMilestoneQuiz(userId: string, pathId: string, milestoneId: string) {
  const [assessment] = await db.select().from(bothMilestoneAssessments)
    .where(and(eq(bothMilestoneAssessments.bothUserPathId, pathId), eq(bothMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')

  const questions = (assessment.questions as Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>)
    .map(({ correctIndex: _ci, ...q }) => q)

  return { milestoneId, milestoneTitle: assessment.milestoneTitle, questions }
}

/**
 * Submits posttest answers, scores them, persists the result, and flips the
 * overall path status to 'completed' once all milestones pass.
 *
 * @param userId      - Learner UUID.
 * @param pathId      - The both_user_paths row ID.
 * @param milestoneId - Target milestone.
 * @param answers     - Array of answer indices (same length as questions).
 * @returns           - Score, total, and whether the attempt passed.
 */
export async function submitQuiz(userId: string, pathId: string, milestoneId: string, answers: number[]) {
  const [assessment] = await db.select().from(bothMilestoneAssessments)
    .where(and(eq(bothMilestoneAssessments.bothUserPathId, pathId), eq(bothMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  const questions = assessment.questions as Array<{ correctIndex: number }>
  const score = answers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctIndex ? 1 : 0), 0)
  const total = questions.length
  const passed = score / total >= PASS_THRESHOLD

  const prevAttempts = await db.select().from(bothUserQuizResults)
    .where(and(
      eq(bothUserQuizResults.userId, userId),
      eq(bothUserQuizResults.bothUserPathId, pathId),
      eq(bothUserQuizResults.milestoneId, milestoneId),
      eq(bothUserQuizResults.quizType, 'posttest'),
    ))

  await db.insert(bothUserQuizResults).values({
    userId,
    bothUserPathId: pathId,
    milestoneId,
    quizType: 'posttest',
    score,
    totalQuestions: total,
    passed,
    attemptNumber: prevAttempts.length + 1,
    answers,
  })

  // If this attempt passed, check if all milestones are now complete → flip path to 'completed'.
  if (passed) {
    const [pathRow] = await db.select().from(bothUserPaths).where(eq(bothUserPaths.id, pathId)).limit(1)
    const storedMilestones = (pathRow?.milestones ?? []) as StoredMilestone[]
    const allPosttests = await db.select().from(bothUserQuizResults).where(
      and(
        eq(bothUserQuizResults.userId, userId),
        eq(bothUserQuizResults.bothUserPathId, pathId),
        eq(bothUserQuizResults.quizType, 'posttest'),
      )
    )
    const passedMilestones = new Set(allPosttests.filter(r => r.passed).map(r => r.milestoneId))
    if (storedMilestones.every(m => passedMilestones.has(m.milestoneId))) {
      await db.update(bothUserPaths)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(bothUserPaths.id, pathId))
    }
  }

  return { score, total, passed }
}
