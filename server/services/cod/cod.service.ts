import { db } from '../../db'
import {
  codContentPool, codUserPaths, codPathContentRefs,
  codMilestoneAssessments, codUserQuizResults, codUserContentProgress,
} from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { AppError } from '../../utils/app-error'
import { callCodPathBuilder, type CodPathBuilderInput } from '../learning/codAiClient'

const PASS_THRESHOLD = 0.7

/** Creates a 'building' path row and triggers async AI path generation. */
export async function initiateCodPath(
  userId: string,
  profile: CodPathBuilderInput['profile'],
): Promise<{ pathId: string }> {
  const [path] = await db.insert(codUserPaths).values({
    userId,
    discoveryProfile: profile,
    milestones: [],
    status: 'building',
  }).returning({ id: codUserPaths.id })

  if (!path) throw new AppError('Failed to create path', 500, 'PATH_CREATE_FAILED')

  // Fire and forget — client polls GET /cod/path for status changes
  buildCodPath(userId, path.id, profile).catch(async (err) => {
    console.error(`[cod] buildCodPath failed for path ${path.id}:`, err)
    await db.update(codUserPaths)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(codUserPaths.id, path.id))
      .catch(() => { /* best effort */ })
  })

  return { pathId: path.id }
}

/** Async path builder — calls AI, persists all results atomically, flips status to 'active'. */
async function buildCodPath(
  userId: string,
  pathId: string,
  profile: CodPathBuilderInput['profile'],
): Promise<void> {
  const result = await callCodPathBuilder(userId, { profile })

  await db.transaction(async (tx) => {
    // Upsert content pool items (deduplication by URL)
    const contentItems = result.contentRefs.map((r) => r.contentItem)
    const poolByUrl = new Map<string, string>()

    for (const item of contentItems) {
      if (poolByUrl.has(item.url)) continue

      const [existing] = await tx.select({ id: codContentPool.id, url: codContentPool.url })
        .from(codContentPool).where(eq(codContentPool.url, item.url)).limit(1)

      if (existing) {
        poolByUrl.set(existing.url, existing.id)
      } else {
        const [inserted] = await tx.insert(codContentPool).values({
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
        }).returning({ id: codContentPool.id, url: codContentPool.url })
        if (inserted) poolByUrl.set(inserted.url, inserted.id)
      }
    }

    // Persist content refs
    const refsToInsert = result.contentRefs
      .filter((r) => poolByUrl.has(r.contentItem.url))
      .map((r) => ({
        codUserPathId: pathId,
        contentPoolId: poolByUrl.get(r.contentItem.url)!,
        milestoneId: r.milestoneId,
        orderInMilestone: r.orderInMilestone,
        rationale: r.rationale,
      }))

    if (refsToInsert.length > 0) {
      await tx.insert(codPathContentRefs).values(refsToInsert)
    }

    // Persist assessments
    for (const assessment of result.assessments) {
      await tx.insert(codMilestoneAssessments).values({
        codUserPathId: pathId,
        milestoneId: assessment.milestoneId,
        milestoneTitle: assessment.milestoneTitle,
        pretestQuestions: assessment.pretestQuestions,
        questions: assessment.questions,
      })
    }

    // Update path with milestones + flip to active
    await tx.update(codUserPaths).set({
      milestones: result.milestones,
      status: 'active',
      updatedAt: new Date(),
    }).where(eq(codUserPaths.id, pathId))
  })
}

