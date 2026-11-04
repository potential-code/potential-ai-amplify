import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { users, notifications, mentorAvailabilitySlots, mentorSessions, userCourseProgress, courses, liveEvents } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, createCourse, cleanupFixtureUsers, signIn, type TestUser } from './helpers'
import { notify } from '../services/notifications.service'
import { runReminders } from '../services/reminders.service'

/**
 * Notifications (the bell): the API, the triggers, and the reminder timer's
 * session reminders and course nudges, each sent once.
 */

let learner: TestUser
let other: TestUser
let mentor: TestUser
let adminToken: string

type List = { data: { items: { id: string; type: string; title: string; readAt: string | null }[]; unread: number } }
const list = (token: string) => api<List>('GET', '/api/me/notifications', { token })

beforeAll(async () => {
  // These tests cover learner notifications as they work once switched on;
  // the last test checks they stay off by default.
  process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
  await startTestServer()
  learner = await createTestUser('notif')
  other = await createTestUser('notif-other')
  mentor = await createTestUser('notif-mentor')
  await db.update(users).set({ role: 'mentor' }).where(eq(users.id, mentor.id))
  // A session carries the role it started with: sign in again as a mentor.
  mentor = { ...mentor, token: await signIn(mentor.email, mentor.password) }
  const admin = await createTestUser('notif-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)
})

afterAll(async () => {
  delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
  await db.delete(liveEvents).where(like(liveEvents.title, 'UAT notif event%'))
  // Publishing the test event notified every learner in this database.
  await db.delete(notifications).where(like(notifications.title, 'New event: UAT notif event%'))
  await db.delete(mentorSessions).where(eq(mentorSessions.mentorUserId, mentor.id))
  await db.delete(mentorAvailabilitySlots).where(eq(mentorAvailabilitySlots.mentorUserId, mentor.id))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('notifications API', () => {
  it('lists, counts unread and marks read', async () => {
    await notify(learner.id, { type: 'certificate', title: 'Test one', dedupeKey: 'test:one' })
    await notify(learner.id, { type: 'certificate', title: 'Test one again', dedupeKey: 'test:one' }) // same key: skipped
    await notify(learner.id, { type: 'certificate', title: 'Test two' })
    let res = await list(learner.token)
    expect(res.status).toBe(200)
    expect(res.body.data.items.filter((n) => n.title.startsWith('Test')).length).toBe(2)
    const unread = res.body.data.unread
    const first = res.body.data.items.find((n) => n.title === 'Test two')!

    expect((await api('POST', `/api/me/notifications/${first.id}/read`, { token: learner.token })).status).toBe(200)
    res = await list(learner.token)
    expect(res.body.data.unread).toBe(unread - 1)

    // Someone else can't mark it.
    expect((await api('POST', `/api/me/notifications/${first.id}/read`, { token: other.token })).status).toBe(404)

    await api('POST', '/api/me/notifications/read-all', { token: learner.token })
    expect((await list(learner.token)).body.data.unread).toBe(0)
  })

  it('needs a signed-in user', async () => {
    expect((await api('GET', '/api/me/notifications', {})).status).toBe(401)
  })
})

describe('triggers', () => {
  it('a newly published upcoming event notifies learners, once', async () => {
    const startsAt = new Date(Date.now() + 5 * 86_400_000).toISOString()
    const created = await api<{ data: { id: string } }>('POST', '/api/live-events', {
      token: adminToken,
      body: { title: 'UAT notif event', type: 'webinar', startsAt, durationMinutes: 60, format: 'link', status: 'draft' },
    })
    expect([200, 201]).toContain(created.status)
    const id = created.body.data.id
    expect((await list(learner.token)).body.data.items.some((n) => n.title === 'New event: UAT notif event')).toBe(false)

    await api('PATCH', `/api/live-events/${id}`, { token: adminToken, body: { status: 'published' } })
    await new Promise((r) => setTimeout(r, 300))
    await api('PATCH', `/api/live-events/${id}`, { token: adminToken, body: { status: 'published', description: 'Edited' } })
    await new Promise((r) => setTimeout(r, 300))
    const mine = (await list(learner.token)).body.data.items.filter((n) => n.title === 'New event: UAT notif event')
    expect(mine.length).toBe(1)
  })
})

describe('reminders', () => {
  it('reminds both sides of a session starting within the hour, once', async () => {
    const startsAt = new Date(Date.now() + 50 * 60_000)
    const [slot] = await db
      .insert(mentorAvailabilitySlots)
      .values({ mentorUserId: mentor.id, startsAt, endsAt: new Date(+startsAt + 3_600_000), isAvailable: false })
      .returning()
    await db.insert(mentorSessions).values({ slotId: slot.id, mentorUserId: mentor.id, smeUserId: learner.id, status: 'confirmed' })

    await runReminders()
    const learnerHas = await db.select().from(notifications).where(and(eq(notifications.userId, learner.id), eq(notifications.type, 'session_reminder')))
    const mentorHas = await db.select().from(notifications).where(and(eq(notifications.userId, mentor.id), eq(notifications.type, 'session_reminder')))
    expect(learnerHas.length).toBe(1)
    expect(learnerHas[0].title).toContain('starts soon')
    expect(mentorHas.length).toBe(1)

    await runReminders()
    const again = await db.select().from(notifications).where(and(eq(notifications.userId, learner.id), eq(notifications.type, 'session_reminder')))
    expect(again.length).toBe(1)
  })

  it('nudges a learner idle for a week on an unfinished course, once a week', async () => {
    const course = await createCourse()
    await db.insert(userCourseProgress).values({
      userId: other.id,
      courseId: course.id,
      progressPercentage: 30,
      updatedAt: new Date(Date.now() - 10 * 86_400_000),
    })
    await runReminders()
    await runReminders()
    const nudges = await db.select().from(notifications).where(and(eq(notifications.userId, other.id), eq(notifications.type, 'course_nudge')))
    expect(nudges.length).toBe(1)
    expect(nudges[0].link).toBe(`/dashboard/courses/${course.id}`)
  })
})

describe('learner notifications switched off (the default)', () => {
  it('learners get nothing and no bell; mentors and admins still get theirs', async () => {
    delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
    try {
      const before = (await list(learner.token)).body.data.items.length
      expect(await notify(learner.id, { type: 'certificate', title: 'Off-by-default check', dedupeKey: 'off-check' })).toBe(0)
      const after = await list(learner.token)
      expect(after.body.data.items.length).toBe(before)
      expect((after.body.data as { enabled?: boolean }).enabled).toBe(false)
      expect(await notify(mentor.id, { type: 'session_booked', title: 'Mentor still notified', dedupeKey: 'off-check-mentor' })).toBe(1)
      expect((await list(mentor.token)).body.data as { enabled?: boolean }).toMatchObject({ enabled: true })
    } finally {
      process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
    }
  })
})
