import { db } from '../../db'
import {
  courses, modules, units, learningBlocks, blockQuestions,
  learningThemes, learningThemeBlocks, learningQuestions,
  userQuestionnaireAnswers, userLearningPath,
  userLearningBlockProgress, courseEnrollments,
  userCourseProgress, userUnitProgress, userModuleProgress,
  questionAnswers, users,
} from '../../db/schema'
import { eq, and, inArray, asc, desc, sql, max, lt } from 'drizzle-orm'
import { AppError } from '../../utils/app-error'
import * as progressSvc from '../lms/progress.service'
import {
  callSetup, callPath,
  type SetupBlock, type PathTheme, type PathBlock, type PathQuestionnaireEntry, type PathProgressEntry,
} from './aiClient'
import type {
  LearningQuestion, UserLearningPath, UserLearningBlockProgress,
} from '../../db/schema'

const PLATFORM_ID = 'ai-amplify'

// topic-characterization only; setup graph doesn't need full body
const MAX_BLOCK_TEXT_CHARS = 800

/**
 * Truncates block text to MAX_BLOCK_TEXT_CHARS for the setup graph payload.
 * Trims to the last word boundary within the cap and appends an ellipsis.
 * Only affects what's SENT to the setup graph; stored data is unchanged.
 *
 * @param text - The block's best-available text.
 * @returns The original text if within cap, otherwise a truncated string.
 */
function truncateBlockText(text: string): string {
  if (text.length <= MAX_BLOCK_TEXT_CHARS) return text
  const slice = text.slice(0, MAX_BLOCK_TEXT_CHARS)
  const lastSpace = slice.lastIndexOf(' ')
  // Prefer a word boundary, but fall back to the hard cap if there's no space.
  const trimmed = lastSpace > 0 ? slice.slice(0, lastSpace) : slice
  return `${trimmed.trimEnd()}…`
}

/**
 * Best-available text for a block, used as the embedding/summarisation input
 * for Graph A. text → body, video → transcript||title, image/question → title.
 *
 * @param block - A learningBlocks row.
 */
function bestBlockText(block: typeof learningBlocks.$inferSelect): string {
  switch (block.type) {
    case 'text':
      return block.body ?? block.title
    case 'video':
      return block.transcript ?? block.title
    default:
      return block.title
  }
}

// ── Admin: setup / regenerate ─────────────────────────────────────────────────

/**
 * Regenerates the global learning setup (themes + questionnaire) from the full
 * catalogue of published courses' learning blocks.
 *
 * Gathers all blocks for published courses (course→module→unit→block), calls
 * Graph A, then atomically persists a new setup version: themes, theme↔block
 * membership, and questions. Returns a summary of what was written.
 *
 * @param userId     - Acting admin UUID (used for the AI service token).
 * @param maxCourses - Optional subset guard (positive integer): when set, only
 *                     the first N published courses (deterministic createdAt asc
 *                     order) are processed. Default (undefined) = all courses.
 */
