import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  assessmentAttempts,
  bothContentPool,
  bothMilestoneAssessments,
  bothPathBlockRefs,
  bothPathContentRefs,
  bothUserPaths,
  codContentPool,
  codMilestoneAssessments,
  codPathContentRefs,
  codUserPaths,
  codUserQuizResults,
} from '../db/schema'
import { startTestServer, stopTestServer, api, cleanup, createCourse, createUser, enrol, type TestCourse, type TestUser } from './helpers'

/**
 * Content on Demand and Blended journeys check every learner write against the same milestone
 * state the path view shows: an item counts only if it is in the learner's path and visible in an
 * unlocked milestone with its pre-test done; a pre-test only on an unlocked milestone; a quiz only
 * when the view says it is available (content done, not yet passed), and racing submissions still
 * get distinct attempt numbers. Course answer keys never reach a learner's path. The tutor's
 * "Start over" keeps exam attempts, so it can't reopen a final exam that ran out of attempts.
 * (From SMEEP 9a0d5f4, without simulations, which AI Amplify doesn't have.)
 */

type Err = { error: { code: string } }
const QUESTIONS = Array.from({ length: 4 }, (_, i) => ({
  question: `Q${i + 1}`,
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 1,
  explanation: 'fixture',
}))
const RIGHT = [1, 1, 1, 1]
const WRONG = [0, 0, 0, 0]
const M1 = 'gate-m1'
const M2 = 'gate-m2'
const milestones = [
  { milestoneId: M1, title: 'One', rationale: 'fixture', order: 1 },
  { milestoneId: M2, title: 'Two', rationale: 'fixture', order: 2 },
]
const tag = Math.random().toString(36).slice(2, 10)

let learner: TestUser
let course: TestCourse

beforeAll(async () => {
  await startTestServer()
  learner = await createUser('sme', 'E2E journey gates')
  course = await createCourse({ withPostExam: true })
})

