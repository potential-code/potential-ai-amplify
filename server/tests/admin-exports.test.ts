import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, isNotNull } from 'drizzle-orm'
import { strFromU8, unzipSync } from 'fflate'
import { db } from '../db'
import { users, assessmentAttempts } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, createCourse, signIn, ORIGIN, type TestUser } from './helpers'

/**
 * Admin exports (GET /api/admin/exports/:dataset) and learning gain
 * (GET /api/admin/analytics/learning-gain).
 */

let base: string
let learner: TestUser
let adminToken: string

beforeAll(async () => {
  base = await startTestServer()
  learner = await createTestUser('export-learner')
  // A name a spreadsheet would run as a formula.
  await db.update(users).set({ fullName: '=HYPERLINK("http://x","Click")', company: 'Lina Bakery' }).where(eq(users.id, learner.id))
  const admin = await createTestUser('export-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

const download = (dataset: string, format: string, token = adminToken) =>
  fetch(`${base}/api/admin/exports/${dataset}?format=${format}`, { headers: { Origin: ORIGIN, Cookie: token } })

describe('admin exports', () => {
  it('is admin only', async () => {
    expect((await download('learners', 'csv', learner.token)).status).toBe(403)
  })

  it('404s for an unknown dataset', async () => {
    expect((await download('passwords', 'csv')).status).toBe(404)
  })

  for (const dataset of ['learners', 'course-progress', 'learning-gain', 'certificates', 'redemptions', 'mentor-sessions']) {
    it(`exports ${dataset} as CSV and Excel`, async () => {
      const csv = await download(dataset, 'csv')
      expect(csv.status).toBe(200)
      expect(csv.headers.get('content-type')).toContain('text/csv')
      expect(csv.headers.get('content-disposition')).toContain(`ai-amplify-${dataset}-`)
      const text = await csv.text()
      expect(text.split('\r\n')[0].length).toBeGreaterThan(5)

      const xlsx = await download(dataset, 'xlsx')
      expect(xlsx.status).toBe(200)
      // An .xlsx is a zip: one sheet, a header row, and filters on it when there is data.
      const files = unzipSync(new Uint8Array(await xlsx.arrayBuffer()))
      const sheets = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
      expect(sheets).toHaveLength(1)
      const sheet = strFromU8(files[sheets[0]!]!)
      const rows = (sheet.match(/<row\b/g) ?? []).length
      expect(rows).toBeGreaterThanOrEqual(1)
      if (rows > 1) expect(sheet).toMatch(/<autoFilter ref="A1:[A-Z]+1"\/>/)
      expect(sheet).toContain('state="frozen"')
    })
  }

  it('keeps names that look like formulas as text', async () => {
    const bytes = new Uint8Array(await (await download('learners', 'csv')).arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // BOM: Excel reads UTF-8
    const text = new TextDecoder().decode(bytes)
    const row = text.split('\r\n').find((l) => l.includes('HYPERLINK'))
    expect(row).toBeDefined()
    expect(row!.startsWith(`"'=HYPERLINK`)).toBe(true)
    expect(row).toContain('Lina Bakery')
  })
})

describe('learning gain', () => {
  it('compares the first pre-test with the best final exam', async () => {
    // A course that has both a pre-test and a final exam.
    const course = await createCourse({ withPreTest: true, withPostExam: true })
    const pre = { id: course.preAssessmentId!, courseId: course.id }
    const post = { id: course.postAssessmentId! }

    const before = (await api<{ data: { pairs: number } }>('GET', '/api/admin/analytics/learning-gain', { token: adminToken })).body.data.pairs
    const t = Date.now()
    await db.insert(assessmentAttempts).values([
      { userId: learner.id, assessmentId: pre.id, attemptNumber: 1, score: 40, passed: false, completedAt: new Date(t - 3_000) },
      { userId: learner.id, assessmentId: pre.id, attemptNumber: 2, score: 90, passed: true, completedAt: new Date(t - 2_000) },
      { userId: learner.id, assessmentId: post.id, attemptNumber: 1, score: 70, passed: true, completedAt: new Date(t - 1_000) },
      { userId: learner.id, assessmentId: post.id, attemptNumber: 2, score: 85, passed: true, completedAt: new Date(t) },
    ])

    const res = await api<{ data: { pairs: number; courses: { courseId: string; learners: number }[] } }>(
      'GET', '/api/admin/analytics/learning-gain', { token: adminToken },
    )
    expect(res.status).toBe(200)
    expect(res.body.data.pairs).toBe(before + 1)
    expect(res.body.data.courses.some((c) => c.courseId === pre.courseId)).toBe(true)

    // This learner's row: first pre-test (40, not the later 90) vs best final (85).
    const text = await (await download('learning-gain', 'csv')).text()
    const row = text.split('\r\n').find((l) => l.includes(learner.email))
    expect(row).toContain(',40,85,45,')

    const done = await db.select().from(assessmentAttempts).where(and(eq(assessmentAttempts.userId, learner.id), isNotNull(assessmentAttempts.completedAt)))
    expect(done.length).toBe(4)
  })
})