export async function regenerateSetup(
  userId: string,
  maxCourses?: number,
): Promise<{ setupVersion: number; themeCount: number; questionCount: number }> {
  // Gather published courses and their full block tree. Order deterministically
  // by createdAt asc so the optional `maxCourses` subset is stable across runs.
  let publishedCourses = await db.select().from(courses)
    .where(eq(courses.status, 'published'))
    .orderBy(asc(courses.createdAt))
  if (publishedCourses.length === 0) {
    throw new AppError('No published courses to build a learning setup from', 400, 'NO_PUBLISHED_COURSES')
  }
  // Optional subset guard: process only the first N published courses.
  if (maxCourses !== undefined) {
    publishedCourses = publishedCourses.slice(0, maxCourses)
  }
  const courseIds = publishedCourses.map(c => c.id)
  const courseById = new Map(publishedCourses.map(c => [c.id, c]))

  const courseModules = await db.select().from(modules).where(inArray(modules.courseId, courseIds))
  const moduleToCourse = new Map(courseModules.map(m => [m.id, m.courseId]))
  const moduleIds = courseModules.map(m => m.id)

  const courseUnits = moduleIds.length
    ? await db.select().from(units).where(inArray(units.moduleId, moduleIds))
    : []
  const unitById = new Map(courseUnits.map(u => [u.id, u]))
  const unitIds = courseUnits.map(u => u.id)

  const blocks = unitIds.length
    ? await db.select().from(learningBlocks).where(inArray(learningBlocks.unitId, unitIds))
    : []
  if (blocks.length === 0) {
    throw new AppError('Published courses contain no learning blocks', 400, 'NO_BLOCKS')
  }

  // Build the AI payload: each block carries its best text plus course/unit context.
  const payloadBlocks: SetupBlock[] = blocks.map(b => {
    const unit = unitById.get(b.unitId)
    const courseId = unit ? moduleToCourse.get(unit.moduleId) : undefined
    const course = courseId ? courseById.get(courseId) : undefined
    return {
      id: b.id,
      title: b.title,
      text: truncateBlockText(bestBlockText(b)),
      courseId: courseId ?? '',
      courseTitle: course?.title ?? '',
      unitTitle: unit?.title ?? '',
    }
  })

  const result = await callSetup(userId, payloadBlocks)

  // Persist atomically as a new version.
  return db.transaction(async (tx) => {
    const [{ value: prevVersion }] = await tx
      .select({ value: max(learningThemes.setupVersion) })
      .from(learningThemes)
      .where(eq(learningThemes.platformId, PLATFORM_ID))
    const setupVersion = (prevVersion ?? 0) + 1
    const now = new Date()

    // Insert themes, mapping each AI tempId → the generated DB uuid.
    const tempIdToBlockIds = new Map<string, string[]>()
    for (const t of result.themes) tempIdToBlockIds.set(t.tempId, t.blockIds)

    // Defensive: never trust AI-returned block ids for an FK insert. The setup
    // graph (gpt-5) occasionally hallucinates block ids that don't exist in
    // learning_blocks, which would FK-violate learning_theme_blocks and roll back
    // the whole (multi-minute) regenerate. Build the set of ids we actually SENT —
    // every payloadBlocks.id is a real learning_blocks.id — and filter against it.
    const validBlockIds = new Set<string>(payloadBlocks.map(b => b.id))
    let droppedBlockIdCount = 0

    let themeCount = 0
    for (let i = 0; i < result.themes.length; i++) {
      const theme = result.themes[i]
      const [inserted] = await tx.insert(learningThemes).values({
        platformId: PLATFORM_ID,
        title: theme.title,
        description: theme.description,
        order: i,
        setupVersion,
        generatedAt: now,
      }).returning({ id: learningThemes.id })
      // Keep the theme row even if it ends up with zero valid blocks — an empty
      // theme is acceptable and far better than failing the whole regenerate.
      themeCount++

      // Theme ↔ block membership, ordered by position in the returned array.
      // Drop any hallucinated id not present in the valid-id set, then re-number
      // `order` 0..n so the surviving membership stays contiguous (no gaps).
      const rawBlockIds = tempIdToBlockIds.get(theme.tempId) ?? []
      const validIds = rawBlockIds.filter(id => validBlockIds.has(id))
      droppedBlockIdCount += rawBlockIds.length - validIds.length
      if (validIds.length > 0) {
        await tx.insert(learningThemeBlocks).values(
          validIds.map((learningBlockId, order) => ({
            themeId: inserted.id,
            learningBlockId,
            order,
          })),
        )
      }
    }

    if (droppedBlockIdCount > 0) {
      console.warn(`dropped ${droppedBlockIdCount} hallucinated block ids from setup output`)
    }

    // Insert questionnaire.
    let questionCount = 0
    if (result.questions.length > 0) {
      await tx.insert(learningQuestions).values(
        result.questions.map((q, order) => ({
          platformId: PLATFORM_ID,
          prompt: q.prompt,
          type: q.type,
          options: q.options ?? null,
          order,
          setupVersion,
        })),
      )
      questionCount = result.questions.length
    }

    return { setupVersion, themeCount, questionCount }
  })
}

