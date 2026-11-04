import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db'
import { eventAttendance, eventRsvps, liveEvents, users, type EventRsvp, type LiveEvent } from '../db/schema'
import { AppError } from '../utils/app-error'
import { sendMail } from '../mail/mailer'
import { notify, notifyAllLearners, whenLabel } from './notifications.service'
import { cancelRegistrant, removeEventMeeting, syncEventMeeting, syncRegistrant } from './eventZoom.service'
import { zoomInfo } from './zoom'
import { writeTable, type ExportFormat, type Table } from './admin.exports.service'

/**
 * Live events: scheduling (real start and end times, entered in UAE time),
 * where they happen (a Zoom meeting AI Amplify creates, another link, or a place),
 * bookings, and what each viewer may see. A meeting link only ever reaches
 * someone who booked: for Zoom it's her own personal link.
 */

export type EventFormat = 'zoom' | 'link' | 'in_person'

export interface EventInput {
  title: string
  description?: string | null
  type?: string
  startsAt: string
  durationMinutes: number
  format: EventFormat
  meetingLink?: string | null
  location?: string | null
  recordingLink?: string | null
  coverImage?: string | null
  status?: 'draft' | 'published'
}

const UAE = 'Asia/Dubai'

/** Display copies of the start: '2026-10-15' and '5:00 PM GST (UAE time)'. */
function displayCopies(startsAt: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: UAE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(startsAt)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: UAE, hour: 'numeric', minute: '2-digit', hour12: true }).format(startsAt)
  return { date, time: `${time} GST (UAE time)` }
}

const eventWhen = (e: Pick<LiveEvent, 'startsAt'>, timezone?: string | null) => whenLabel(e.startsAt, timezone)

const emailsOn = () => process.env['REMINDER_EMAILS_ENABLED'] === 'true'

// ── Views ────────────────────────────────────────────────────────────────────

/** What anyone may see (the landing page, signed out): no links. */
export function publicView(e: LiveEvent) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    date: e.date,
    time: e.time,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    format: e.format as EventFormat,
    location: e.format === 'in_person' ? e.location : null,
    recordingLink: e.recordingLink,
    coverImage: e.coverImage,
    status: e.status,
    /** From Zoom's webhooks: it's on now / it has finished. */
    startedAt: e.zoomStartedAt?.toISOString() ?? null,
    endedAt: e.zoomEndedAt?.toISOString() ?? null,
    // Kept for older readers: never a real link here.
    meetingLink: null as string | null,
  }
}

/** A learner's view: how to join only once she has booked. */
export function learnerView(e: LiveEvent, rsvp: EventRsvp | null, bookings: number) {
  const booked = !!rsvp
  const join =
    !booked
      ? null
      : e.format === 'zoom'
        ? rsvp!.zoomJoinUrl
        : e.format === 'link'
          ? e.meetingLink
          : null
  return {
    ...publicView(e),
    meetingLink: join,
    booked,
    bookedAt: rsvp?.createdAt.toISOString() ?? null,
    bookings,
    /** Zoom: her personal link isn't ready yet (Zoom is being slow or down). */
    joinPending: booked && e.format === 'zoom' && !rsvp?.zoomJoinUrl,
    meetingId: booked && e.format === 'zoom' ? e.zoomMeetingId : null,
    passcode: booked && e.format === 'zoom' ? e.zoomPasscode : null,
  }
}

export type AdminEventView = ReturnType<typeof adminView>

/** Admins: everything except the host start link (fetched on demand). */
function adminView(e: LiveEvent, bookings: number, attended: number) {
  return {
    ...publicView(e),
    meetingLink: e.meetingLink,
    location: e.location,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    durationMinutes: Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000),
    bookings,
    attended,
    zoom: {
      status: e.zoomStatus,
      error: e.zoomError,
      meetingId: e.zoomMeetingId,
      passcode: e.zoomPasscode,
      joinUrl: e.zoomJoinUrl,
      syncedAt: e.zoomSyncedAt?.toISOString() ?? null,
      attendanceSyncedAt: e.attendanceSyncedAt?.toISOString() ?? null,
    },
  }
}

async function bookingCounts(): Promise<Map<string, number>> {
  const rows = await db.select({ eventId: eventRsvps.eventId, n: sql<number>`count(*)::int` }).from(eventRsvps).groupBy(eventRsvps.eventId)
  return new Map(rows.map((r) => [r.eventId, r.n]))
}

// ── Lists ────────────────────────────────────────────────────────────────────

