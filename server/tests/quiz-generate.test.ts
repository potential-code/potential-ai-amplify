import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users, courses } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, signIn, type TestUser } from './helpers'

/**
 * AI quiz drafts (POST /api/lms/admin/quiz/generate): admin only, valid input,
 * and a clear message when a course has too little text to write from. The
 * writing itself is potential-ai's (covered by its quizGen tests).
 */

let learner: TestUser
let adminToken: string
let courseId: string
let assessmentId: string

const gen = (body: object, token = adminToken) =>
  api<{ success: boolean; error?: { code?: string; message?: string } }>('POST', '/api/lms/admin/quiz/generate', { token, body })

beforeAll(async () => {
  await startTestServer()
  learner = await createTestUser('quiz')
  const admin = await createTestUser('quiz-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)
  const course = await api<{ data: { id: string } }>('POST', '/api/lms/admin/courses', { token: adminToken, body: { title: 'UAT quiz course (empty)' } })
  courseId = course.body.data.id
  const a = await api<{ data: { id: string } }>('POST', `/api/lms/admin/courses/${courseId}/assessments`, {
    token: adminToken,
    body: { title: 'Final exam', assessmentType: 'post' },
  })
  assessmentId = a.body.data.id
})

afterAll(async () => {
  if (courseId) await db.delete(courses).where(eq(courses.id, courseId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('quiz drafts', () => {
  it('is admin only', async () => {
    expect((await gen({ assessmentId, count: 5 }, learner.token)).status).toBe(403)
  })

  it('needs an assessment and a sensible count and type', async () => {
    expect((await gen({ count: 5 })).status).toBe(422)
    expect((await gen({ assessmentId, count: 50 })).status).toBe(422)
    expect((await gen({ assessmentId, format: 'essay' })).status).toBe(422)
  })

  it('says when the course has too little text to write from', async () => {
    const res = await gen({ assessmentId, count: 5 })
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('NOT_ENOUGH_CONTENT')
    expect(res.body.error?.message).toContain('Add text or video transcripts')
  })

  it('404s for an unknown assessment', async () => {
    expect((await gen({ assessmentId: crypto.randomUUID() })).status).toBe(404)
  })
})