/**
 * Returns the latest setup version number for the platform, or null if no setup
 * has been generated yet.
 */
async function getLatestSetupVersion(): Promise<number | null> {
  const [{ value }] = await db
    .select({ value: max(learningThemes.setupVersion) })
    .from(learningThemes)
    .where(eq(learningThemes.platformId, PLATFORM_ID))
  return value ?? null
}

/**
 * Lists the current (latest setup version) themes with their block counts.
 * Returns an empty array when no setup exists yet.
 */
export async function listCurrentThemes(): Promise<
  Array<{ id: string; title: string; description: string | null; order: number; setupVersion: number; blockCount: number }>
> {
  const version = await getLatestSetupVersion()
  if (version === null) return []

  const themes = await db.select().from(learningThemes)
    .where(and(eq(learningThemes.platformId, PLATFORM_ID), eq(learningThemes.setupVersion, version)))
    .orderBy(asc(learningThemes.order))

  if (themes.length === 0) return []

  const themeIds = themes.map(t => t.id)
  const counts = await db
    .select({ themeId: learningThemeBlocks.themeId, cnt: sql<number>`count(*)::int` })
    .from(learningThemeBlocks)
    .where(inArray(learningThemeBlocks.themeId, themeIds))
    .groupBy(learningThemeBlocks.themeId)
  const countMap = new Map(counts.map(c => [c.themeId, c.cnt]))

  return themes.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    order: t.order,
    setupVersion: t.setupVersion,
    blockCount: countMap.get(t.id) ?? 0,
  }))
}

// ── Learner: questionnaire ────────────────────────────────────────────────────

/**
 * Returns the latest-setup-version questionnaire questions, ordered.
 * Empty array when no setup exists.
 */
export async function listCurrentQuestions(): Promise<LearningQuestion[]> {
  const version = await getLatestSetupVersion()
  if (version === null) return []
  return db.select().from(learningQuestions)
    .where(and(eq(learningQuestions.platformId, PLATFORM_ID), eq(learningQuestions.setupVersion, version)))
    .orderBy(asc(learningQuestions.order))
}

/**
 * Loads the latest themes each enriched with their blocks (id/title/difficulty/
 * durationMins), suitable as Graph B input. Returns the version too so callers
 * can stamp `basedOnSetupVersion`.
 */
