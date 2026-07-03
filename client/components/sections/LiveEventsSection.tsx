'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock, ArrowRight, PlayCircle, Sparkles, MapPin } from 'lucide-react'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { MagneticButton } from '@/components/shared/MagneticButton'
import { fetchPublishedEvents, type LiveEvent } from '@/lib/api/liveEvents'

const DISPLAY_COUNT = 2

type EventItem = LiveEvent

function parseDate(d: string) {
  const [year = '', monthNum = '', dayRaw = ''] = d.split('-')
  const month = new Date(`${year}-${monthNum}-01`).toLocaleString('en-US', { month: 'short' })
  return { month, day: dayRaw.replace(/^0/, ''), year }
}

function EventCard({ event, index }: { event: EventItem; index: number }) {
  const { month, day, year } = parseDate(event.date)
  return (
    <motion.a
      href="/sign-up"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      whileHover={{ y: -6 }}
      className="group relative block rounded-3xl overflow-hidden border border-brand-surface-2 hover:border-brand-primary/40 bg-gradient-to-br from-brand-deep via-brand-deep to-brand-violet/50 text-white shadow-xl transition-all"
    >
      <div className="absolute inset-0 bg-noise opacity-[0.06] mix-blend-overlay pointer-events-none" />
      <div
        aria-hidden
        className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full bg-brand-primary/40 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute bottom-0 left-0 w-[280px] h-[280px] rounded-full bg-brand-violet/40 blur-3xl"
      />

      <div className="relative p-8 sm:p-10 min-h-[440px] flex flex-col">
        <div className="flex flex-wrap items-center gap-2 mb-7">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-bold uppercase tracking-[0.18em]">
            <Sparkles className="w-3 h-3 text-brand-primary-light" />
            {index === 0 ? 'Latest session' : 'Upcoming'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-200 text-[11px] font-bold uppercase tracking-[0.18em]">
            <PlayCircle className="w-3 h-3" />
            Replay available
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
            {event.type}
          </span>
        </div>

        {/* Calendar block */}
        <div className="flex items-stretch gap-5 mb-8">
          <div className="rounded-2xl bg-white text-brand-text-primary text-center px-5 py-4 shadow-2xl min-w-[96px]">
            <p className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">
              {month}
            </p>
            <p className="text-4xl font-black leading-none mt-1">{day}</p>
            <p className="text-[11px] text-brand-text-muted mt-1.5 font-bold tracking-wider">
              {year}
            </p>
          </div>
          <div className="text-white/85 text-sm flex flex-col justify-center gap-2">
            <p className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-brand-primary-light shrink-0" />
              <span>{event.time}</span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-brand-primary-light shrink-0" />
              <span>Online · global access</span>
            </p>
          </div>
        </div>

        <h3 className="text-2xl sm:text-3xl font-bold leading-tight max-w-md mb-4 group-hover:text-brand-primary-light transition-colors">
          {event.title}
        </h3>
        <p className="text-white/65 text-sm leading-relaxed max-w-lg">
          {event.description}
        </p>

        <div className="mt-auto pt-8 inline-flex items-center gap-2 text-sm font-bold text-brand-primary-light">
          Register to watch
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.a>
  )
}

export function LiveEventsSection() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPublishedEvents()
      .then((data) => {
        const latest = [...data]
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, DISPLAY_COUNT)
        setEvents(latest)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && events.length === 0) return null

  return (
    <section id="events" className="relative py-28 bg-mesh-soft overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
          <SectionHeader
            badge="Live Events"
            heading="Live"
            highlight="Events"
            align="left"
          />
          <MagneticButton href="/sign-up" variant="outline">
            Explore More
            <ArrowRight className="w-4 h-4 ml-2" />
          </MagneticButton>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-6 animate-pulse">
            <div className="rounded-3xl bg-brand-surface-2 min-h-[440px]" />
            <div className="rounded-3xl bg-brand-surface-2 min-h-[440px]" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {events.map((event, i) => (
              <EventCard key={event.title} event={event} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
