import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { assessmentAttempts } from '../db/schema'
import { getCourseState, getQuiz, submitQuiz } from '../services/tutor.service'
import { startTestServer, stopTestServer, api, cleanup, createCourse, createUser, enrol, type TestCourse, type TestUser } from './helpers'

/**
 * Interactive Learning (the Multi Learning tutor, from SMEEP): it follows the
 * course page. A course's pre-test comes before its first unit, the tutor
 * never sees answer keys, and it can't tick off a block the course page
 * wouldn't (a question block needs its answers saved first).
 */

let learner: TestUser
let course: TestCourse

beforeAll(async () => {
  await startTestServer()
  learner = await createUser('sme', 'E2E tutor')
  course = await createCourse({ withPreTest: true, withPostExam: true })
  await enrol(learner.id, course.id)
})

afterAll(async () => {
  await db.delete(assessmentAttempts).where(eq(assessmentAttempts.userId, learner.id))
  await cleanup()
  await stopTestServer()
})

describe('Interactive Learning', () => {
  it('opens the course with the pre-test', async () => {
    const state = await getCourseState(learner.id, { courseId: course.id, lang: 'en' })
    expect(state.featuredCourseId).toBeNull()
    expect(state.next).toMatchObject({ action: 'show_quiz', assessmentId: course.preAssessmentId, pretest: true })
    expect(state.active?.preTest).toMatchObject({ assessmentId: course.preAssessmentId, done: false })
  })

  it('serves the pre-test without answers, records it, then moves on to the first unit', async () => {
    const quiz = await getQuiz(learner.id, course.preAssessmentId!, 'en')
    expect(quiz.kind).toBe('pre')
    expect(JSON.stringify(quiz)).not.toContain('correctAnswer')
    expect(JSON.stringify(quiz)).not.toContain('explanation')

    // Every answer wrong still counts: a pre-test has no pass mark.
    const result = await submitQuiz(learner.id, course.preAssessmentId!, quiz.questions.map((q) => ({ questionId: q.questionId, selectedIndex: 99 })))
    expect(result.kind).toBe('pre')

    const state = await getCourseState(learner.id, { courseId: course.id, lang: 'en' })
    expect(state.active?.preTest?.done).toBe(true)
    expect(state.next).not.toMatchObject({ pretest: true })
  })

  it("doesn't let the tutor tick off a question block whose answers aren't saved", async () => {
    const res = await api('POST', '/api/ai/tutor/progress/complete', {
      token: learner.token,
      body: { learningBlockIds: [course.blocks[0]!.questionBlockId] },
    })
    expect(res.status).toBe(409)
  })

  it('needs a session', async () => {
    expect((await api('GET', '/api/ai/tutor/state')).status).toBe(401)
  })
})
