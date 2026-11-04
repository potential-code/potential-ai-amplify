import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { eq, like } from 'drizzle-orm'
import { db } from '../db'
import { users, announcements, notifications } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, sentMail, signIn, type TestUser } from './helpers'
import { unsubscribeToken } from '../services/announcements.service'

/**
 * Announcements: admin-only, banner per audience, bell notification, the
 * email audience count, and one-click unsubscribe.
 */

let learner: TestUser
let mentor: TestUser
let mentorToken: string
let adminToken: string

beforeAll(async () => {
  // These tests cover announcements as they work once learner messages are on;
  // the last block checks learners get none of it by default.
  process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
  await startTestServer()
  learner = await createTestUser('ann')
  mentor = await createTestUser('ann-mentor')
  await db.update(users).set({ role: 'mentor' }).where(eq(users.id, mentor.id))
  mentorToken = await signIn(mentor.email, mentor.password)
  const admin = await createTestUser('ann-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)
})

afterAll(async () => {
  delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
  // Sending to "learners" reached every learner in this database.
  await db.delete(notifications).where(like(notifications.title, 'UAT announcement%'))
  await db.delete(announcements).where(like(announcements.title, 'UAT announcement%'))
  await cleanupFixtureUsers()
  await stopTestServer()
})

const create = (body: object, token = adminToken) => api<{ data: { id: string } }>('POST', '/api/admin/announcements', { token, body })
const base = { title: 'UAT announcement: new courses', body: 'Three new courses on pricing are live.', linkUrl: '/dashboard/courses', linkLabel: 'See courses', bannerDays: 7 }

describe('announcements', () => {
  it('is admin only', async () => {
    expect((await create({ ...base, audience: 'learners', showBanner: true, notify: false, email: false }, learner.token)).status).toBe(403)
  })

  it('refuses one with no way to send it', async () => {
    expect((await create({ ...base, audience: 'learners', showBanner: false, notify: false, email: false })).status).toBe(422)
  })

  it('refuses an unsafe link', async () => {
    expect((await create({ ...base, linkUrl: 'javascript:alert(1)', audience: 'learners', showBanner: true, notify: false, email: false })).status).toBe(422)
  })

  it('shows a learners banner to learners only, and rings their bell', async () => {
    const res = await create({ ...base, audience: 'learners', showBanner: true, notify: true, email: false })
    expect(res.status).toBe(201)
    const id = res.body.data.id

    const mine = await api<{ data: { id: string }[] }>('GET', '/api/me/announcements', { token: learner.token })
    expect(mine.body.data.some((a) => a.id === id)).toBe(true)
    const mentors = await api<{ data: { id: string }[] }>('GET', '/api/me/announcements', { token: mentorToken })
    expect(mentors.body.data.some((a) => a.id === id)).toBe(false)

    const bell = await api<{ data: { items: { title: string; link: string }[] } }>('GET', '/api/me/notifications', { token: learner.token })
    const n = bell.body.data.items.find((i) => i.title === base.title)
    expect(n?.link).toBe('/dashboard/courses')

    // Taking it down removes the banner.
    expect((await api('POST', `/api/admin/announcements/${id}/archive`, { token: adminToken })).status).toBe(200)
    const after = await api<{ data: { id: string }[] }>('GET', '/api/me/announcements', { token: learner.token })
    expect(after.body.data.some((a) => a.id === id)).toBe(false)
  })

  it('counts who an email would reach, leaving out people who turned emails off', async () => {
    const count = () => api<{ data: { people: number; emailable: number } }>('GET', '/api/admin/announcements/audience?audience=learners', { token: adminToken })
    const before = (await count()).body.data
    await api('PUT', '/api/account/email-preferences', { token: learner.token, body: { announcements: false } })
    const after = (await count()).body.data
    expect(after.people).toBe(before.people)
    expect(after.emailable).toBe(before.emailable - 1)
    await api('PUT', '/api/account/email-preferences', { token: learner.token, body: { announcements: true } })
  })
})

describe('unsubscribe', () => {
  it('turns announcement emails off from the email link, without signing in', async () => {
    const res = await api('POST', '/api/account/unsubscribe', { body: { token: unsubscribeToken(learner.id) } })
    expect(res.status).toBe(200)
    const prefs = await api<{ data: { announcements: boolean } }>('GET', '/api/account/email-preferences', { token: learner.token })
    expect(prefs.body.data.announcements).toBe(false)
  })

  it('refuses a forged token', async () => {
    const forged = `${Buffer.from(learner.id).toString('base64url')}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    expect((await api('POST', '/api/account/unsubscribe', { body: { token: forged } })).status).toBe(400)
  })
})

describe('learner messages switched off (the default)', () => {
  it('learners get no banner, bell or email; mentors still do', async () => {
    delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
    try {
      const reach = await api<{ data: { people: number; learnersPaused: boolean } }>('GET', '/api/admin/announcements/audience?audience=learners', { token: adminToken })
      expect(reach.body.data).toMatchObject({ people: 0, learnersPaused: true })

      const mailsBefore = sentMail().length
      const res = await create({ ...base, title: 'UAT announcement: everyone', audience: 'all', showBanner: true, notify: true, email: true })
      expect(res.status).toBe(201)
      const id = res.body.data.id

      const learnerBanners = await api<{ data: { id: string }[] }>('GET', '/api/me/announcements', { token: learner.token })
      expect(learnerBanners.body.data.some((a) => a.id === id)).toBe(false)
      const mentorBanners = await api<{ data: { id: string }[] }>('GET', '/api/me/announcements', { token: mentorToken })
      expect(mentorBanners.body.data.some((a) => a.id === id)).toBe(true)

      const learnerBell = await db.select().from(notifications).where(eq(notifications.userId, learner.id))
      expect(learnerBell.some((n) => n.title === 'UAT announcement: everyone')).toBe(false)

      await new Promise((r) => setTimeout(r, 300)) // emails go out in the background
      const mails = sentMail().slice(mailsBefore).filter((m) => m.subject === 'UAT announcement: everyone')
      expect(mails.some((m) => m.to === learner.email)).toBe(false)
      expect(mails.some((m) => m.to === mentor.email)).toBe(true)
    } finally {
      process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
    }
  })
})