async function loadThemesForPath(): Promise<{ version: number; themes: PathTheme[] }> {
  const version = await getLatestSetupVersion()
  if (version === null) {
    throw new AppError('No learning setup has been generated yet', 409, 'NO_SETUP')
  }

  const themes = await db.select().from(learningThemes)
    .where(and(eq(learningThemes.platformId, PLATFORM_ID), eq(learningThemes.setupVersion, version)))
    .orderBy(asc(learningThemes.order))
  if (themes.length === 0) {
    throw new AppError('No learning setup has been generated yet', 409, 'NO_SETUP')
  }

  const themeIds = themes.map(t => t.id)
  const memberships = await db.select().from(learningThemeBlocks)
    .where(inArray(learningThemeBlocks.themeId, themeIds))
    .orderBy(asc(learningThemeBlocks.order))

  // Resolve block → difficulty (course.difficulty) and durationMins (unit.durationMinutes).
  const blockIds = [...new Set(memberships.map(m => m.learningBlockId))]
  const blocks = blockIds.length
    ? await db.select().from(learningBlocks).where(inArray(learningBlocks.id, blockIds))
    : []
  const blockById = new Map(blocks.map(b => [b.id, b]))

  const unitIds = [...new Set(blocks.map(b => b.unitId))]
  const unitRows = unitIds.length
    ? await db.select().from(units).where(inArray(units.id, unitIds))
    : []
  const unitById = new Map(unitRows.map(u => [u.id, u]))

  const modIds = [...new Set(unitRows.map(u => u.moduleId))]
  const modRows = modIds.length
    ? await db.select().from(modules).where(inArray(modules.id, modIds))
    : []
  const moduleById = new Map(modRows.map(m => [m.id, m]))

  const courseIds = [...new Set(modRows.map(m => m.courseId))]
  const courseRows = courseIds.length
    ? await db.select().from(courses).where(inArray(courses.id, courseIds))
    : []
  const courseById = new Map(courseRows.map(c => [c.id, c]))

  /** Resolves a block's difficulty via its course. */
  function difficultyFor(blockId: string): string {
    const block = blockById.get(blockId)
    const unit = block ? unitById.get(block.unitId) : undefined
    const mod = unit ? moduleById.get(unit.moduleId) : undefined
    const course = mod ? courseById.get(mod.courseId) : undefined
    return course?.difficulty ?? 'Beginner'
  }

  /** Resolves a block's duration via its unit (0 when unset). */
  function durationFor(blockId: string): number {
    const block = blockById.get(blockId)
    const unit = block ? unitById.get(block.unitId) : undefined
    return unit?.durationMinutes ?? 0
  }

  const byTheme = new Map<string, PathBlock[]>()
  for (const m of memberships) {
    const block = blockById.get(m.learningBlockId)
    if (!block) continue
    const arr = byTheme.get(m.themeId) ?? []
    arr.push({
      id: block.id,
      title: block.title,
      type: block.type,
      difficulty: difficultyFor(block.id),
      durationMins: durationFor(block.id),
    })
    byTheme.set(m.themeId, arr)
  }

  const pathThemes: PathTheme[] = themes.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    blocks: byTheme.get(t.id) ?? [],
  }))

  return { version, themes: pathThemes }
}

// ── Learner: path generate / regenerate ──────────────────────────────────────

/**
 * Generates (or regenerates) the learner's active learning path.
 *
 * If `answers` is provided, it is upserted as a new questionnaire-answers row.
 * Otherwise the learner's most recent stored answers are reused (for regenerate).
 * Builds Graph B input (themes+blocks, flattened questionnaire, existing block
 * progress), calls Graph B, then archives any existing active path and inserts
 * the new one. Returns the stored path row.
 *
 * @param userId  - Learner UUID.
 * @param answers - Optional `{ questionId: answer }` map.
 */
export async function generatePath(
  userId: string,
  answers?: Record<string, unknown>,
): Promise<UserLearningPath> {
  // Resolve the answers to use: freshly submitted, or the latest stored set.
  let effectiveAnswers: Record<string, unknown>
  if (answers) {
    await db.insert(userQuestionnaireAnswers).values({ userId, answers })
    effectiveAnswers = answers
  } else {
    const [latest] = await db.select().from(userQuestionnaireAnswers)
      .where(eq(userQuestionnaireAnswers.userId, userId))
      .orderBy(sql`${userQuestionnaireAnswers.createdAt} desc`)
      .limit(1)
    if (!latest) {
      throw new AppError('No questionnaire answers found to generate a path', 400, 'NO_ANSWERS')
    }
    effectiveAnswers = latest.answers
  }

  const { version, themes } = await loadThemesForPath()

  // Flatten answers → { questionId, prompt, answer } using current questions.
  const questions = await listCurrentQuestions()
  const promptById = new Map(questions.map(q => [q.id, q.prompt]))
  const questionnaire: PathQuestionnaireEntry[] = Object.entries(effectiveAnswers).map(([questionId, answer]) => ({
    questionId,
    prompt: promptById.get(questionId) ?? '',
    answer,
  }))

  // Existing block progress for this learner.
  const progressRows = await db.select().from(userLearningBlockProgress)
    .where(eq(userLearningBlockProgress.userId, userId))
  const progress: PathProgressEntry[] = progressRows.map(p => ({
    blockId: p.learningBlockId,
    status: p.status,
  }))

  const result = await callPath(userId, questionnaire, themes, progress)

  // Normalise to the stored Milestone shape (reason is non-optional in storage;
  // default to '' when the AI omits it).
  const milestones = result.milestones.map(m => ({
    themeId: m.themeId,
    order: m.order,
    rationale: m.rationale,
    blocks: m.blocks.map(b => ({ blockId: b.blockId, order: b.order, reason: b.reason ?? '' })),
  }))

  // Archive prior active path(s) and insert the new one atomically.
  return db.transaction(async (tx) => {
    await tx.update(userLearningPath)
      .set({ status: 'archived' })
      .where(and(eq(userLearningPath.userId, userId), eq(userLearningPath.status, 'active')))

    const [path] = await tx.insert(userLearningPath).values({
      userId,
      platformId: PLATFORM_ID,
      status: 'active',
      basedOnSetupVersion: version,
      milestones,
    }).returning()

    return path
  })
}

