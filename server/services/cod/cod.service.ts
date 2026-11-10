import { db } from '../../db'
import {
  codContentPool, codUserPaths, codPathContentRefs,
  codMilestoneAssessments, codUserQuizResults, codUserContentProgress,
} from '../../db/schema'
import { eq, and, desc, gt, sql } from 'drizzle-orm'
import { AppError } from '../../utils/app-error'
import { recordLearningStep } from '../streak.service'
import { callCodPathBuilder, type CodPathBuilderInput } from '../learning/codAiClient'

const PASS_THRESHOLD = 0.7

/**
 * Every call that names a path checks it belongs to the signed-in learner;
 * path ids come from the browser and must never reach someone else's path.
 */
async function assertOwnsPath(userId: string, pathId: string): Promise<void> {
  const [row] = await db.select({ id: codUserPaths.id }).from(codUserPaths)
    .where(and(eq(codUserPaths.id, pathId), eq(codUserPaths.userId, userId))).limit(1)
  if (!row) throw new AppError('Learning path not found', 404, 'PATH_NOT_FOUND')
}

/** Creates a 'building' path row and triggers async AI path generation. */
export async function initiateCodPath(
  userId: string,
  profile: CodPathBuilderInput['profile'],
): Promise<{ pathId: string }> {
  // One build at a time per learner: each starts an AI job of up to ten
  // minutes. A build older than 15 minutes is treated as dead (e.g. the server
  // restarted mid-build), so a learner is never stuck.
  const [building] = await db.select({ id: codUserPaths.id }).from(codUserPaths)
    .where(and(
      eq(codUserPaths.userId, userId),
      eq(codUserPaths.status, 'building'),
      gt(codUserPaths.createdAt, new Date(Date.now() - 15 * 60 * 1000)),
    ))
    .limit(1)
  if (building) {
    throw new AppError('Your learning path is already being built. Please wait for it to finish.', 409, 'PATH_BUILDING')
  }

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
  return codPathView(userId, path)
}

/**
 * A path as the learner sees it: each milestone's lock, pre-test, content and quiz state. The
 * path page shows this, and every learner write checks against it (see the gates below), so what
 * a write accepts is exactly what the page offers.
 */
