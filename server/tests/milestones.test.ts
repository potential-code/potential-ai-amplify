import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { courseCertificates, notifications, userBadges } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, createCourse, cleanupFixtureUsers, type TestUser } from './helpers'
import { recordLearningStep } from '../services/streak.service'
import { checkBadges } from '../services/achievements.service'

/**
 * GET /api/me/milestones: the browser's "newly earned" signal for the GTM
 * events first_lesson_completed and course_certificate. AI Amplify ships with
 * learner notifications off (no bell), so this reads the rows the server
 * writes exactly once instead: the first_step badge and each certificate.
 * Only keys and times: no course name, certificate number or anything else.
 */

let learner: TestUser
let other: TestUser
let courseId: string

type Milestones = { data: { items: { key: string; earnedAt: string; ageSeconds: number }[] } }
const milestones = (token: string) => api<Milestones>('GET', '/api/me/milestones', { token })

beforeAll(async () => {
  // The production setting: learner notifications (the bell) switched off.
  delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
  await startTestServer()
  learner = await createTestUser('ms')
  other = await createTestUser('ms-other')
  courseId = (await createCourse()).id
})

afterAll(async () => {
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('learner milestones', () => {
  it('needs a signed-in user', async () => {
    expect((await api('GET', '/api/me/milestones', {})).status).toBe(401)
  })

  it('is empty before anything is earned', async () => {
    const res = await milestones(learner.token)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toEqual([])
  })

  it('lists the first_step badge once earned, while learner notifications are off', async () => {
    await recordLearningStep(learner.id)
    await checkBadges(learner.id)
    // The bell stays silent for learners...
    const bell = await db.select().from(notifications).where(eq(notifications.userId, learner.id))
    expect(bell).toEqual([])
    // ...but the badge row is the signal.
    const [badge] = await db.select().from(userBadges).where(eq(userBadges.userId, learner.id))
    expect(badge?.badge).toBe('first_step')
    const items = (await milestones(learner.token)).body.data.items
    expect(items).toEqual([{ key: 'badge:first_step', earnedAt: badge!.earnedAt.toISOString(), ageSeconds: expect.any(Number) }])
    // Just earned, by the database's own clock (whatever its time zone).
    expect(items[0]!.ageSeconds).toBeGreaterThanOrEqual(0)
    expect(items[0]!.ageSeconds).toBeLessThan(60)
  })

  it('lists each certificate by id only, and never other badges', async () => {
    await db.insert(userBadges).values({ userId: learner.id, badge: 'streak_7' })
    const [cert] = await db
      .insert(courseCertificates)
      .values({ userId: learner.id, courseId, certificateNumber: `CERT-E2E-${Date.now()}` })
      .returning()
    const res = await milestones(learner.token)
    const items = res.body.data.items
    expect(items.map((i) => i.key).sort()).toEqual(['badge:first_step', `certificate:${cert!.id}`])
    expect(items.find((i) => i.key.startsWith('certificate:'))!.earnedAt).toBe(cert!.issuedAt.toISOString())
    for (const i of items) expect(Object.keys(i).sort()).toEqual(['ageSeconds', 'earnedAt', 'key'])
    expect(JSON.stringify(res.body)).not.toContain(cert!.certificateNumber)
  })

  it("shows only the signed-in learner's own milestones", async () => {
    expect((await milestones(other.token)).body.data.items).toEqual([])
  })
})
