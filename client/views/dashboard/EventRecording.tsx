'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock, Globe, PlayCircle } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { Card, Chip, EmptyState, Skeleton, btn } from '@/components/kit'
import { VideoPlayer } from '@/components/media/VideoPlayer'
import { fetchPublishedEvents, type LiveEvent } from '@/lib/api/liveEvents'

/** "2023-10-24" → "Tuesday, 24 October 2023" (noon UTC so no timezone shifts the day). */
function longDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function BackLink() {
  return (
    <Link
      href="/dashboard/events"
      className="inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-ui-muted hover:text-ui-text"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to events
    </Link>
  )
}

export default function EventRecordingPage() {
  const params = useParams<{ id: string }>()
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchPublishedEvents()
      .then(setEvents)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const event = !loading && !error ? events.find((e) => e.id === params.id) : undefined

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5">
        <BackLink />

        {loading ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading recording">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="aspect-video w-full rounded-[14px]" />
          </div>
        ) : error || !event || !event.recordingLink ? (
          <Card>
            <EmptyState
              icon={PlayCircle}
              title={error ? "We couldn't load this recording" : 'Recording not found'}
              body={
                error
                  ? 'Check your connection and try again in a moment.'
                  : "This event doesn't have a recording yet. Recordings appear on the Events page once they're ready."
              }
              action={
                <Link href="/dashboard/events" className={btn({ variant: 'secondary' })}>
                  See all events
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            <header className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="brand" className="capitalize">
                  {event.type}
                </Chip>
                <Chip>
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                  Recording
                </Chip>
              </div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ui-text sm:text-[28px] sm:leading-tight">{event.title}</h1>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ui-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                  {longDate(event.date)}
                </span>
                {event.time && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4 shrink-0" aria-hidden />
                    {event.time}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-4 w-4 shrink-0" aria-hidden />
                  Online
                </span>
              </p>
            </header>

            <VideoPlayer url={event.recordingLink} title={event.title} />

            {event.description && (
              <Card className="p-5">
                <h2 className="mb-1.5 text-base font-semibold text-ui-text">About this session</h2>
                <p className="max-w-[70ch] whitespace-pre-line text-[15px] leading-relaxed text-ui-muted">{event.description}</p>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