async function codPathView(userId: string, path: typeof codUserPaths.$inferSelect) {
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

// ── Gates: every learner write is checked against the path view ─────────────

/** The learner's own path, as the path page shows it. 404 for anyone else's. */
async function ownPathView(userId: string, pathId: string) {
  const [path] = await db.select().from(codUserPaths)
    .where(and(eq(codUserPaths.id, pathId), eq(codUserPaths.userId, userId))).limit(1)
  if (!path) throw new AppError('Learning path not found', 404, 'PATH_NOT_FOUND')
  return codPathView(userId, path)
}

type CodMilestoneView = Awaited<ReturnType<typeof codPathView>>['milestones'][number]

function milestoneIn(view: Awaited<ReturnType<typeof codPathView>>, milestoneId: string): CodMilestoneView {
  const milestone = view.milestones.find((m) => m.milestoneId === milestoneId)
  if (!milestone) throw new AppError('Milestone not found', 404, 'MILESTONE_NOT_FOUND')
  return milestone
}

const milestoneLocked = () =>
  new AppError('Finish the earlier milestones first', 409, 'MILESTONE_LOCKED')

const quizNotAvailable = () =>
  new AppError('This quiz isn\'t open: finish the milestone first, or it\'s already passed', 409, 'QUIZ_NOT_AVAILABLE')

/**
 * The milestone an item is shown in, or why it can't be worked on: 404 when the item isn't in
 * this path at all, 409 when it is but its milestone isn't open yet (locked, or the pre-test not
 * done), exactly as the path page hides it.
 */
async function openMilestoneForContent(userId: string, pathId: string, contentPoolId: string): Promise<CodMilestoneView> {
  const view = await ownPathView(userId, pathId)
  const shown = view.milestones.find((m) => m.unlocked && m.pretestCompleted && m.content.some((c: { id: string }) => c.id === contentPoolId))
  if (shown) return shown
  const [ref] = await db.select({ id: codPathContentRefs.id }).from(codPathContentRefs)
    .where(and(eq(codPathContentRefs.codUserPathId, pathId), eq(codPathContentRefs.contentPoolId, contentPoolId))).limit(1)
  if (!ref) throw new AppError('This item is not part of your path', 404, 'ITEM_NOT_IN_PATH')
  throw milestoneLocked()
}

/**
 * Serialises a learner's writes to one milestone for the rest of the transaction, so "only once"
 * checks and attempt numbers can't race (two submits at once would otherwise both read the same
 * attempt count).
 */
async function lockMilestone(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string, pathId: string, milestoneId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`cod:${userId}:${pathId}:${milestoneId}`}, 0))`)
}

/** Marks a content item complete (or updates video progress). Only items the path page shows. */
export async function completeContent(userId: string, pathId: string, contentPoolId: string, videoWatchPct?: number) {
  await openMilestoneForContent(userId, pathId, contentPoolId)
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
  if (existing?.status !== 'completed') await recordLearningStep(userId)
}

/**
 * Saves where the learner is in a Content on Demand video, so they resume
 * there on any device. Watched % only goes up; a completed item stays completed.
 * Returns null when the path isn't the learner's own.
 */
export async function saveVideoPosition(userId: string, pathId: string, contentPoolId: string, positionSec: number, watchPct: number) {
  // Only for an item the learner can see: not someone else's path, nor an item outside theirs.
  const shown = await openMilestoneForContent(userId, pathId, contentPoolId).then(() => true, () => false)
  if (!shown) return null
  const [row] = await db.insert(codUserContentProgress)
    .values({ userId, contentPoolId, codUserPathId: pathId, status: 'in_progress', videoPositionSec: positionSec, videoWatchPct: watchPct })
    .onConflictDoUpdate({
      target: [codUserContentProgress.userId, codUserContentProgress.contentPoolId, codUserContentProgress.codUserPathId],
      set: {
        videoPositionSec: positionSec,
        videoWatchPct: sql`greatest(coalesce(${codUserContentProgress.videoWatchPct}, 0), ${watchPct})`,
        status: sql`case when ${codUserContentProgress.status} = 'not_started' then 'in_progress'::cod_content_progress_status else ${codUserContentProgress.status} end`,
      },
    })
    .returning({ videoPositionSec: codUserContentProgress.videoPositionSec, videoWatchPct: codUserContentProgress.videoWatchPct })
  return row ?? null
}


/** Returns pretest questions for a milestone (no correct answers in response). */
export async function getMilestonePretest(userId: string, pathId: string, milestoneId: string) {
  await assertOwnsPath(userId, pathId)
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  const questions = (assessment.pretestQuestions as Array<{ question: string; options: string[]; correctIndex: number; explanation: string }> ?? [])
    .map(({ correctIndex: _ci, explanation: _ex, ...q }) => q) // answers and explanations stay on the server

  return { milestoneId, milestoneTitle: assessment.milestoneTitle, questions }
}

/** Submits pretest answers — no pass/fail gate, records the snapshot. Unlocked milestones only. */
export async function submitPretest(userId: string, pathId: string, milestoneId: string, answers: number[]) {
  const milestone = milestoneIn(await ownPathView(userId, pathId), milestoneId)
  if (!milestone.unlocked) throw milestoneLocked()
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  const questions = assessment.pretestQuestions as Array<{ correctIndex: number }> ?? []
  const score = answers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctIndex ? 1 : 0), 0)

  // One pretest per milestone, checked under the milestone lock so two submits can't both land.
  const existing = await db.transaction(async (tx) => {
    await lockMilestone(tx, userId, pathId, milestoneId)
    const [prior] = await tx.select().from(codUserQuizResults).where(
      and(
        eq(codUserQuizResults.userId, userId),
        eq(codUserQuizResults.codUserPathId, pathId),
        eq(codUserQuizResults.milestoneId, milestoneId),
        eq(codUserQuizResults.quizType, 'pretest'),
      )
    ).limit(1)
    if (prior) return prior
    await tx.insert(codUserQuizResults).values({
      userId, codUserPathId: pathId, milestoneId,
      quizType: 'pretest',
      score, totalQuestions: questions.length,
      passed: true,
      attemptNumber: 1,
      answers,
    })
    return null
  })
  if (existing) return { alreadySubmitted: true, score: existing.score, total: existing.totalQuestions }

  await recordLearningStep(userId)
  return { score, total: questions.length }
}

/** Returns posttest questions for a milestone (no correct answers in response). */
export async function getMilestoneQuiz(userId: string, pathId: string, milestoneId: string) {
  await assertOwnsPath(userId, pathId)
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Quiz not found', 404, 'QUIZ_NOT_FOUND')

  const questions = (assessment.questions as Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>)
    .map(({ correctIndex: _ci, explanation: _ex, ...q }) => q) // answers and explanations stay on the server

  return { milestoneId, milestoneTitle: assessment.milestoneTitle, questions }
}

/**
 * Submits posttest answers, calculates score, stores result, gates milestone. Only when the path
 * page offers the quiz: milestone unlocked, pre-test done, content done, not yet passed.
 */
export async function submitQuiz(userId: string, pathId: string, milestoneId: string, answers: number[]) {
  const milestone = milestoneIn(await ownPathView(userId, pathId), milestoneId)
  if (!milestone.unlocked || !milestone.quizAvailable) throw quizNotAvailable()
  const [assessment] = await db.select().from(codMilestoneAssessments)
    .where(and(eq(codMilestoneAssessments.codUserPathId, pathId), eq(codMilestoneAssessments.milestoneId, milestoneId)))
    .limit(1)

  if (!assessment) throw new AppError('Assessment not found', 404, 'ASSESSMENT_NOT_FOUND')

  const questions = assessment.questions as Array<{ correctIndex: number }>
  const score = answers.reduce((acc, ans, i) => acc + (ans === questions[i]?.correctIndex ? 1 : 0), 0)
  const total = questions.length
  const passed = score / total >= PASS_THRESHOLD

  // Attempt numbers and "not yet passed" are settled under the milestone lock, so racing
  // submits get distinct numbers and none lands after a pass.
  await db.transaction(async (tx) => {
    await lockMilestone(tx, userId, pathId, milestoneId)
    const prevAttempts = await tx.select({ passed: codUserQuizResults.passed }).from(codUserQuizResults)
      .where(and(
        eq(codUserQuizResults.userId, userId),
        eq(codUserQuizResults.codUserPathId, pathId),
        eq(codUserQuizResults.milestoneId, milestoneId),
        eq(codUserQuizResults.quizType, 'posttest'),
      ))
    if (prevAttempts.some((a) => a.passed)) throw quizNotAvailable()
    await tx.insert(codUserQuizResults).values({
      userId, codUserPathId: pathId, milestoneId,
      quizType: 'posttest',
      score, totalQuestions: total, passed,
      attemptNumber: prevAttempts.length + 1,
      answers,
    })
  })
  await recordLearningStep(userId)

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
