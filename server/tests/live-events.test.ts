import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createHmac } from 'node:crypto'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { users, liveEvents, notifications } from '../db/schema'
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, signIn, ORIGIN, type TestUser } from './helpers'
import { zoomMock, ZoomError } from '../services/zoom'
import { reconcileZoom, syncAttendance, groupSessions } from '../services/eventZoom.service'
import { sendEventReminders } from '../services/reminders.service'

/**
 * Live events: real times, where they happen (a Zoom meeting AI Amplify creates,
 * another link, or a place), bookings with personal Zoom links, links only for
 * people who booked, reminders, attendance and the Zoom webhook. Zoom is the
 * in-memory mock here.
 */

let base: string
let adminToken: string
let learner: TestUser
let other: TestUser
let zoomEventId: string
let linkEventId: string
const SECRET = 'test-webhook-secret'

type View = {
  id: string
  meetingLink: string | null
  booked: boolean
  bookings: number
  joinPending: boolean
  meetingId: string | null
  format: string
}
type Admin = { id: string; zoom: { status: string; meetingId: string | null; error: string | null }; bookings: number; durationMinutes: number; time: string }

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const mine = async (token: string, id: string) =>
  (await api<{ data: View[] }>('GET', '/api/live-events/mine', { token })).body.data.find((e) => e.id === id)!
const create = (body: object) => api<{ data: Admin }>('POST', '/api/live-events', { token: adminToken, body })

beforeAll(async () => {
  // Booking, reminder and change notices to learners, as they work once learner
  // messages are switched on (notifications.test.ts covers the default: off).
  process.env['LEARNER_NOTIFICATIONS_ENABLED'] = 'true'
  base = await startTestServer()
  process.env['ZOOM_WEBHOOK_SECRET_TOKEN'] = SECRET
  const admin = await createTestUser('ev-admin')
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  adminToken = await signIn(admin.email, admin.password)
  learner = await createTestUser('ev-learner')
  other = await createTestUser('ev-other')
})

afterAll(async () => {
  delete process.env['LEARNER_NOTIFICATIONS_ENABLED']
  await db.delete(notifications).where(like(notifications.title, '%UAT event%'))
  await db.delete(liveEvents).where(like(liveEvents.title, 'UAT event%'))
  await cleanupFixtureUsers()
  await stopTestServer()
})

describe('creating events', () => {
  it('creates a Zoom meeting for a Zoom event, stored in UAE time', async () => {
    const res = await create({ title: 'UAT event Zoom', startsAt: '2030-03-10T17:00:00+04:00', durationMinutes: 90, format: 'zoom', status: 'published' })
    expect(res.status).toBe(201)
    zoomEventId = res.body.data.id
    expect(res.body.data.zoom.status).toBe('active')
    expect(res.body.data.zoom.meetingId).toBeTruthy()
    expect(res.body.data.durationMinutes).toBe(90)
    expect(res.body.data.time).toBe('5:00 PM GST (UAE time)')
    const meeting = zoomMock().meetings.get(res.body.data.zoom.meetingId!)
    expect(meeting?.durationMinutes).toBe(90)
  })

  it('needs a place for an in-person event, and refuses bad times', async () => {
    expect((await create({ title: 'UAT event room', startsAt: inHours(48), format: 'in_person', status: 'draft' })).status).toBe(422)
    expect((await create({ title: 'UAT event bad', startsAt: 'next tuesday', format: 'link' })).status).toBe(422)
    expect((await create({ title: 'UAT event short', startsAt: inHours(48), durationMinutes: 5, format: 'link' })).status).toBe(422)
  })

  it('is admin only', async () => {
    expect((await api('POST', '/api/live-events', { token: learner.token, body: { title: 'x', startsAt: inHours(5), format: 'link' } })).status).toBe(403)
  })
})

