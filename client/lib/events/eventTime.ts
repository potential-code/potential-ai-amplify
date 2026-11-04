'use client'

import { useEffect, useState } from 'react'
import type { LiveEvent } from '@/lib/api/liveEvents'

/**
 * Where an event is, for a learner (after SAMA): five states, because what to
 * show changes more than once. Days out, a big Join button only invites a
 * click into an empty room; minutes out, anything smaller is friction.
 */
export type EventPhase = 'upcoming' | 'soon' | 'opening' | 'live' | 'ended'

/** The Join button appears this long before the start. */
export const OPENING_MINUTES = 15
const SOON_MINUTES = 24 * 60

export function eventPhaseAt(e: Pick<LiveEvent, 'startsAt' | 'endsAt' | 'startedAt' | 'endedAt'>, now: number): EventPhase {
  // Zoom's own signals beat the clock: a host who starts early, or runs late.
  if (e.endedAt) return 'ended'
  if (e.startedAt) return 'live'
  const start = Date.parse(e.startsAt)
  const end = Date.parse(e.endsAt)
  if (now > end) return 'ended'
  if (now >= start) return 'live'
  const minutes = (start - now) / 60_000
  if (minutes <= OPENING_MINUTES) return 'opening'
  if (minutes <= SOON_MINUTES) return 'soon'
  return 'upcoming'
}

export const isEventOver = (e: Pick<LiveEvent, 'startsAt' | 'endsAt' | 'startedAt' | 'endedAt'>, now = Date.now()) => eventPhaseAt(e, now) === 'ended'

/** A clock that ticks every 30 s (phases are coarse). Null until mounted, so server and client agree. */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

/** "in 42 minutes", "in 3 hours", "tomorrow", "in 5 days". */
export function untilLabel(startsAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((Date.parse(startsAt) - now) / 60_000))
  if (minutes < 1) return 'any moment now'
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

/** "Thu 15 Oct" in the viewer's own time zone. */
export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
/** "5:00 PM" in the viewer's own time zone. */
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
/** "5:00 – 6:30 PM" style range, in the viewer's time zone, with its short zone name. */
export function timeRange(startsAt: string, endsAt: string): string {
  const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date(startsAt)).find((p) => p.type === 'timeZoneName')?.value
  return `${timeLabel(startsAt)} – ${timeLabel(endsAt)}${zone ? ` ${zone}` : ''}`
}