// ── Learner: current path (joined to content + progress) ──────────────────────

/**
 * Returns the learner's active path, with each milestone's blocks resolved to
 * their content and the learner's progress status.
 *
 * COMPLETED-BLOCK POLICY: all blocks are included; completed ones are surfaced
 * via `status` (never omitted) so the client can render ✓ state.
 *
 * Returns null when the learner has no active path.
 *
 * @param userId - Learner UUID.
 */
export async function getActivePath(userId: string): Promise<{
  id: string
  basedOnSetupVersion: number
  generatedAt: Date
  milestones: Array<{
    themeId: string
    order: number
    rationale: string
    theme: { id: string; title: string; description: string | null } | null
    blocks: Array<{
      blockId: string
      order: number
      reason: string | null
      title: string
      type: string
      body: string | null
      videoUrl: string | null
      transcript: string | null
      imageUrl: string | null
      status: 'not_started' | 'in_progress' | 'completed'
      // Block questions for 'question'-type blocks (empty for other types).
      // Mirrors the LMS `BlockQuestion` shape so the in-chat assistant can
      // submit answers via the existing /questions/:questionId/answer endpoint.
      questions: Array<{
        id: string
        blockId: string
        kind: 'survey' | 'action-plan'
        format: 'multiple-choice' | 'true-false' | 'short-text'
        prompt: string
        options: string[] | null
        correctIndex: number | null
        correctBool: boolean | null
        placeholder: string | null
        order: number
      }>
    }>
  }>
} | null> {
  const [path] = await db.select().from(userLearningPath)
    .where(and(eq(userLearningPath.userId, userId), eq(userLearningPath.status, 'active')))
    .limit(1)
  if (!path) return null

  // Collect referenced ids across all milestones.
  const blockIds = [...new Set(path.milestones.flatMap(m => m.blocks.map(b => b.blockId)))]
  const themeIds = [...new Set(path.milestones.map(m => m.themeId))]

  const blocks = blockIds.length
    ? await db.select().from(learningBlocks).where(inArray(learningBlocks.id, blockIds))
    : []
  const blockById = new Map(blocks.map(b => [b.id, b]))

  const themes = themeIds.length
    ? await db.select().from(learningThemes).where(inArray(learningThemes.id, themeIds))
    : []
  const themeById = new Map(themes.map(t => [t.id, t]))

  const progressRows = blockIds.length
    ? await db.select().from(userLearningBlockProgress)
        .where(and(eq(userLearningBlockProgress.userId, userId), inArray(userLearningBlockProgress.learningBlockId, blockIds)))
    : []
  const statusByBlock = new Map(progressRows.map(p => [p.learningBlockId, p.status]))

  // Block questions for any question-type blocks, grouped by blockId and ordered.
  // These let the in-chat assistant resolve a blockId → its real questionId(s)
  // and submit via the existing /questions/:questionId/answer endpoint.
  const questionRows = blockIds.length
    ? await db.select().from(blockQuestions)
        .where(inArray(blockQuestions.blockId, blockIds))
        .orderBy(asc(blockQuestions.order))
    : []
  const questionsByBlock = new Map<string, typeof questionRows>()
  for (const q of questionRows) {
    const arr = questionsByBlock.get(q.blockId) ?? []
    arr.push(q)
    questionsByBlock.set(q.blockId, arr)
  }

  const milestones = path.milestones
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(m => {
      const theme = themeById.get(m.themeId)
      return {
        themeId: m.themeId,
        order: m.order,
        rationale: m.rationale,
        theme: theme ? { id: theme.id, title: theme.title, description: theme.description } : null,
        blocks: m.blocks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(b => {
            const block = blockById.get(b.blockId)
            return {
              blockId: b.blockId,
              order: b.order,
              reason: b.reason ?? null,
              title: block?.title ?? '',
              type: block?.type ?? 'text',
              body: block?.body ?? null,
              videoUrl: block?.videoUrl ?? null,
              transcript: block?.transcript ?? null,
              imageUrl: block?.imageUrl ?? null,
              status: statusByBlock.get(b.blockId) ?? 'not_started',
              questions: (questionsByBlock.get(b.blockId) ?? []).map(q => ({
                id: q.id,
                blockId: q.blockId,
                kind: q.kind,
                format: q.format,
                prompt: q.prompt,
                options: q.options,
                correctIndex: q.correctIndex,
                correctBool: q.correctBool,
                placeholder: q.placeholder,
                order: q.order,
              })),
            }
          }),
      }
    })

  return {
    id: path.id,
    basedOnSetupVersion: path.basedOnSetupVersion,
    generatedAt: path.generatedAt,
    milestones,
  }
}

