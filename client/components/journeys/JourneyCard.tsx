'use client'

/**
 * Content cards that arrive in a journey conversation: a lesson block, a
 * curated video or article, a knowledge check, a quiz, a simulation. One card
 * shape for all of them: a tag pill and meta line, a title, the body, an
 * optional "why this" line, and a footer bar with the one action that moves
 * the learner on.
 */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check, Info, Loader2, Lock } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'

type TagTone = 'brand' | 'neutral' | 'solid' | 'ok' | 'outline'

const TAG_TONES: Record<TagTone, string> = {
  brand: 'bg-ui-brand-soft text-ui-brand-text',
  neutral: 'bg-ui-surface-2 text-ui-muted',
  solid: 'bg-ui-brand text-white',
  ok: 'bg-ui-ok-soft text-ui-ok',
  outline: 'border border-ui-line bg-ui-surface text-ui-text',
}

export function CardTag({ icon: Icon, tone = 'brand', children }: { icon?: LucideIcon; tone?: TagTone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', TAG_TONES[tone])}>
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
      {children}
    </span>
  )
}

export function JourneyCard({
  tag,
  meta,
  title,
  children,
  why,
  footer,
  footerClassName,
  latest = false,
  className,
}: {
  tag?: ReactNode
  meta?: ReactNode
  title?: ReactNode
  children?: ReactNode
  why?: ReactNode
  /** Footer bar content (source line + action). */
  footer?: ReactNode
  footerClassName?: string
  /** The card the learner is working on now gets a soft lift. */
  latest?: boolean
  className?: string
}) {
  return (
    <article
      className={cn(
        'my-3 overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface text-ui-text',
        latest && 'shadow-ui',
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 px-4 pt-4 sm:px-[18px]">
        {(tag || meta) && (
          <div className="flex flex-wrap items-center gap-2">
            {tag}
            {meta && <span className="text-[13px] text-ui-muted">{meta}</span>}
          </div>
        )}
        {title && <h3 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-ui-text">{title}</h3>}
        {children && <div className="text-[15px] leading-relaxed">{children}</div>}
        {why && (
          <p className="flex items-start gap-2 text-[13px] text-ui-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>{why}</span>
          </p>
        )}
      </div>
      {footer ? (
        <div
          className={cn(
            'mt-3.5 flex flex-col items-stretch gap-2.5 border-t border-ui-line bg-ui-bg px-4 py-3 sm:flex-row sm:items-center sm:px-[18px]',
            footerClassName,
          )}
        >
          {footer}
        </div>
      ) : (
        <div className="h-4" />
      )}
    </article>
  )
}

/** Muted text that fills the footer's left side. */
export function FooterNote({ children, className }: { children?: ReactNode; className?: string }) {
  return <span className={cn('flex-1 text-[13px] text-ui-muted', className)}>{children}</span>
}

/** "Finish watching to unlock" style hint for a gated action. */
export function GateNote({ children }: { children: ReactNode }) {
  return (
    <span className="flex flex-1 items-center gap-1.5 text-[13px] text-ui-muted">
      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  )
}

/** Green "Completed" line for a finished card. */
export function DoneNote({ children = 'Completed' }: { children?: ReactNode }) {
  return (
    <span className="flex flex-1 items-center gap-1.5 text-[13px] font-semibold text-ui-ok">
      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      {children}
    </span>
  )
}

/**
 * The single forward action on a card. While a prerequisite holds it back
 * (`gated`) it renders as a quiet, disabled secondary button.
 */
export function CardAction({
  children,
  onClick,
  gated = false,
  busy = false,
  disabled = false,
  variant = 'primary',
}: {
  children: ReactNode
  onClick?: () => void
  gated?: boolean
  busy?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={gated || disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        btn({ variant: gated ? 'secondary' : variant, size: 'md' }),
        'h-9 w-full sm:w-auto',
        gated && 'text-ui-muted',
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/** Score band for knowledge checks and quizzes: green for pass, neutral for "not yet". */
export function ResultBand({ tone, score, children }: { tone: 'good' | 'neutral'; score?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-[10px] px-3.5 py-3',
        tone === 'good' ? 'bg-ui-ok-soft text-ui-ok' : 'bg-ui-surface-2 text-ui-text',
      )}
    >
      {score !== undefined && <span className="shrink-0 text-[22px] font-bold leading-none tabular-nums">{score}</span>}
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

/** One segment per question; segments up to the current one are filled. */
export function QuizSegments({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn('h-[3px] flex-1 rounded-full transition-colors', i <= current ? 'bg-ui-brand' : 'bg-ui-surface-2')}
        />
      ))}
    </div>
  )
}

/** Radio-style answer option (design `.opt`). */
export function QuizChoice({
  selected,
  onSelect,
  disabled,
  children,
}: {
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-[11px] text-start text-sm leading-[1.45] text-ui-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
        selected ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line bg-ui-surface hover:bg-ui-surface-2',
        disabled && !selected && 'opacity-60',
      )}
    >
      <span
        aria-hidden
        className={cn('h-4 w-4 shrink-0 rounded-full', selected ? 'border-[5px] border-ui-brand' : 'border-[1.5px] border-ui-line')}
      />
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

export function JourneyCardSkeleton() {
  return (
    <div className="my-3 flex flex-col gap-2.5 rounded-[14px] border border-ui-line bg-ui-surface p-4" aria-hidden>
      <div className="h-5 w-24 animate-pulse rounded-full bg-ui-surface-2" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-ui-surface-2" />
      <div className="h-3 w-full animate-pulse rounded bg-ui-surface-2" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-ui-surface-2" />
    </div>
  )
}

/** Placeholder rows while a card's own data loads. */
export function CardLoadingRows() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-[10px] bg-ui-surface-2" />
      ))}
    </div>
  )
}

/** Small inline notice inside the thread (e.g. "Preparing your content…"). */
export function ThreadNotice({ children }: { children: ReactNode }) {
  return (
    <div className="my-2 rounded-[10px] border border-ui-line bg-ui-surface px-4 py-3 text-sm text-ui-muted">
      {children}
    </div>
  )
}
