import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { db } from '../db'
import { courses } from '../db/schema'
import { eq } from 'drizzle-orm'
import {
  startTestServer,
  stopTestServer,
  api,
  createTestUser,
  cleanupFixtureUsers,
  createCourse,
  type TestUser,
} from './helpers'

/**
 * Regression tests for the not-enrolled course view: GET /courses/:id used to
 * 403 (NOT_ENROLLED) for any course the learner hadn't enrolled in, which the
 * client could only render as "Course not found" — and its enroll screen
 * (keyed on isEnrolled=false) was unreachable. The endpoint now returns a
 * header-only preview for published courses, and a real 404 for missing or
 * unpublished ones.
 */

let user: TestUser
let publishedCourseId: string
let draftCourseId: string

type CourseDetail = {
  id: string
  title: string
  isEnrolled: boolean
  progressPercentage: number
  modules: unknown[]
}

beforeAll(async () => {
  await startTestServer()
  user = await createTestUser('coursepreview')

  publishedCourseId = (await createCourse({ withPreTest: true, withPostExam: true })).id

  const [draft] = await db.insert(courses)
    .values({ title: 'E2E draft course', status: 'draft' })
    .returning({ id: courses.id })
  draftCourseId = draft!.id
})

afterAll(async () => {
  await db.delete(courses).where(eq(courses.id, draftCourseId))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('course preview for non-enrolled learners', () => {
  it('returns a header-only preview instead of a 403', async () => {
    const res = await api<{ success: boolean; data: CourseDetail }>(
      'GET', `/api/lms/courses/${publishedCourseId}`, { token: user.token },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.isEnrolled).toBe(false)
    expect(res.body.data.modules).toEqual([])
    expect(res.body.data.progressPercentage).toBe(0)
    expect(res.body.data.title.length).toBeGreaterThan(0)
  })

  it('shows the outline, but no lesson content or answers', async () => {
    const res = await api<{ data: CourseDetail & { preview: { units: { title: string }[]; hasPreTest: boolean; hasFinalExam: boolean } } }>(
      'GET', `/api/lms/courses/${publishedCourseId}`, { token: user.token },
    )
    const p = res.body.data.preview
    expect(p.units.map((u) => u.title)).toEqual(['Unit 1', 'Unit 2'])
    expect(p.hasPreTest).toBe(true)
    expect(p.hasFinalExam).toBe(true)
    const raw = JSON.stringify(res.body)
    expect(raw).not.toContain('Hello') // the text block's body
    expect(raw).not.toMatch(/correctIndex|correctAnswer|explanation/)
  })

  it('returns the full enrolled view after enrolling', async () => {
    const enroll = await api('POST', `/api/lms/courses/${publishedCourseId}/enroll`, { token: user.token })
    expect(enroll.status).toBe(201)

    const res = await api<{ success: boolean; data: CourseDetail }>(
      'GET', `/api/lms/courses/${publishedCourseId}`, { token: user.token },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.isEnrolled).toBe(true)
    expect(res.body.data.modules.length).toBeGreaterThan(0)
  })

  it('404s for an unpublished course', async () => {
    const res = await api<{ error?: string }>(
      'GET', `/api/lms/courses/${draftCourseId}`, { token: user.token },
    )
    expect(res.status).toBe(404)
  })

  it('404s for a course that does not exist', async () => {
    const res = await api<{ error?: string }>(
      'GET', `/api/lms/courses/${crypto.randomUUID()}`, { token: user.token },
    )
    expect(res.status).toBe(404)
  })
})