export async function listPublishedEvents() {
  const rows = await db.select().from(liveEvents).where(eq(liveEvents.status, 'published')).orderBy(desc(liveEvents.startsAt))
  return rows.map(publicView)
}

export async function listForLearner(userId: string) {
  const [rows, mine, counts] = await Promise.all([
    db.select().from(liveEvents).where(eq(liveEvents.status, 'published')).orderBy(desc(liveEvents.startsAt)),
    db.select().from(eventRsvps).where(eq(eventRsvps.userId, userId)),
    bookingCounts(),
  ])
  const byEvent = new Map(mine.map((r) => [r.eventId, r]))
  return rows.map((e) => learnerView(e, byEvent.get(e.id) ?? null, counts.get(e.id) ?? 0))
}

export async function listAllEvents() {
  const [rows, counts, attendance] = await Promise.all([
    db.select().from(liveEvents).orderBy(desc(liveEvents.startsAt)),
    bookingCounts(),
    db.select({ eventId: eventAttendance.eventId, n: sql<number>`count(*)::int` }).from(eventAttendance).groupBy(eventAttendance.eventId),
  ])
  const attended = new Map(attendance.map((r) => [r.eventId, r.n]))
  return rows.map((e) => adminView(e, counts.get(e.id) ?? 0, attended.get(e.id) ?? 0))
}

export async function getEvent(id: string): Promise<LiveEvent | null> {
  const [event] = await db.select().from(liveEvents).where(eq(liveEvents.id, id)).limit(1)
  return event ?? null
}

async function getAdminEvent(id: string) {
  const all = await listAllEvents()
  const e = all.find((x) => x.id === id)
  if (!e) throw new AppError('Event not found', 404, 'NOT_FOUND')
  return e
}

// ── Create / update / delete ─────────────────────────────────────────────────

function rowFrom(input: Partial<EventInput>, existing?: LiveEvent): Partial<typeof liveEvents.$inferInsert> {
  const row: Partial<typeof liveEvents.$inferInsert> = {}
  if (input.title !== undefined) row.title = input.title
  if (input.description !== undefined) row.description = input.description || null
  if (input.type !== undefined) row.type = input.type
  if (input.recordingLink !== undefined) row.recordingLink = input.recordingLink || null
  if (input.coverImage !== undefined) row.coverImage = input.coverImage || null
  if (input.status !== undefined) row.status = input.status
  if (input.format !== undefined) row.format = input.format
  if (input.meetingLink !== undefined) row.meetingLink = input.meetingLink || null
  if (input.location !== undefined) row.location = input.location || null

  if (input.startsAt !== undefined || input.durationMinutes !== undefined) {
    const startsAt = input.startsAt !== undefined ? new Date(input.startsAt) : existing!.startsAt
    const minutes = input.durationMinutes ?? (existing ? Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000) : 60)
    row.startsAt = startsAt
    row.endsAt = new Date(startsAt.getTime() + minutes * 60_000)
    Object.assign(row, displayCopies(startsAt))
  }
  return row
}

function assertWhere(e: Pick<LiveEvent, 'format' | 'meetingLink' | 'location'>) {
  if (e.format === 'zoom' && !zoomInfo().configured) {
    throw new AppError("Zoom isn't connected on this server yet. Choose another link, or add the Zoom credentials.", 422, 'ZOOM_NOT_CONFIGURED')
  }
  if (e.format === 'in_person' && !e.location?.trim()) throw new AppError('Add where the event takes place.', 422, 'LOCATION_REQUIRED')
}

/** Learners hear about a published event that's still ahead, and about a new recording. */
function announce(before: LiveEvent | null, after: LiveEvent) {
  if (after.status !== 'published') return
  if (after.endsAt.getTime() > Date.now() && before?.status !== 'published') {
    void notifyAllLearners({
      type: 'event_new',
      title: `New event: ${after.title}`,
      body: eventWhen(after),
      link: '/dashboard/events',
      dedupeKey: `event:${after.id}:new`,
    })
  }
  if (after.recordingLink && !before?.recordingLink) {
    void notifyAllLearners({
      type: 'event_recording',
      title: `Replay available: ${after.title}`,
      body: 'Watch the recording on the Events page.',
      link: '/dashboard/events',
      dedupeKey: `event:${after.id}:recording`,
    })
  }
}

async function bookedUserIds(eventId: string): Promise<string[]> {
  return (await db.select({ id: eventRsvps.userId }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId))).map((r) => r.id)
}

