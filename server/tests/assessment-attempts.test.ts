import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { assessmentAttempts, assessmentQuestions, assessments, courseEnrollments, courses } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, type TestUser } from './helpers'

/**
 * Course tests are for learners enrolled in a published course: anyone else gets a 404 for the
 * questions, the summary and a submission. Submissions are settled one at a time per learner and
 * test, so a double-click (or a script) can't push past the attempt limit, land after a pass, or
 * surface a raw 500.
 */

type Err = { error: { code: string } }

let learner: TestUser
let outsider: TestUser
const created: string[] = []

async function fixtureTest(status: 'published' | 'draft', maxAttempts: number) {
  const [course] = await db.insert(courses).values({ title: `Attempts fixture ${status}`, status }).returning({ id: courses.id })
  created.push(course!.id)
  const [test] = await db.insert(assessments).values({
    courseId: course!.id, title: 'Final', assessmentType: 'post', isGraded: true, passingScore: 100, maxAttempts, showAnswers: true,
  }).returning({ id: assessments.id })
  const [q] = await db.insert(assessmentQuestions).values({
    assessmentId: test!.id, questionText: 'Pick A', options: ['A', 'B'], correctAnswer: 0,
  }).returning({ id: assessmentQuestions.id })
  return { courseId: course!.id, assessmentId: test!.id, questionId: q!.id }
}

const enrol = (userId: string, courseId: string) =>
  db.insert(courseEnrollments).values({ userId, courseId, status: 'active' }).onConflictDoNothing()

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('attempts')
  outsider = await createTestUser('attempts-out')
})

afterAll(async () => {
  for (const id of created) await db.delete(courses).where(eq(courses.id, id))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('who can take a course test', () => {
  it('is a 404 for a learner not enrolled in the course', async () => {
    const t = await fixtureTest('published', 0)
    await enrol(learner.id, t.courseId)
    expect((await api<Err>('GET', `/api/lms/assessments/${t.assessmentId}/questions`, { token: outsider.token })).status).toBe(404)
    expect((await api<Err>('GET', `/api/lms/assessments/${t.assessmentId}/summary`, { token: outsider.token })).status).toBe(404)
    const submit = await api<Err>('POST', `/api/lms/assessments/${t.assessmentId}/attempts`, {
      token: outsider.token, body: { answers: { [t.questionId]: 0 } },
    })
    expect(submit.status).toBe(404)
    const stored = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.userId, outsider.id))
    expect(stored).toHaveLength(0)
  })

  it('is a 404 for a test in an unpublished course, even when enrolled', async () => {
    const t = await fixtureTest('draft', 0)
    await enrol(learner.id, t.courseId)
    expect((await api<Err>('GET', `/api/lms/assessments/${t.assessmentId}/questions`, { token: learner.token })).status).toBe(404)
    expect((await api<Err>('POST', `/api/lms/assessments/${t.assessmentId}/attempts`, {
      token: learner.token, body: { answers: { [t.questionId]: 0 } },
    })).status).toBe(404)
  })
})

describe('submitting', () => {
  it('lets racing submissions use exactly the attempts allowed, never a 500', async () => {
    const t = await fixtureTest('published', 2)
    await enrol(learner.id, t.courseId)
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      api<Err>('POST', `/api/lms/assessments/${t.assessmentId}/attempts`, {
        token: learner.token, body: { answers: { [t.questionId]: 1 } }, // wrong, so no pass
      })))
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 201, 429, 429, 429, 429])
    const rows = await db.select({ n: assessmentAttempts.attemptNumber }).from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.userId, learner.id), eq(assessmentAttempts.assessmentId, t.assessmentId)))
    expect(rows.map((r) => r.n).sort()).toEqual([1, 2])
  })

  it('takes nothing more once passed, even from racing submissions', async () => {
    const t = await fixtureTest('published', 0)
    await enrol(learner.id, t.courseId)
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      api<Err>('POST', `/api/lms/assessments/${t.assessmentId}/attempts`, {
        token: learner.token, body: { answers: { [t.questionId]: 0 } }, // right: a pass
      })))
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409])
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_PASSED')).toBe(true)
  })

  it('caps the size of the answers', async () => {
    const t = await fixtureTest('published', 0)
    await enrol(learner.id, t.courseId)
    const answers = Object.fromEntries(Array.from({ length: 201 }, () => [crypto.randomUUID(), 0]))
    const res = await api<Err>('POST', `/api/lms/assessments/${t.assessmentId}/attempts`, { token: learner.token, body: { answers } })
    expect(res.status).toBe(422)
  })
})
