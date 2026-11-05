'use client'

/**
 * Pieces for the opening turn of the milestone journeys (Content on Demand,
 * Blended): the "What you asked for" profile card, the recap of the
 * last finished milestone, and the list of items waiting in the next one.
 */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check, FileText, GraduationCap, ImageIcon, ListChecks, Lock, PlayCircle } from 'lucide-react'
import { optimizedSrc } from '@/lib/images'
import { cn } from '@/lib/utils'
import { leadIndent } from './JourneyKit'

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface ContentRowData {
  id: string
  title: string
  kind: 'video' | 'article' | 'smeep-video' | 'smeep-text' | 'smeep-image' | 'smeep-question'
  meta?: string
  note?: string | null
  done?: boolean
  locked?: boolean
}

const KIND_ICON: Record<ContentRowData['kind'], LucideIcon> = {
  video: PlayCircle,
  article: FileText,
  'smeep-video': PlayCircle,
  'smeep-text': GraduationCap,
  'smeep-image': ImageIcon,
  'smeep-question': ListChecks,
}

export function ContentRows({ rows }: { rows: ContentRowData[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((r) => {
        const Icon = KIND_ICON[r.kind]
        return (
          <li key={r.id} className="flex items-start gap-3 border-t border-ui-line py-3 first:border-t-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ui-surface-2 text-ui-muted">
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold leading-snug text-ui-text">{r.title}</span>
              {r.meta && <span className="text-[13px] text-ui-muted">{r.meta}</span>}
              {r.note && <span className="text-[13px] text-ui-muted">{r.note}</span>}
            </span>
            {r.done ? (
              <span className="mt-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ui-ok-soft text-ui-ok">
                <Check className="h-3 w-3" strokeWidth={2.5} aria-label="Completed" />
              </span>
            ) : r.locked ? (
              <Lock className="mt-2 h-4 w-4 shrink-0 text-ui-muted" aria-label="Locked" />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** "What you asked for": the learner's goal, topics and the shape of the path. */
export function AskedForCard({
  cover,
  goal,
  topics,
  aside,
  facts,
  children,
}: {
  /** The path's cover image, as a banner across the top of the card. */
  cover?: string | null
  goal?: string | null
  topics?: string[]
  aside?: ReactNode
  facts: { label: string; value: ReactNode }[]
  children?: ReactNode
}) {
  return (
    <article
      aria-labelledby="asked-for"
      className={cn('flex flex-col gap-3 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface p-4 sm:p-[18px]', leadIndent)}
    >
      {cover && (
        <img
          src={optimizedSrc(cover)}
          alt=""
          className="-mx-4 -mt-4 mb-1 h-28 w-[calc(100%+2rem)] max-w-none bg-ui-surface-2 object-cover sm:-mx-[18px] sm:-mt-[18px] sm:h-36 sm:w-[calc(100%+36px)]"
        />
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="asked-for" className="text-base font-semibold text-ui-text">
          What you asked for
        </h2>
        {aside && <span className="text-xs text-ui-muted">{aside}</span>}
      </div>
      {goal && <p className="rounded-[10px] bg-ui-brand-soft px-3.5 py-3 text-[15px] leading-relaxed text-ui-text">{goal}</p>}
      {topics && topics.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
          {topics.map((t) => (
            <li key={t} className="rounded-full bg-ui-surface-2 px-2.5 py-1 text-xs font-medium text-ui-muted">
              {t}
            </li>
          ))}
        </ul>
      )}
      {children}
      {facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-ui-line pt-3 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-ui-muted">{f.label}</dt>
              <dd className="m-0 text-sm font-semibold text-ui-text">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}

/** Recap of a finished milestone: stat tiles plus the items covered. */
export function MilestoneRecapCard({
  index,
  title,
  stats,
  rows,
}: {
  index: number
  title: string
  stats: { icon: LucideIcon; label: string; value: string }[]
  rows: ContentRowData[]
}) {
  return (
    <article className={cn('flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-4 sm:p-[18px]', leadIndent)}>
      <span className="inline-flex h-6 w-fit items-center gap-1.5 rounded-full bg-ui-ok-soft px-2.5 text-xs font-semibold text-ui-ok">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        Milestone {index} complete
      </span>
      <h2 className="text-lg font-semibold leading-snug text-ui-text">{title}</h2>
      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 rounded-[10px] bg-ui-bg px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs text-ui-muted">
                <s.icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                {s.label}
              </dt>
              <dd className="m-0 text-sm font-semibold text-ui-text">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {rows.length > 0 && (
        <div className="border-t border-ui-line">
          <ContentRows rows={rows} />
        </div>
      )}
    </article>
  )
}

/** Items waiting in the next milestone ("Unlocks after the knowledge check"). */
export function UpNextCard({ heading, locked, rows }: { heading: string; locked?: boolean; rows: ContentRowData[] }) {
  if (rows.length === 0) return null
  return (
    <section
      aria-label={heading}
      className={cn('flex flex-col gap-1 rounded-[14px] border border-dashed border-ui-line bg-ui-surface px-4 pb-1 pt-4 sm:px-[18px]', leadIndent)}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ui-text">
        {locked && <Lock className="h-4 w-4 text-ui-muted" aria-hidden />}
        {heading}
      </h2>
      <ContentRows rows={rows} />
    </section>
  )
}