// ── Learner: in-chat block completion ─────────────────────────────────────────

/**
 * Marks a block complete from within the learning-path flow.
 *
 * Reuses the existing progress roll-up logic (progress.service.updateBlockProgress
 * → unit/module/course recalculation + auto certificate issue). The path order
 * governs sequencing, so this bypasses the course-page sequential block locking
 * entirely. Auto-enrolls the block's course if the learner has no active
 * enrollment yet.
 *
 * @param userId  - Learner UUID.
 * @param blockId - UUID of the block to complete.
 */
export async function completeBlock(
  userId: string,
  blockId: string,
): Promise<UserLearningBlockProgress> {
  // Resolve the block → its course (block → unit → module → course).
  const [block] = await db.select().from(learningBlocks).where(eq(learningBlocks.id, blockId))
  if (!block) throw new AppError('Learning block not found', 404, 'BLOCK_NOT_FOUND')

  const [unit] = await db.select().from(units).where(eq(units.id, block.unitId))
  const [mod] = unit ? await db.select().from(modules).where(eq(modules.id, unit.moduleId)) : []
  const courseId = mod?.courseId

  // Auto-enroll if there is no active enrollment for this course yet.
  if (courseId) {
    const [enrollment] = await db.select().from(courseEnrollments)
      .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
    if (!enrollment) {
      await db.insert(courseEnrollments)
        .values({ userId, courseId, status: 'active' })
        .onConflictDoNothing({ target: [courseEnrollments.userId, courseEnrollments.courseId] })
    }
  }

  // Reuse the canonical completion path (upsert + unit/module/course roll-up +
  // certificate). Block locking is a course-page read-time concern, not enforced
  // here, so nothing extra needs bypassing on the write path.
  return progressSvc.updateBlockProgress(userId, blockId, 'completed')
}

// ── Admin: learner management ─────────────────────────────────────────────────

/** A single learner row in the admin learners list. */
export type AdminLearner = {
  id: string
  fullName: string
  email: string
  country: string | null
  avatarUrl: string | null
  createdAt: Date
  lastActiveAt: Date | null
  hasQuestionnaire: boolean
  hasActivePath: boolean
  pathGeneratedAt: string | null
  blocksCompleted: number
  blocksInProgress: number
}

