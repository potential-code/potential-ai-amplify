'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { YouTubePlayer } from '@/components/lms/YouTubePlayer'
import { fetchPublishedEvents, type LiveEvent } from '@/lib/api/liveEvents'

function parseDate(d: string) {
  const [year = '', monthNum = '', dayRaw = ''] = d.split('-')
  const month = new Date(`${year}-${monthNum}-01`).toLocaleString('en-US', { month: 'short' })
  return { month, day: dayRaw.replace(/^0/, ''), year }
}

function BackToEvents() {
  return (
    <Link
      href="/dashboard/events"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary hover:underline"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back to Events
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="mb-5">
          <BackToEvents />
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/3 bg-brand-surface-2 rounded" />
          <div className="aspect-video w-full bg-brand-surface-2 rounded-2xl" />
        </div>
      </DashboardLayout>
    )
  }

  const event = !error ? events.find((e) => e.id === params.id) : undefined

  if (error || !event || !event.recordingLink) {
    return (
      <DashboardLayout>
        <div className="mb-5">
          <BackToEvents />
        </div>
        <div className="rounded-2xl border border-brand-surface-2 p-10 text-center">
          <p className="text-sm font-semibold text-brand-text-primary mb-1">
            {error ? "Couldn't load this recording." : 'Recording not found.'}
          </p>
          <p className="text-sm text-brand-text-muted mb-5">
            {error
              ? 'Please try again later.'
              : "This event either doesn't exist or doesn't have a recording available yet."}
          </p>
          <Link
            href="/dashboard/events"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-primary-dark transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Events
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const { month, day, year } = parseDate(event.date)

  return (
    <DashboardLayout>
      <div className="mb-5">
        <BackToEvents />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold uppercase tracking-wider mb-3">
          <Calendar className="w-2.5 h-2.5" />
          {event.type}
        </span>
        <h1 className="text-xl sm:text-2xl font-black text-brand-text-primary leading-tight mb-2">
          {event.title}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-brand-text-muted mb-5">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
            {day} {month} {year}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
            {event.time}
          </span>
        </div>

        <div
          className="rounded-2xl border border-brand-surface-2 bg-white p-3 sm:p-4 overflow-hidden"
          style={{ boxShadow: '0 16px 64px rgba(26, 10, 18, 0.14), 0 4px 20px rgba(26, 10, 18, 0.08)' }}
        >
          <YouTubePlayer videoUrl={event.recordingLink} restrictSeeking={false} />
        </div>

        {event.description && (
          <p className="mt-5 text-sm text-brand-text-muted leading-relaxed max-w-3xl">
            {event.description}
          </p>
        )}
      </motion.div>
    </DashboardLayout>
  )
}