/** Returns the active COD path for a user with content, progress, and quiz state. */
export async function getCodPath(userId: string) {
  const [path] = await db.select().from(codUserPaths)
    .where(and(eq(codUserPaths.userId, userId), eq(codUserPaths.platformId, 'ai-amplify')))
    .orderBy(desc(codUserPaths.createdAt)).limit(1)

  if (!path) return null

  // Fetch content refs + pool items
  const refs = await db.select({
    ref: codPathContentRefs,
    pool: codContentPool,
  }).from(codPathContentRefs)
    .innerJoin(codContentPool, eq(codPathContentRefs.contentPoolId, codContentPool.id))
    .where(eq(codPathContentRefs.codUserPathId, path.id))

  // Fetch progress
  const progress = await db.select().from(codUserContentProgress)
    .where(and(eq(codUserContentProgress.userId, userId), eq(codUserContentProgress.codUserPathId, path.id)))

  const progressByContent = new Map(progress.map((p) => [p.contentPoolId, p]))

  // Fetch all quiz results
  const quizResults = await db.select().from(codUserQuizResults)
    .where(and(eq(codUserQuizResults.userId, userId), eq(codUserQuizResults.codUserPathId, path.id)))

  // Fetch assessments to know which milestones have a pretest
  const assessments = await db.select({
    milestoneId: codMilestoneAssessments.milestoneId,
    pretestQuestions: codMilestoneAssessments.pretestQuestions,
  }).from(codMilestoneAssessments)
    .where(eq(codMilestoneAssessments.codUserPathId, path.id))

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

  type StoredMilestone = { milestoneId: string; title: string; order: number; rationale: string }
  const milestones = (path.milestones as StoredMilestone[])
    .sort((a, b) => a.order - b.order)
    .map((m, idx, arr) => {
      const milestoneRefs = refs.filter((r) => r.ref.milestoneId === m.milestoneId).sort((a, b) => a.ref.orderInMilestone - b.ref.orderInMilestone)
      const allComplete = milestoneRefs.length > 0 && milestoneRefs.every((r) => progressByContent.get(r.ref.contentPoolId)?.status === 'completed')
      const quiz = latestQuizByMilestone.get(m.milestoneId)
      const prevMilestone = arr[idx - 1]
      const prevQuizPassed = idx === 0 || latestQuizByMilestone.get(prevMilestone?.milestoneId ?? '')?.passed === true
      const unlocked = idx === 0 || prevQuizPassed
      const pretestCompleted = pretestCompletedByMilestone.has(m.milestoneId)

      return {
        ...m,
        unlocked,
        pretestCompleted,
        hasPretest: hasPretestByMilestone.get(m.milestoneId) ?? false,
        completed: allComplete && quiz?.passed === true,
        content: pretestCompleted
          ? milestoneRefs
              .filter((r) => {
                const style = (path.discoveryProfile as { learningStyle?: string } | null)?.learningStyle
                if (style === 'visual') return r.pool.type === 'youtube'
                if (style === 'reading') return r.pool.type === 'article'
                return true
              })
              .map((r) => ({
                ...r.pool,
                progress: progressByContent.get(r.ref.contentPoolId) ?? null,
                orderInMilestone: r.ref.orderInMilestone,
                rationale: r.ref.rationale,
              }))
          : [],
        quiz: quiz ? { score: quiz.score, total: quiz.totalQuestions, passed: quiz.passed, attempts: quiz.attemptNumber } : null,
        quizAvailable: pretestCompleted && allComplete && !quiz?.passed,
      }
    })

  return { path, milestones }
}

/** Marks a content item complete (or updates video progress). */
export async function completeContent(userId: string, pathId: string, contentPoolId: string, videoWatchPct?: number) {
  const [existing] = await db.select().from(codUserContentProgress)
    .where(and(
      eq(codUserContentProgress.userId, userId),
      eq(codUserContentProgress.contentPoolId, contentPoolId),
      eq(codUserContentProgress.codUserPathId, pathId),
    )).limit(1)

  if (existing) {
    await db.update(codUserContentProgress).set({
      status: 'completed',
      videoWatchPct: videoWatchPct ?? existing.videoWatchPct,
      completedAt: new Date(),
    }).where(eq(codUserContentProgress.id, existing.id))
  } else {
    await db.insert(codUserContentProgress).values({
      userId, contentPoolId, codUserPathId: pathId,
      status: 'completed',
      videoWatchPct: videoWatchPct ?? 0,
      completedAt: new Date(),
    })
  }
}