describe('booking', () => {
  it('hides every link until a learner books, and from the public list', async () => {
    const link = await create({ title: 'UAT event link', startsAt: inHours(48), format: 'link', meetingLink: 'https://meet.example.com/abc', status: 'published' })
    linkEventId = link.body.data.id
    expect((await mine(learner.token, linkEventId)).meetingLink).toBeNull()
    expect((await mine(learner.token, zoomEventId)).meetingLink).toBeNull()
    const pub = await api<{ data: { id: string; meetingLink: string | null }[] }>('GET', '/api/live-events')
    const raw = JSON.stringify(pub.body.data.filter((e) => e.id === linkEventId || e.id === zoomEventId))
    expect(raw).not.toContain('meet.example.com')
    expect(raw).not.toContain('zoom.us')
  })

  it('gives each learner her own Zoom link when she books, once', async () => {
    const a = await api<{ data: View }>('POST', `/api/live-events/${zoomEventId}/rsvp`, { token: learner.token })
    expect(a.status).toBe(200)
    expect(a.body.data.booked).toBe(true)
    expect(a.body.data.meetingLink).toMatch(/^https:\/\/zoom\.us\/w\//)
    const b = await api<{ data: View }>('POST', `/api/live-events/${zoomEventId}/rsvp`, { token: other.token })
    expect(b.body.data.meetingLink).not.toBe(a.body.data.meetingLink)
    // Booking twice is fine and keeps one booking.
    const again = await api<{ data: View }>('POST', `/api/live-events/${zoomEventId}/rsvp`, { token: learner.token })
    expect(again.body.data.meetingLink).toBe(a.body.data.meetingLink)
    expect(again.body.data.bookings).toBe(2)
    const bell = await db.select().from(notifications).where(and(eq(notifications.userId, learner.id), eq(notifications.type, 'event_booked')))
    expect(bell.length).toBe(1)
  })

  it('shows the other link once booked', async () => {
    const res = await api<{ data: View }>('POST', `/api/live-events/${linkEventId}/rsvp`, { token: learner.token })
    expect(res.body.data.meetingLink).toBe('https://meet.example.com/abc')
  })

  it('cancelling removes the Zoom registration', async () => {
    const meetingId = (await mine(other.token, zoomEventId)).meetingId!
    const before = zoomMock().meetings.get(meetingId)!.registrants.size
    const res = await api<{ data: View }>('DELETE', `/api/live-events/${zoomEventId}/rsvp`, { token: other.token })
    expect(res.body.data.booked).toBe(false)
    expect(res.body.data.meetingLink).toBeNull()
    expect(zoomMock().meetings.get(meetingId)!.registrants.size).toBe(before - 1)
  })

  it("won't book a finished event", async () => {
    const past = await create({ title: 'UAT event past', startsAt: inHours(-5), format: 'link', status: 'published' })
    expect((await api('POST', `/api/live-events/${past.body.data.id}/rsvp`, { token: learner.token })).status).toBe(409)
  })
})

describe('when Zoom fails', () => {
  it('saves the event anyway and the sweep fixes it later', async () => {
    zoomMock().failNext = new ZoomError('server', 'boom')
    const res = await create({ title: 'UAT event flaky', startsAt: inHours(72), format: 'zoom', status: 'published' })
    expect(res.status).toBe(201)
    expect(res.body.data.zoom.status).toBe('failed')
    expect(res.body.data.zoom.error).toContain('try again')
    await reconcileZoom()
    const [row] = await db.select().from(liveEvents).where(eq(liveEvents.id, res.body.data.id))
    expect(row!.zoomStatus).toBe('active')
  })

  it('switching away from Zoom removes the meeting and the personal links', async () => {
    const res = await create({ title: 'UAT event switch', startsAt: inHours(30), format: 'zoom', status: 'published' })
    const id = res.body.data.id
    const meetingId = res.body.data.zoom.meetingId!
    await api('POST', `/api/live-events/${id}/rsvp`, { token: learner.token })
    const patched = await api<{ data: Admin }>('PATCH', `/api/live-events/${id}`, { token: adminToken, body: { format: 'link', meetingLink: 'https://teams.example.com/x' } })
    expect(patched.body.data.zoom.status).toBe('not_required')
    expect(zoomMock().meetings.has(meetingId)).toBe(false)
    expect((await mine(learner.token, id)).meetingLink).toBe('https://teams.example.com/x')
  })
})

describe('reminders and changes', () => {
  it('reminds booked learners an hour before, once; moving the event re-arms it and tells them', async () => {
    const res = await create({ title: 'UAT event soon', startsAt: inHours(0.5), format: 'link', meetingLink: 'https://meet.example.com/soon', status: 'published' })
    const id = res.body.data.id
    await api('POST', `/api/live-events/${id}/rsvp`, { token: learner.token })
    await sendEventReminders()
    await sendEventReminders()
    const reminders = () =>
      db.select().from(notifications).where(and(eq(notifications.userId, learner.id), like(notifications.title, 'Starting soon: UAT event soon')))
    expect((await reminders()).length).toBe(1)

    await api('PATCH', `/api/live-events/${id}`, { token: adminToken, body: { startsAt: inHours(0.75) } })
    await new Promise((r) => setTimeout(r, 200))
    const moved = await db.select().from(notifications).where(and(eq(notifications.userId, learner.id), eq(notifications.title, 'New time: UAT event soon')))
    expect(moved.length).toBe(1)
    await sendEventReminders()
    expect((await reminders()).length).toBe(2)
  })

  it('tells booked learners when an event is cancelled', async () => {
    await api('DELETE', `/api/live-events/${linkEventId}`, { token: adminToken })
    const bell = await db.select().from(notifications).where(and(eq(notifications.userId, learner.id), eq(notifications.title, 'Cancelled: UAT event link')))
    expect(bell.length).toBe(1)
  })
})

describe('attendance', () => {
  it('groups joins per person and matches them to bookings', () => {
    const t = (m: number) => new Date(Date.UTC(2030, 0, 1, 10, m))
    const rows = groupSessions(
      [
        { registrantId: 'r1', name: 'Amal', email: 'amal@x.com', joinedAt: t(0), leftAt: t(20), durationSeconds: 1200 },
        { registrantId: 'r1', name: 'Amal', email: 'amal@x.com', joinedAt: t(25), leftAt: t(55), durationSeconds: 1800 },
        { registrantId: null, name: 'Host', email: null, joinedAt: t(0), leftAt: t(60), durationSeconds: 3600 },
      ],
      [{ userId: 'u1', registrantId: 'r1', email: 'amal@x.com' }],
    )
    expect(rows.find((r) => r.userId === 'u1')).toMatchObject({ minutes: 50 })
    expect(rows.find((r) => r.name === 'Host')).toMatchObject({ userId: null, minutes: 60 })
  })

  it("reads Zoom's report after the event and shows minutes per booking", async () => {
    const [ev] = await db.select().from(liveEvents).where(eq(liveEvents.id, zoomEventId))
    const view = await mine(learner.token, zoomEventId)
    const registrantId = new URL(view.meetingLink!).searchParams.get('tk')!
    zoomMock().reports.set(ev!.zoomMeetingId!, [
      { registrantId, name: 'E2E ev-learner', email: learner.email, joinedAt: new Date(), leftAt: null, durationSeconds: 2400 },
      { registrantId: null, name: 'Guest Speaker', email: null, joinedAt: new Date(), leftAt: null, durationSeconds: 3000 },
    ])
    expect(await syncAttendance(zoomEventId)).toBe(true)
    const res = await api<{ data: { bookings: { email: string; attendedMinutes: number | null }[]; guests: { name: string }[] } }>('GET', `/api/live-events/${zoomEventId}/bookings`, { token: adminToken })
    expect(res.body.data.bookings.find((b) => b.email === learner.email)?.attendedMinutes).toBe(40)
    expect(res.body.data.guests.map((g) => g.name)).toContain('Guest Speaker')

    const csv = await fetch(`${base}/api/live-events/${zoomEventId}/bookings/export?format=csv`, { headers: { Origin: ORIGIN, Cookie: adminToken } })
    expect(csv.status).toBe(200)
    expect(await csv.text()).toContain(learner.email)
  })

  it('gives admins the host link fresh from Zoom, and nobody else', async () => {
    const res = await api<{ data: { url: string } }>('GET', `/api/live-events/${zoomEventId}/zoom/start-url`, { token: adminToken })
    expect(res.body.data.url).toContain('zoom.us/s/')
    expect((await api('GET', `/api/live-events/${zoomEventId}/zoom/start-url`, { token: learner.token })).status).toBe(403)
  })
})

describe('Zoom webhook', () => {
  const send = (body: object, secret = SECRET, ts = String(Math.floor(Date.now() / 1000))) => {
    const raw = JSON.stringify(body)
    const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}`
    return fetch(`${base}/api/webhooks/zoom`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-zm-signature': sig, 'x-zm-request-timestamp': ts }, body: raw })
  }

  it('answers the URL validation challenge', async () => {
    const res = await send({ event: 'endpoint.url_validation', payload: { plainToken: 'abc' } })
    const body = (await res.json()) as { plainToken: string; encryptedToken: string }
    expect(body.plainToken).toBe('abc')
    expect(body.encryptedToken).toBe(createHmac('sha256', SECRET).update('abc').digest('hex'))
  })

  it('marks the event live when the meeting starts, and refuses a bad signature', async () => {
    const [ev] = await db.select().from(liveEvents).where(eq(liveEvents.id, zoomEventId))
    expect((await send({ event: 'meeting.started', payload: { object: { id: ev!.zoomMeetingId } } }, 'wrong')).status).toBe(401)
    expect((await send({ event: 'meeting.started', payload: { object: { id: ev!.zoomMeetingId } } }, SECRET, '1000')).status).toBe(401)
    expect((await send({ event: 'meeting.started', payload: { object: { id: ev!.zoomMeetingId } } })).status).toBe(200)
    const [after] = await db.select().from(liveEvents).where(eq(liveEvents.id, zoomEventId))
    expect(after!.zoomStartedAt).not.toBeNull()
  })
})
