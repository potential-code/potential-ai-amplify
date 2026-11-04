'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, ChevronDown, Play, Sparkles } from 'lucide-react'
import { btn, Card, FilterChips } from '@/components/kit'
import { JOURNEY_COURSES, LANDING_COURSE_PICKS, REDESIGN_ASSETS } from '@/lib/constants/content'
import { cn } from '@/lib/utils'

const TRACKS = [
  { value: 'core', label: 'Core AI courses' },
  { value: 'skills', label: 'Business skills' },
  { value: 'resources', label: 'Additional resources' },
] as const
type Track = (typeof TRACKS)[number]['value']

/** The Entrepreneur's Journey: six core AI courses, a business-skills library and partner resources. */
export function LandingCourses() {
  const [active, setActive] = useState<Track>('core')

  return (
    <section id="courses" aria-labelledby="h-courses" className="scroll-mt-[68px] pb-9 pt-2">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[22px] px-4 min-[900px]:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-col gap-2">
            <h2 id="h-courses" className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ui-text min-[900px]:text-[30px]">
              The Entrepreneur&apos;s Journey
            </h2>
            <p className="max-w-[640px] text-base leading-[1.55] text-ui-muted">
              Six core AI courses, each with a final exam and certificate, plus a library of business skills. Learn at
              your own pace.
            </p>
          </div>
          <FilterChips label="Course tracks" active={active} onChange={(v) => setActive(v as Track)} className="max-w-full" options={TRACKS} />
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {active === 'core' && <CoreTrackCard />}
          {active === 'skills' && <SkillsTrackCard />}
          {active === 'resources' && <ResourcesCard />}

          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ui-muted">More courses</span>
              <Link href="/dashboard/courses" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ui-brand-text hover:underline">
                Browse all courses
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 min-[700px]:grid-cols-3">
              {LANDING_COURSE_PICKS.map((c) => (
                <Link
                  key={c.title}
                  href="/sign-up"
                  className="group flex flex-col overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-ui"
                >
                  <span className="block aspect-[16/10] overflow-hidden">
                    <img
                      src={c.cover}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                  </span>
                  <span className="flex flex-col gap-0.5 px-3.5 py-2.5">
                    <span className="text-[15px] font-semibold leading-snug">{c.title}</span>
                    <span className="text-[13px] text-ui-muted">Business skills, certificate</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function TrackBanner({ title, meta, art }: { title: string; meta: string; art: string }) {
  return (
    <div className="relative h-[168px] overflow-hidden bg-[#3b1c54]">
      <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#24103a] via-[#24103a]/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-[22px] text-[#e7d6f9]">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.16] backdrop-blur-sm">
          <Sparkles className="h-[22px] w-[22px]" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="h-track" className="text-lg font-semibold leading-snug text-white">
            {title}
          </h3>
          <span className="text-[13px]">{meta}</span>
        </div>
      </div>
    </div>
  )
}

/** The six core courses; each one opens to its units. */
function CoreTrackCard() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Card className="flex flex-col overflow-hidden shadow-ui" aria-labelledby="h-track">
      <TrackBanner
        title="Core AI courses"
        meta={`${JOURNEY_COURSES.courses.length} courses, final exams, certificates`}
        art="/images/redesign/journey-1-training.png"
      />
      <ul className="flex flex-1 flex-col px-[22px] py-2">
        {JOURNEY_COURSES.courses.map((c, i) => {
          const isOpen = open === i
          const panelId = `core-course-${i}`
          return (
            <li key={c.title} className={cn(i > 0 && 'border-t border-ui-line')}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm font-semibold text-ui-text"
              >
                <span className="min-w-0">
                  {c.title}
                  <span className="ml-2 font-normal text-ui-muted">{c.units.length} units</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-ui-muted transition-transform', isOpen && 'rotate-180')} aria-hidden />
              </button>
              {isOpen && (
                <ol id={panelId} className="mb-2 flex flex-col">
                  {c.units.map((u) => (
                    <li key={u} className="flex items-center gap-3 py-1.5 pl-1 text-sm text-ui-muted">
                      <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {u}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          )
        })}
      </ul>
      <div className="px-[22px] pb-[22px] pt-2">
        <Link href="/sign-up" className={cn(btn(), 'w-full')}>
          Start learning
        </Link>
      </div>
    </Card>
  )
}

function SkillsTrackCard() {
  return (
    <Card className="flex flex-col overflow-hidden shadow-ui" aria-labelledby="h-track">
      <TrackBanner title="Business skills" meta="Short courses with certificates" art="/images/redesign/journey-4-private.png" />
      <ul className="flex flex-1 flex-col px-[22px] py-2">
        {LANDING_COURSE_PICKS.map((c, i) => (
          <li key={c.title} className={cn('flex items-center gap-3 py-2.5 text-sm text-ui-text', i > 0 && 'border-t border-ui-line')}>
            <BookOpen className="h-4 w-4 shrink-0 text-ui-muted" aria-hidden />
            <span className="min-w-0 flex-1">{c.title}</span>
            <span className="text-[13px] text-ui-muted">{c.units} units</span>
          </li>
        ))}
      </ul>
      <div className="px-[22px] pb-[22px] pt-2">
        <Link href="/sign-up" className={cn(btn(), 'w-full')}>
          Start learning
        </Link>
      </div>
    </Card>
  )
}

function ResourcesCard() {
  return (
    <Card id="additional-resources" className="flex flex-col overflow-hidden shadow-ui" aria-labelledby="h-track">
      <TrackBanner title="Additional resources" meta="Learning from Potential and its partners" art="/images/redesign/journey-3-tools.png" />
      <div className="flex flex-1 flex-col justify-center gap-4 px-[22px] py-5">
        <p className="text-sm leading-relaxed text-ui-muted">
          Members also get extra learning resources from Potential and its technology partners, alongside the core
          courses.
        </p>
        <img
          src={REDESIGN_ASSETS.additionalResources.src}
          alt={REDESIGN_ASSETS.additionalResources.alt}
          className="w-full rounded-[10px] border border-ui-line bg-white object-contain p-3"
          loading="lazy"
        />
      </div>
    </Card>
  )
}