export async function createEvent(createdBy: string, input: EventInput) {
  const row = rowFrom(input)
  assertWhere({ format: row.format!, meetingLink: row.meetingLink ?? null, location: row.location ?? null })
  const [event] = await db
    .insert(liveEvents)
    .values({ ...(row as typeof liveEvents.$inferInsert), createdBy, zoomStatus: row.format === 'zoom' ? 'pending' : 'not_required' })
    .returning()
  if (!event) throw new AppError('Failed to create event', 500, 'INSERT_FAILED')
  if (event.format === 'zoom') await syncEventMeeting(event.id)
  announce(null, event)
  return getAdminEvent(event.id)
}

export async function updateEvent(id: string, input: Partial<EventInput>) {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const row = rowFrom(input, existing)
  const next = { ...existing, ...row } as LiveEvent
  assertWhere(next)

  const [updated] = await db
    .update(liveEvents)
    .set({ ...row, updatedAt: new Date(), ...(next.format === 'zoom' && existing.format !== 'zoom' ? { zoomStatus: 'pending' } : {}) })
    .where(eq(liveEvents.id, id))
    .returning()

  const moved = updated!.startsAt.getTime() !== existing.startsAt.getTime() || updated!.endsAt.getTime() !== existing.endsAt.getTime()
  const changedZoom = updated!.format === 'zoom' || existing.format === 'zoom'
  if (changedZoom && (moved || row.title !== undefined || row.description !== undefined || row.format !== undefined)) {
    await syncEventMeeting(id)
  }

  // Everyone who booked hears that it moved (and, below, gets fresh reminders).
  if (moved && updated!.status === 'published' && updated!.endsAt.getTime() > Date.now()) {
    const ids = await bookedUserIds(id)
    if (ids.length) {
      void notify(ids, {
        type: 'event_changed',
        title: `New time: ${updated!.title}`,
        body: `Now ${eventWhen(updated!)}.`,
        link: '/dashboard/events',
        dedupeKey: `event:${id}:moved:${updated!.startsAt.getTime()}`,
      })
    }
  }
  announce(existing, updated!)
  return getAdminEvent(id)
}

export async function deleteEvent(id: string): Promise<void> {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')
  if (existing.status === 'published' && existing.endsAt.getTime() > Date.now()) {
    const ids = await bookedUserIds(id)
    if (ids.length) {
      await notify(ids, {
        type: 'event_cancelled',
        title: `Cancelled: ${existing.title}`,
        body: `The event on ${eventWhen(existing)} won't go ahead.`,
        link: '/dashboard/events',
        dedupeKey: `event:${id}:cancelled`,
      })
    }
  }
  await removeEventMeeting(existing)
  await db.delete(liveEvents).where(eq(liveEvents.id, id))
}

/** Tries Zoom again for this event and its bookings (the admin's "Re-sync"). */
export async function resyncZoom(id: string) {
  const existing = await getEvent(id)
  if (!existing) throw new AppError('Event not found', 404, 'NOT_FOUND')
  if (existing.format !== 'zoom') throw new AppError("This event isn't a Zoom meeting.", 422, 'NOT_ZOOM')
  await syncEventMeeting(id)
  return getAdminEvent(id)
}

// ── Booking ──────────────────────────────────────────────────────────────────

async function bookable(eventId: string): Promise<LiveEvent> {
  const event = await getEvent(eventId)
  if (!event || event.status !== 'published') throw new AppError('Event not found', 404, 'NOT_FOUND')
  if (event.endsAt.getTime() <= Date.now() || event.zoomEndedAt) throw new AppError('This event has already finished.', 409, 'EVENT_ENDED')
  return event
}

export async function rsvp(userId: string, eventId: string) {
  const event = await bookable(eventId)
  const [created] = await db
    .insert(eventRsvps)
    .values({ eventId, userId, zoomStatus: event.format === 'zoom' ? 'pending' : 'not_required' })
    .onConflictDoNothing()
    .returning()
  let mine = created ?? (await db.select().from(eventRsvps).where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId))))[0]!
  if (event.format === 'zoom') mine = (await syncRegistrant(mine.id)) ?? mine

  if (created) {
    const [u] = await db.select({ email: users.email, name: users.fullName, timezone: users.timezone }).from(users).where(eq(users.id, userId))
    void notify(userId, {
      type: 'event_booked',
      title: `You're booked: ${event.title}`,
      body: `${eventWhen(event, u?.timezone)}. We'll remind you the day before and an hour before.`,
      link: '/dashboard/events',
    })
    if (u && emailsOn()) {
      void sendMail({
        to: u.email,
        subject: `You're booked: ${event.title}`,
        template: 'event-booked',
        context: { name: u.name, title: event.title, when: eventWhen(event, u.timezone), ...joinDetails(event, mine) },
      }).catch((err) => console.error('[events] booking email failed', err))
    }
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId))
  return learnerView(event, mine, n)
}