/** Returns pretest questions for a milestone (no correct answers in response). */
export async function getMilestonePretest(userId: string, pathId: string, milestoneId: string) {
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  const questions = (assessment.pretestQuestions as Array<{ question: string; options: string[]; correctIndex: number; explanation: string }> ?? [])
    .map(({ correctIndex: _ci, ...q }) => q)

  return { milestoneId, milestoneTitle: assessment.milestoneTitle, questions }
}

/** Submits pretest answers — no pass/fail gate, records the snapshot. */
export async function submitPretest(userId: string, pathId: string, milestoneId: string, answers: number[]) {
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  // Guard: only allow one pretest submission per milestone
  const [existing] = await db.select().from(codUserQuizResults).where(
    and(
      eq(codUserQuizResults.userId, userId),
      eq(codUserQuizResults.codUserPathId, pathId),
      eq(codUserQuizResults.milestoneId, milestoneId),
      eq(codUserQuizResults.quizType, 'pretest'),
    )
  ).limit(1)
  if (existing) return { alreadySubmitted: true, score: existing.score, total: existing.totalQuestions }

  const questions = assessment.pretestQuestions as Array<{ correctIndex: number }> ?? []
  const score = answers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctIndex ? 1 : 0), 0)

  await db.insert(codUserQuizResults).values({
    userId, codUserPathId: pathId, milestoneId,
    quizType: 'pretest',
    score, totalQuestions: questions.length,
    passed: true,
    attemptNumber: 1,
    answers,
  })

  return { score, total: questions.length }
}

/** Returns posttest questions for a milestone (no correct answers in response). */
export async function getMilestoneQuiz(userId: string, pathId: string, milestoneId: string) {
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')

  const questions = (assessment.questions as Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>)
    .map(({ correctIndex: _ci, ...q }) => q)

  return { milestoneId, milestoneTitle: assessment.milestoneTitle, questions }
}

/** Submits posttest answers, calculates score, stores result, gates milestone. */
export async function submitQuiz(userId: string, pathId: string, milestoneId: string, answers: number[]) {
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  const questions = assessment.questions as Array<{ correctIndex: number }>
  const score = answers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctIndex ? 1 : 0), 0)
  const total = questions.length
  const passed = score / total >= PASS_THRESHOLD

  const prevAttempts = await db.select().from(codUserQuizResults)
    .where(and(
      eq(codUserQuizResults.userId, userId),
      eq(codUserQuizResults.codUserPathId, pathId),
      eq(codUserQuizResults.milestoneId, milestoneId),
      eq(codUserQuizResults.quizType, 'posttest'),
    ))

  await db.insert(codUserQuizResults).values({
    userId, codUserPathId: pathId, milestoneId,
    quizType: 'posttest',
    score, totalQuestions: total, passed,
    attemptNumber: prevAttempts.length + 1,
    answers,
  })

  // Check if all milestones complete → flip path status
  if (passed) {
    const [pathRow] = await db.select().from(codUserPaths).where(eq(codUserPaths.id, pathId)).limit(1)
    const milestones = (pathRow?.milestones ?? []) as Array<{ milestoneId: string }>
    const allPosttests = await db.select().from(codUserQuizResults).where(
      and(eq(codUserQuizResults.userId, userId), eq(codUserQuizResults.codUserPathId, pathId), eq(codUserQuizResults.quizType, 'posttest'))
    )
    const passedMilestones = new Set(allPosttests.filter((r) => r.passed).map((r) => r.milestoneId))
    if (milestones.every((m) => passedMilestones.has(m.milestoneId))) {
      await db.update(codUserPaths).set({ status: 'completed', updatedAt: new Date() }).where(eq(codUserPaths.id, pathId))
    }
  }

  return { score, total, passed }
}
