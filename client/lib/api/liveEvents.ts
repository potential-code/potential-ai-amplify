export type EventFormat = 'zoom' | 'link' | 'in_person'

/**
 * A live event as the public and learners see it. `meetingLink` is only ever
 * set for a learner who booked (for Zoom events it's her own link).
 */
export type LiveEvent = {
  id: string
  title: string
  description: string | null
  type: string
  /** Display copies in UAE time, kept for older readers. Prefer startsAt. */
  date: string
  time: string
  startsAt: string
  endsAt: string
  format: EventFormat
  location: string | null
  meetingLink: string | null
  recordingLink: string | null
  coverImage: string | null
  status: 'draft' | 'published'
  /** From Zoom: the host started / ended the meeting. */
  startedAt: string | null
  endedAt: string | null
  // Learner fields (GET /mine)
  booked?: boolean
  bookedAt?: string | null
  bookings?: number
  joinPending?: boolean
  meetingId?: string | null
  passcode?: string | null
}

export type AdminLiveEvent = LiveEvent & {
  createdAt: string
  updatedAt: string
  durationMinutes: number
  bookings: number
  attended: number
  zoom: {
    status: 'not_required' | 'pending' | 'active' | 'failed'
    error: string | null
    meetingId: string | null
    passcode: string | null
    joinUrl: string | null
    syncedAt: string | null
    attendanceSyncedAt: string | null
  }
}

export type EventInput = {
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

export type EventBooking = {
  userId: string
  fullName: string
  email: string
  company: string | null
  bookedAt: string
  zoomStatus: string
  attendedMinutes: number | null
}

const BASE = `/api/live-events`


async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let body: unknown
    try { body = await res.json() } catch { body = { error: { message: 'Request failed' } } }
    throw body
  }
  return ((await res.json()) as { data: T }).data
}

/** The error message the API sent. */
export const eventErrorMessage = (e: unknown, fallback: string) =>
  (e as { error?: { message?: string } } | null)?.error?.message ?? fallback

/** Published events without links (signed out). */
export const fetchPublishedEvents = () => apiFetch<LiveEvent[]>('/')
/** Published events with the learner's bookings and, once booked, how to join. */
export const fetchMyEvents = () => apiFetch<LiveEvent[]>('/mine')
export const apiBookEvent = (id: string) => apiFetch<LiveEvent>(`/${id}/rsvp`, { method: 'POST' })
export const apiCancelBooking = (id: string) => apiFetch<LiveEvent>(`/${id}/rsvp`, { method: 'DELETE' })

export const fetchAdminEvents = () => apiFetch<AdminLiveEvent[]>('/admin')
export const fetchZoomInfo = () => apiFetch<{ configured: boolean; mock: boolean }>('/admin/zoom')
export const apiCreateEvent = (data: EventInput) => apiFetch<AdminLiveEvent>('/', { method: 'POST', body: JSON.stringify(data) })
export const apiUpdateEvent = (id: string, data: Partial<EventInput>) =>
  apiFetch<AdminLiveEvent>(`/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const apiDeleteEvent = (id: string) => apiFetch<{ ok: boolean }>(`/${id}`, { method: 'DELETE' })
export const fetchEventBookings = (id: string) =>
  apiFetch<{ bookings: EventBooking[]; guests: { name: string; email: string | null; minutes: number }[] }>(`/${id}/bookings`)
export const apiResyncZoom = (id: string) => apiFetch<AdminLiveEvent>(`/${id}/zoom/resync`, { method: 'POST' })
export const fetchHostStartUrl = (id: string) => apiFetch<{ url: string }>(`/${id}/zoom/start-url`)