export async function cancelRsvp(userId: string, eventId: string) {
  const event = await getEvent(eventId)
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const [removed] = await db.delete(eventRsvps).where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId))).returning()
  if (removed?.zoomRegistrantId) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
    if (u) await cancelRegistrant(event, removed, u.email)
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId))
  return learnerView(event, null, n)
}

/** What an email says about joining: her own Zoom link, the link, or the place. */
export function joinDetails(event: LiveEvent, rsvp: Pick<EventRsvp, 'zoomJoinUrl'> | null) {
  if (event.format === 'zoom') {
    return { joinUrl: rsvp?.zoomJoinUrl ?? null, meetingId: event.zoomMeetingId, passcode: event.zoomPasscode, personal: true, location: null }
  }
  if (event.format === 'link') return { joinUrl: event.meetingLink, meetingId: null, passcode: null, personal: false, location: null }
  return { joinUrl: null, meetingId: null, passcode: null, personal: false, location: event.location }
}

// ── Admin: who booked and who came ───────────────────────────────────────────

export interface Booking {
  userId: string
  fullName: string
  email: string
  company: string | null
  bookedAt: string
  zoomStatus: string
  attendedMinutes: number | null
}

export async function listBookings(eventId: string): Promise<{ bookings: Booking[]; guests: { name: string; email: string | null; minutes: number }[] }> {
  const event = await getEvent(eventId)
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const [rows, attendance] = await Promise.all([
    db
      .select({ userId: users.id, fullName: users.fullName, email: users.email, company: users.company, bookedAt: eventRsvps.createdAt, zoomStatus: eventRsvps.zoomStatus })
      .from(eventRsvps)
      .innerJoin(users, eq(users.id, eventRsvps.userId))
      .where(eq(eventRsvps.eventId, eventId))
      .orderBy(eventRsvps.createdAt),
    db.select().from(eventAttendance).where(eq(eventAttendance.eventId, eventId)),
  ])
  const minutesByUser = new Map(attendance.filter((a) => a.userId).map((a) => [a.userId!, a.minutes]))
  const read = !!event.attendanceSyncedAt
  const bookedIds = new Set(rows.map((r) => r.userId))
  return {
    bookings: rows.map((r) => ({
      ...r,
      bookedAt: r.bookedAt.toISOString(),
      attendedMinutes: read ? (minutesByUser.get(r.userId) ?? 0) : null,
    })),
    // People in the meeting who hadn't booked (e.g. the host, a guest speaker).
    guests: attendance.filter((a) => !a.userId || !bookedIds.has(a.userId)).map((a) => ({ name: a.name, email: a.email, minutes: a.minutes })),
  }
}

export async function exportBookings(eventId: string, format: ExportFormat) {
  const event = await getEvent(eventId)
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  const { bookings } = await listBookings(eventId)
  const table: Table = {
    title: 'Bookings',
    columns: [
      { key: 'name', label: 'Name', width: 26 },
      { key: 'email', label: 'Email', width: 32 },
      { key: 'company', label: 'Company', width: 24 },
      { key: 'booked', label: 'Booked', width: 18, time: true },
      { key: 'attended', label: 'Minutes attended' },
    ],
    rows: bookings.map((b) => ({ name: b.fullName, email: b.email, company: b.company, booked: new Date(b.bookedAt), attended: b.attendedMinutes })),
  }
  const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event'
  return writeTable(table, format, `${slug}-bookings`)
}

/** Booked learners for events starting in the next 24 hours (for reminders). */
export async function upcomingBookings(within = '24 hours') {
  return db
    .select({ event: liveEvents, rsvp: eventRsvps, email: users.email, name: users.fullName, timezone: users.timezone })
    .from(eventRsvps)
    .innerJoin(liveEvents, eq(liveEvents.id, eventRsvps.eventId))
    .innerJoin(users, eq(users.id, eventRsvps.userId))
    .where(and(eq(liveEvents.status, 'published'), gt(liveEvents.startsAt, new Date()), sql`${liveEvents.startsAt} <= now() + ${within}::interval`))
}
