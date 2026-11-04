'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarPlus, Play } from 'lucide-react'
import { btn, Chip, FilterChips, Skeleton } from '@/components/kit'
import { fetchPublishedEvents, type LiveEvent } from '@/lib/api/liveEvents'
import { fetchPublicOffers, type Offer } from '@/lib/api/offers'
import { cn } from '@/lib/utils'
import { optimizedSrc } from '@/lib/images'

const SHOW = 3

/** Event rows without their own cover use the program's events art. */
const EVENT_ART = '/images/redesign/journey-6-events.png'

function parseDate(d: string) {
  const [year = '', month = '', day = ''] = d.split('-')
  const label = new Date(`${year}-${month}-01T00:00:00`).toLocaleString('en-US', { month: 'short' })
  return { month: label, day: day.replace(/^0/, ''), year }
}

/** "5:00 PM / GST - UAE time" → "5:00 PM GST (UAE time)" (no dashes in visible copy). */
function tidyTime(t: string) {
  const m = t.match(/^(.*?)\s*\/\s*(\w+)\s*-\s*(.*)$/)
  return m ? `${m[1]} ${m[2]} (${m[3]})` : t.replace(/\s+[-–—]\s+/g, ', ')
}

export function LandingEventsOffers() {
  const [events, setEvents] = useState<LiveEvent[] | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const [offers, setOffers] = useState<Offer[] | null>(null)

  useEffect(() => {
    fetchPublishedEvents()
      .then((data) => {
        setLoadedAt(Date.now())
        setEvents([...data].sort((a, b) => b.startsAt.localeCompare(a.startsAt)))
      })
      .catch(() => setEvents([]))
    fetchPublicOffers()
      .then(setOffers)
      .catch(() => setOffers([]))
  }, [])

  // Both empty after loading: nothing honest to show.
  if (events?.length === 0 && offers?.length === 0) return null

  return (
    <section aria-labelledby="h-evof" className="pb-9 pt-2">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex max-w-[820px] flex-col gap-2">
          <h2 id="h-evof" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
            Events and AI tools
          </h2>
          <p className="text-base leading-[1.55] text-ui-muted">
            Live webinars with AI and business experts, plus AI tools you can set up for your business, paid monthly
            or with learning points.
          </p>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-5 min-[900px]:grid-cols-2">
          {events?.length !== 0 && <EventsCard events={events} now={loadedAt} />}
          {offers?.length !== 0 && <OffersCard offers={offers} />}
        </div>
      </div>
    </section>
  )
}

function CardTop({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-[22px] py-3.5">
      <h3 className="text-[17px] font-semibold text-ui-text">{title}</h3>
      <span className="text-[13px] text-ui-muted">{meta}</span>
    </div>
  )
}

function CardFoot({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-auto border-t border-ui-line px-[22px] py-3.5">
      <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ui-brand-text hover:underline">
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}

function EventsCard({ events, now }: { events: LiveEvent[] | null; now: number }) {
  const allWebinars = !!events?.length && events.every((e) => /webinar/i.test(e.type))
  const noun = allWebinars ? 'webinar' : 'event'
  return (
    <div id="events" className="flex scroll-mt-[84px] flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
      <CardTop title="Live events" meta="Online, with global access" />
      {events === null ? (
        <div className="flex flex-col gap-2 border-t border-ui-line px-[22px] py-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[52px]" />
          ))}
        </div>
      ) : (
        <ul>
          {events.slice(0, SHOW).map((ev) => {
            const { month, day, year } = parseDate(ev.date)
            const upcoming = Date.parse(ev.endsAt) > now
            return (
              <li
                key={ev.id}
                className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 border-t border-ui-line px-[22px] py-3 min-[900px]:grid-cols-[120px_minmax(0,1fr)_auto]"
              >
                <span className="row-span-2 block aspect-[2/1] overflow-hidden rounded-[10px] bg-ui-surface-2 min-[900px]:row-span-1">
                  <img src={optimizedSrc(ev.coverImage) || EVENT_ART} alt="" loading="lazy" className="h-full w-full object-cover" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[12px] font-semibold text-ui-brand-text">
                    {month} {day}, {year}
                  </span>
                  <span className="text-[15px] font-semibold leading-snug text-ui-text">{ev.title}</span>
                  <span className="text-[13px] text-ui-muted">
                    {ev.type}, {tidyTime(ev.time)}
                  </span>
                </span>
                <Link
                  href={upcoming ? '/sign-up' : '/dashboard/events'}
                  className="col-start-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ui-brand-text hover:underline min-[900px]:col-start-3"
                >
                  {upcoming ? (
                    <>
                      <CalendarPlus className="h-[15px] w-[15px]" aria-hidden />
                      Register to join
                    </>
                  ) : (
                    <>
                      <Play className="h-[15px] w-[15px]" aria-hidden />
                      {ev.recordingLink ? 'Watch recording' : 'View details'}
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {events && events.length > 0 && (
        <CardFoot href="/dashboard/events" label={`Browse all event recordings (${events.length} ${noun}${events.length === 1 ? '' : 's'})`} />
      )}
    </div>
  )
}

function OffersCard({ offers }: { offers: Offer[] | null }) {
  const [active, setActive] = useState('All')
  const categories = ['All', ...Array.from(new Set((offers ?? []).map((o) => o.category)))]
  const filtered = active === 'All' ? (offers ?? []) : (offers ?? []).filter((o) => o.category === active)

  return (
    <div id="offers" className="flex scroll-mt-[84px] flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface">
      <CardTop title="AI tools and offers" meta="Pay monthly or with points" />
      {offers === null ? (
        <div className="flex flex-col gap-2 border-t border-ui-line px-[22px] py-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[52px]" />
          ))}
        </div>
      ) : (
        <>
          {categories.length > 2 && (
            <FilterChips
              label="Filter offers by category"
              active={active}
              onChange={setActive}
              className="mx-0 border-t border-ui-line px-[22px] py-2.5 [&>button]:h-[30px] [&>button]:px-3"
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          )}
          <ul>
            {filtered.slice(0, SHOW).map((o) => (
              <li
                key={o.id}
                className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-t border-ui-line px-[22px] py-3 min-[900px]:grid-cols-[120px_minmax(0,1fr)_auto]"
              >
                <span className="row-span-2 block aspect-[2/1] overflow-hidden rounded-[10px] border border-ui-line bg-white min-[900px]:row-span-1">
                  <img src={optimizedSrc(o.imageUrl) || '/images/redesign/journey-5-offers.png'} alt="" loading="lazy" className="h-full w-full object-cover" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 text-[15px] font-semibold leading-[1.35] text-ui-text">{o.title}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Chip className="h-5 text-[11px] font-medium">{o.category}</Chip>
                    <strong className="font-semibold text-ui-text">{o.priceLabel}</strong>
                    {o.priceBefore && <s className="text-ui-muted">{o.priceBefore}</s>}
                    {o.pointsCost > 0 && <span className="text-ui-muted">{o.pointsCost} points</span>}
                  </span>
                </span>
                <Link
                  href={`/dashboard/offers/${o.id}`}
                  className={cn(btn({ variant: 'secondary', size: 'sm' }), 'col-start-2 h-[34px] justify-self-start min-[900px]:col-start-3')}
                >
                  View offer
                </Link>
              </li>
            ))}
          </ul>
          <CardFoot href="/dashboard/offers" label="See all offers" />
        </>
      )}
    </div>
  )
}