afterAll(async () => {
  await db.delete(assessmentAttempts).where(eq(assessmentAttempts.userId, learner.id))
  await db.delete(codContentPool).where(sql`${codContentPool.url} like ${`https://example.test/gates-${tag}/%`}`)
  await db.delete(bothContentPool).where(sql`${bothContentPool.url} like ${`https://example.test/gates-${tag}/%`}`)
  await cleanup()
  await stopTestServer()
})

// ── Content on Demand ─────────────────────────────────────────────────────────

describe('Content on Demand', () => {
  let pathId: string
  let m1Item: string
  let m2Item: string
  let strayItem: string

  beforeAll(async () => {
    const [path] = await db.insert(codUserPaths)
      .values({ userId: learner.id, status: 'active', milestones })
      .returning({ id: codUserPaths.id })
    pathId = path!.id
    const pool = await db.insert(codContentPool).values(['m1', 'm2', 'stray'].map((k) => ({
      url: `https://example.test/gates-${tag}/cod-${k}`, type: 'article' as const, title: k, sourceQuery: 'fixture',
    }))).returning({ id: codContentPool.id })
    ;[m1Item, m2Item, strayItem] = pool.map((p) => p.id) as [string, string, string]
    await db.insert(codPathContentRefs).values([
      { codUserPathId: pathId, contentPoolId: m1Item, milestoneId: M1, orderInMilestone: 1 },
      { codUserPathId: pathId, contentPoolId: m2Item, milestoneId: M2, orderInMilestone: 1 },
    ])
    await db.insert(codMilestoneAssessments).values([M1, M2].map((m) => ({
      codUserPathId: pathId, milestoneId: m, milestoneTitle: m, pretestQuestions: QUESTIONS, questions: QUESTIONS,
    })))
  })

  const complete = (contentId: string) =>
    api<Err>('POST', `/api/lms/cod/content/${contentId}/complete`, { token: learner.token, body: { pathId } })
  const pretest = (m: string) =>
    api<Err>('POST', `/api/lms/cod/milestones/${m}/pretest/submit`, { token: learner.token, body: { pathId, answers: RIGHT } })
  const quiz = (m: string, answers = RIGHT) =>
    api<Err & { data: { passed: boolean } }>('POST', `/api/lms/cod/milestones/${m}/quiz/submit`, { token: learner.token, body: { pathId, answers } })

  it("refuses content that is not in the learner's path", async () => {
    const res = await complete(strayItem)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('ITEM_NOT_IN_PATH')
  })

  it('refuses content, the pre-test and the quiz of a locked milestone', async () => {
    expect((await complete(m2Item)).status).toBe(409)
    expect((await pretest(M2)).status).toBe(409)
    expect((await quiz(M2)).status).toBe(409)
  })

  it("refuses content before the milestone's pre-test is done", async () => {
    const res = await complete(m1Item)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('MILESTONE_LOCKED')
  })

  it('refuses the quiz before the content is done', async () => {
    expect((await pretest(M1)).status).toBe(200)
    const early = await quiz(M1)
    expect(early.status).toBe(409)
    expect(early.body.error.code).toBe('QUIZ_NOT_AVAILABLE')
  })

  it('gives racing quiz attempts distinct numbers', async () => {
    expect((await complete(m1Item)).status).toBe(200)
    const results = await Promise.all(Array.from({ length: 5 }, () => quiz(M1, WRONG)))
    expect(results.every((r) => r.status === 200)).toBe(true)
    const rows = await db.select({ n: codUserQuizResults.attemptNumber }).from(codUserQuizResults).where(and(
      eq(codUserQuizResults.codUserPathId, pathId), eq(codUserQuizResults.milestoneId, M1), eq(codUserQuizResults.quizType, 'posttest'),
    ))
    expect(rows.map((r) => r.n).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('takes no more quiz attempts once passed, and the next milestone then opens', async () => {
    expect((await quiz(M1)).body.data.passed).toBe(true)
    expect((await quiz(M1)).status).toBe(409)
    expect((await pretest(M2)).status).toBe(200)
  })

  it('caps quiz answers at 50', async () => {
    const res = await quiz(M2, Array.from({ length: 51 }, () => 1))
    expect([400, 422]).toContain(res.status)
  })
})

// ── Blended ─────────────────────────────────────────────────────────────────

describe('Blended', () => {
  let pathId: string
  let m1Item: string
  let m2Item: string

  beforeAll(async () => {
    const [path] = await db.insert(bothUserPaths)
      .values({ userId: learner.id, status: 'active', milestones })
      .returning({ id: bothUserPaths.id })
    pathId = path!.id
    const pool = await db.insert(bothContentPool).values(['m1', 'm2'].map((k) => ({
      url: `https://example.test/gates-${tag}/both-${k}`, type: 'article' as const, title: k, sourceQuery: 'fixture',
    }))).returning({ id: bothContentPool.id })
    ;[m1Item, m2Item] = pool.map((p) => p.id) as [string, string]
    await db.insert(bothPathContentRefs).values([
      { bothUserPathId: pathId, contentPoolId: m1Item, milestoneId: M1, orderInMilestone: 1 },
      { bothUserPathId: pathId, contentPoolId: m2Item, milestoneId: M2, orderInMilestone: 1 },
    ])
    // A course question block (with an answer key) inside milestone 1.
    await db.insert(bothPathBlockRefs).values({ bothUserPathId: pathId, blockId: course.blocks[0]!.questionBlockId, milestoneId: M1, orderInMilestone: 2 })
    await db.insert(bothMilestoneAssessments).values([M1, M2].map((m) => ({
      bothUserPathId: pathId, milestoneId: m, milestoneTitle: m, pretestQuestions: QUESTIONS, questions: QUESTIONS,
    })))
  })

  const complete = (itemId: string, milestoneId: string, itemType: 'external' | 'internal' = 'external') =>
    api<Err>('POST', `/api/lms/both/items/${itemId}/complete`, { token: learner.token, body: { itemType, pathId, milestoneId } })
  const pretest = (m: string) =>
    api<Err>('POST', `/api/lms/both/milestones/${m}/pretest/submit`, { token: learner.token, body: { pathId, answers: RIGHT } })
  const quiz = (m: string) =>
    api<Err>('POST', `/api/lms/both/milestones/${m}/quiz/submit`, { token: learner.token, body: { pathId, answers: RIGHT } })

  it('refuses items, the pre-test and the quiz of a locked milestone', async () => {
    expect((await complete(m2Item, M2)).status).toBe(409)
    expect((await pretest(M2)).status).toBe(409)
    expect((await quiz(M2)).status).toBe(409)
  })

  it('refuses items before the pre-test, and the quiz before the content', async () => {
    expect((await complete(m1Item, M1)).status).toBe(409)
    expect((await pretest(M1)).status).toBe(200)
    expect((await complete(m1Item, M1)).status).toBe(200)
    const early = await quiz(M1)
    expect(early.status).toBe(409)
    expect(early.body.error.code).toBe('QUIZ_NOT_AVAILABLE')
  })

  it("never sends a course question's answer key in the path", async () => {
    const res = await api<{ data: { milestones: Array<{ content: Array<{ questions?: Array<Record<string, unknown>> }> }> } }>(
      'GET', '/api/lms/both/path', { token: learner.token },
    )
    expect(res.status).toBe(200)
    const questions = res.body.data.milestones.flatMap((m) => m.content).flatMap((c) => c.questions ?? [])
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((q) => q.correctIndex == null && q.correctBool == null)).toBe(true)
  })
})

// ── The tutor's Start over ────────────────────────────────────────────────────

describe('tutor Start over', () => {
  it('keeps exam attempts, so a final exam out of attempts stays closed', async () => {
    await enrol(learner.id, course.id)
    // The learner has used an attempt (a fail).
    await db.insert(assessmentAttempts).values({
      userId: learner.id, assessmentId: course.postAssessmentId!, attemptNumber: 1, score: 10, passed: false, answers: {}, completedAt: new Date(),
    })

    const res = await api('POST', `/api/ai/tutor/courses/${course.id}/reset`, { token: learner.token })
    expect(res.status).toBe(200)

    const left = await db.select().from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.userId, learner.id), eq(assessmentAttempts.assessmentId, course.postAssessmentId!)))
    expect(left).toHaveLength(1)
  })
})