/**
 * Lists all learners (users with role 'sme') with their learning-path status and
 * block-progress counts, ordered by createdAt desc.
 *
 * Uses correlated subqueries (one aggregate pass per metric) rather than per-user
 * lookups to avoid N+1. The block-progress counts are computed with a single
 * grouped scan of user_learning_block_progress and joined in memory.
 */
export async function listLearners(): Promise<AdminLearner[]> {
  // Base learner rows.
  const learners = await db.select({
    id: users.id,
    fullName: users.fullName,
    email: users.email,
    country: users.country,
    avatarUrl: users.avatarUrl,
    createdAt: users.createdAt,
    lastActiveAt: users.lastActiveAt,
  }).from(users)
    .where(eq(users.role, 'sme'))
    .orderBy(desc(users.createdAt))

  if (learners.length === 0) return []
  const learnerIds = learners.map(l => l.id)

  // Users with at least one questionnaire-answers row.
  const questionnaireRows = await db
    .selectDistinct({ userId: userQuestionnaireAnswers.userId })
    .from(userQuestionnaireAnswers)
    .where(inArray(userQuestionnaireAnswers.userId, learnerIds))
  const hasQuestionnaireSet = new Set(questionnaireRows.map(r => r.userId))

  // Active path generatedAt per user (there is at most one active path per user).
  const activePathRows = await db
    .select({ userId: userLearningPath.userId, generatedAt: userLearningPath.generatedAt })
    .from(userLearningPath)
    .where(and(
      inArray(userLearningPath.userId, learnerIds),
      eq(userLearningPath.status, 'active'),
    ))
  const activePathByUser = new Map(activePathRows.map(r => [r.userId, r.generatedAt]))

  // Block progress counts (completed / in_progress) per user in a single grouped scan.
  const progressCounts = await db
    .select({
      userId: userLearningBlockProgress.userId,
      completed: sql<number>`count(*) filter (where ${userLearningBlockProgress.status} = 'completed')::int`,
      inProgress: sql<number>`count(*) filter (where ${userLearningBlockProgress.status} = 'in_progress')::int`,
    })
    .from(userLearningBlockProgress)
    .where(inArray(userLearningBlockProgress.userId, learnerIds))
    .groupBy(userLearningBlockProgress.userId)
  const countsByUser = new Map(progressCounts.map(c => [c.userId, c]))

  return learners.map(l => {
    const counts = countsByUser.get(l.id)
    const generatedAt = activePathByUser.get(l.id)
    return {
      id: l.id,
      fullName: l.fullName,
      email: l.email,
      country: l.country,
      avatarUrl: l.avatarUrl,
      createdAt: l.createdAt,
      lastActiveAt: l.lastActiveAt,
      hasQuestionnaire: hasQuestionnaireSet.has(l.id),
      hasActivePath: generatedAt !== undefined,
      pathGeneratedAt: generatedAt ? generatedAt.toISOString() : null,
      blocksCompleted: counts?.completed ?? 0,
      blocksInProgress: counts?.inProgress ?? 0,
    }
  })
}

/**
 * Resets a learner's learning/course progress while preserving their learning
 * path and questionnaire answers (so the path can be re-walked from scratch).
 *
 * Clears, in one transaction:
 *  - user_learning_block_progress (the per-block source of truth) — the count of
 *    these rows is what's returned as `cleared`.
 *  - user_unit_progress / user_module_progress / user_course_progress roll-ups,
 *    kept consistent with the block-progress reset.
 *  - question_answers for the learner's block questions (otherwise stale answers
 *    survive a "reset" and the learner can't re-attempt block questions).
 *
 * Enrollments are intentionally NOT touched: removing them would un-enroll the
 * learner from courses and is outside the scope of a progress reset. Certificates
 * are likewise left alone (historical record).
 *
 * @param userId - Learner UUID.
 * @returns The number of block-progress rows deleted.
 */
export async function resetProgress(userId: string): Promise<{ cleared: number }> {
  return db.transaction(async (tx) => {
    const deletedBlocks = await tx.delete(userLearningBlockProgress)
      .where(eq(userLearningBlockProgress.userId, userId))
      .returning({ id: userLearningBlockProgress.id })

    // Roll-up progress tables — reset alongside block progress for consistency.
    await tx.delete(userUnitProgress).where(eq(userUnitProgress.userId, userId))
    await tx.delete(userModuleProgress).where(eq(userModuleProgress.userId, userId))
    await tx.delete(userCourseProgress).where(eq(userCourseProgress.userId, userId))

    // Block-question answers — part of consumption progress, cleared too so the
    // learner can re-attempt question blocks from a clean slate.
    await tx.delete(questionAnswers).where(eq(questionAnswers.userId, userId))

    return { cleared: deletedBlocks.length }
  })
}

/**
 * Resets a learner to the pre-onboarding state: deletes their learning path(s)
 * AND their questionnaire answers, so the initial intake form is presented again.
 *
 * Paths are deleted outright (not archived): with the questionnaire gone, archived
 * paths reference answers that no longer exist and are meaningless. Block/course
 * progress is left untouched here — use resetProgress for that.
 *
 * @param userId - Learner UUID.
 */
export async function resetPath(userId: string): Promise<{ ok: true }> {
  await db.transaction(async (tx) => {
    await tx.delete(userLearningPath).where(eq(userLearningPath.userId, userId))
    await tx.delete(userQuestionnaireAnswers).where(eq(userQuestionnaireAnswers.userId, userId))
  })
  return { ok: true }
}

/**
 * Admin one-shot: rebuilds the global learning setup AND resets every learner's
 * path back to pre-onboarding — without destroying any completed work.
 *
 * Step 1 runs the full setup regenerate (new themes + questionnaire, new
 * setupVersion). Step 2 globally clears learning paths + questionnaire answers
 * the same way resetPath does per-user, but for ALL users. Crucially it does NOT
 * touch block/unit/module/course progress, enrolments, or block-question answers,
 * so completed learning is preserved across the reset.
 *
 * @param adminUserId - Acting admin UUID (used for the AI service token).
 * @returns The new setup summary plus the number of learning paths cleared.
 */
export async function regenerateAll(adminUserId: string): Promise<{
  setupVersion: number
  themeCount: number
  questionCount: number
  pathsCleared: number
}> {
  // Step 1: full setup regenerate (no maxCourses → all published courses).
  const { setupVersion, themeCount, questionCount } = await regenerateSetup(adminUserId)

  // Step 2: globally reset every learner's path, mirroring resetPath but with no
  // userId filter. Only paths + questionnaire answers are removed — progress,
  // enrolments and block-question answers are intentionally left intact.
  // Also PRUNE every prior setup version (themes + questions). This is safe here —
  // and ONLY here — because we wipe all user paths in the same transaction, so no
  // active path references the old theme ids. Deleting old themes cascades to
  // learning_theme_blocks (FK onDelete: 'cascade'), so it's a clean replace rather
  // than unbounded version accumulation.
  const pathsCleared = await db.transaction(async (tx) => {
    const deletedPaths = await tx
      .delete(userLearningPath)
      .returning({ id: userLearningPath.id })
    await tx.delete(userQuestionnaireAnswers)
    await tx.delete(learningThemes)
      .where(and(eq(learningThemes.platformId, PLATFORM_ID), lt(learningThemes.setupVersion, setupVersion)))
    await tx.delete(learningQuestions)
      .where(and(eq(learningQuestions.platformId, PLATFORM_ID), lt(learningQuestions.setupVersion, setupVersion)))
    return deletedPaths.length
  })

  return { setupVersion, themeCount, questionCount, pathsCleared }
}
