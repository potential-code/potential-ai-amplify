'use client'

/**
 * Learning-journey frame shared by Learning Path, Content on Demand and Blended
 * Learning: a header bar (title, progress, actions), the
 * conversation column, and a journey panel on the right that becomes a
 * scrolling milestone strip on smaller screens.
 *
 * Built on the redesign tokens (`ui-*`) so light and dark both work. The root
 * keeps the `sana-studio smeep-copilot` classes so the shared CopilotKit chat
 * overrides (transparent surfaces, centered thread, composer clearance) apply.
 */

import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { ArrowRight, Check, Lock } from 'lucide-react'
import { btn, ProgressBar } from '@/components/kit'
import { optimizedSrc } from '@/lib/images'
import { cn } from '@/lib/utils'

export const SANA_AVATAR = '/images/redesign/anna-avatar-96.png'

// ── Canvas ─────────────────────────────────────────────────────────────────────

export function JourneyCanvas({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sana-studio smeep-copilot journey-canvas relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-ui-bg text-ui-text',
        className,
      )}
      // One readable column, matching the design's 840px thread (776px content).
      style={{ ['--sana-thread-max' as string]: '776px' }}
    >
      {children}
    </div>
  )
}

// ── Header bar ─────────────────────────────────────────────────────────────────

export function JourneyHeader({
  leading,
  cover,
  title,
  subtitle,
  progress,
  actions,
  secondaryActions,
}: {
  leading?: ReactNode
  /** The path's cover image, shown as a thumbnail (from sm up) when there is no `leading`. */
  cover?: string | null
  title: ReactNode
  subtitle?: ReactNode
  /** "x of y done" readout with a small bar (hidden on phones). */
  progress?: { done: number; total: number; label?: string }
  /** Primary actions, always in the header row. */
  actions?: ReactNode
  /** Icon actions: in the header row on desktop, on their own row on phones. */
  secondaryActions?: ReactNode
}) {
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  return (
    <div className="relative z-[2] shrink-0 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 sm:py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        {leading ??
          (cover && (
            <img
              src={optimizedSrc(cover)}
              alt=""
              className="hidden h-10 w-14 shrink-0 rounded-lg bg-ui-surface-2 object-cover sm:block"
            />
          ))}
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ui-text sm:text-lg sm:leading-snug">
            {title}
          </h1>
          {subtitle && <p className="line-clamp-2 text-[13px] text-ui-muted sm:truncate">{subtitle}</p>}
        </div>
        {progress && (
          <div className="hidden items-center gap-2.5 pe-1.5 md:flex">
            <span className="whitespace-nowrap text-[13px] text-ui-muted">
              {progress.label ?? `${progress.done} of ${progress.total} done`}
            </span>
            <ProgressBar value={pct} className="w-[72px]" label="Journey progress" />
          </div>
        )}
        {actions}
        {secondaryActions && <div className="hidden items-center gap-3 sm:flex">{secondaryActions}</div>}
      </div>
      {secondaryActions && <div className="mt-3 flex items-center gap-3 sm:hidden">{secondaryActions}</div>}
    </div>
  )
}

/** Square icon button for the header bar (always labelled for screen readers). */
export function HeaderIconButton({
  label,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(btn({ variant: 'secondary', size: 'icon' }), 'h-9 w-9 text-ui-text', className)}
      {...props}
    >
      {children}
    </button>
  )
}

// ── Body: conversation + panel ─────────────────────────────────────────────────

export function JourneyBody({
  children,
  panel,
  panelOpen = true,
}: {
  children: ReactNode
  panel?: ReactNode
  panelOpen?: boolean
}) {
  return (
    <div className="relative z-[1] flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1 overflow-hidden smeep-assistant-chat">{children}</div>
      {panel && panelOpen && (
        <aside className="hidden w-[312px] shrink-0 flex-col gap-4 overflow-y-auto border-s border-ui-line bg-ui-surface px-4 py-5 xl:flex">
          {panel}
        </aside>
      )}
    </div>
  )
}

// ── Journey panel ──────────────────────────────────────────────────────────────

export interface PanelStep {
  key: string
  label: string
  value?: string
  state: 'done' | 'now' | 'todo'
}

export interface PanelItem {
  id: string
  title: string
  /** done · current (in progress / up next) · ready (open, untouched) · locked */
  state: 'done' | 'current' | 'ready' | 'locked'
  /** Short status under the title ("Up next", "Locked until milestone 2 is done"). */
  status?: ReactNode
  /** Quiet detail line ("16 blocks", "3 AI Amplify, 2 curated"). */
  detail?: ReactNode
  /** Short label for the phone strip ("2. Marketing planning"). */
  stripLabel?: string
  /** Progress shown after the strip label ("2 of 18"); never truncated. */
  stripCount?: string
  steps?: PanelStep[]
  progress?: { value: number; label: string }
  /** Milestone artwork, shown as a thumbnail when the panel asks for them. */
  image?: string | null
}

function Dot({ state, index }: { state: PanelItem['state']; index: number }) {
  if (state === 'done') {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ui-ok-soft text-ui-ok">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </span>
    )
  }
  if (state === 'locked') {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ui-surface-2 text-ui-muted">
        <Lock className="h-3 w-3" aria-hidden />
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
        state === 'current' ? 'bg-ui-brand text-white' : 'border-[1.5px] border-ui-line text-ui-muted',
      )}
    >
      {index + 1}
    </span>
  )
}

function StepRow({ step }: { step: PanelStep }) {
  return (
    <li className="flex items-center gap-2.5 text-[13px]">
      <span
        aria-hidden
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          step.state === 'done' && 'text-ui-ok',
          step.state === 'now' && 'border-[5px] border-ui-brand',
          step.state === 'todo' && 'border-[1.5px] border-ui-line',
        )}
      >
        {step.state === 'done' && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
      </span>
      <span className={cn('min-w-0 flex-1', step.state === 'now' ? 'font-semibold text-ui-text' : 'text-ui-muted')}>
        {step.label}
        <span className="sr-only">{step.state === 'done' ? ', done' : step.state === 'now' ? ', current' : ''}</span>
      </span>
      {step.value && <span className="shrink-0 text-xs text-ui-muted">{step.value}</span>}
    </li>
  )
}

export function JourneyPanel({
  title = 'Your journey',
  count,
  progress,
  note,
  items,
  onSelect,
  footer,
  thumbnails = false,
}: {
  title?: string
  count?: ReactNode
  progress?: { value: number; label: ReactNode }
  note?: ReactNode
  items: PanelItem[]
  onSelect?: (id: string) => void
  footer?: ReactNode
  /** Show each milestone's image (where it has one) at the end of its row. */
  thumbnails?: boolean
}) {
  return (
    <>
      <div className="flex flex-col gap-2 px-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ui-text">{title}</h2>
          {count && <span className="text-xs text-ui-muted">{count}</span>}
        </div>
        {progress && (
          <div className="flex items-center gap-2.5">
            <ProgressBar value={progress.value} className="flex-1" label="Journey progress" />
            <span className="whitespace-nowrap text-xs font-semibold text-ui-text">{progress.label}</span>
          </div>
        )}
        {note && <p className="text-xs text-ui-muted">{note}</p>}
      </div>
      <ol className="flex flex-col gap-0.5">
        {items.map((m, i) => {
          const clickable = !!onSelect && m.state !== 'locked'
          const current = m.state === 'current'
          const thumb = thumbnails && m.image ? optimizedSrc(m.image) : null
          const cols = thumb ? 'grid-cols-[24px_minmax(0,1fr)_64px]' : 'grid-cols-[24px_minmax(0,1fr)]'
          const body = (
            <>
              <Dot state={m.state} index={i} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    'text-[13px] leading-[1.4]',
                    current ? 'font-semibold text-ui-text' : m.state === 'done' ? 'text-ui-muted' : 'text-ui-text',
                  )}
                >
                  {m.title}
                </span>
                {m.status && (
                  <span
                    className={cn(
                      'text-xs',
                      m.state === 'done' ? 'font-medium text-ui-ok' : current ? 'font-medium text-ui-brand-text' : 'text-ui-muted',
                    )}
                  >
                    {m.status}
                  </span>
                )}
                {m.detail && <span className="text-xs text-ui-muted">{m.detail}</span>}
                {current && m.progress && (
                  <span className="mt-1 flex items-center gap-2">
                    <ProgressBar value={m.progress.value} className="flex-1 bg-ui-surface" />
                    <span className="whitespace-nowrap text-xs font-semibold text-ui-brand-text">{m.progress.label}</span>
                  </span>
                )}
              </span>
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  className={cn(
                    'h-12 w-16 self-center rounded-lg bg-ui-surface-2 object-cover',
                    m.state === 'locked' && 'opacity-60 grayscale',
                  )}
                />
              )}
            </>
          )
          return (
            <li key={m.id} aria-current={current ? 'step' : undefined} className={cn('rounded-[10px]', current && 'bg-ui-brand-soft')}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect!(m.id)}
                  className={cn(
                    'grid w-full gap-2.5 rounded-[10px] p-2 text-start',
                    cols,
                    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
                    current ? 'py-2.5' : 'hover:bg-ui-surface-2',
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className={cn('grid gap-2.5 p-2', cols)}>{body}</div>
              )}
              {current && m.steps && m.steps.length > 0 && (
                <ul className="flex flex-col gap-2 pb-3 pe-2 ps-[42px]" aria-label={`${m.title} steps`}>
                  {m.steps.map((s) => (
                    <StepRow key={s.key} step={s} />
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      {footer}
    </>
  )
}

/** Dashed explainer box at the bottom of the panel ("How each milestone works"). */
export function PanelNote({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-dashed border-ui-line p-3">
      <span className="text-[13px] font-semibold text-ui-text">{title}</span>
      <div className="text-xs leading-relaxed text-ui-muted">{children}</div>
    </div>
  )
}

// ── Phone / tablet milestone strip ─────────────────────────────────────────────

export function MilestoneStrip({
  items,
  onSelect,
  label = 'Your journey',
}: {
  items: PanelItem[]
  onSelect?: (id: string) => void
  label?: string
}) {
  const navRef = useRef<HTMLElement>(null)
  const currentId = items.find((m) => m.state === 'current')?.id
  // Keep the current milestone in view (scrolls the strip only, never the page).
  useEffect(() => {
    const nav = navRef.current
    const chip = nav?.querySelector<HTMLElement>('[aria-current="step"]')
    if (nav && chip) nav.scrollLeft = Math.max(0, chip.offsetLeft - nav.offsetLeft - 16)
  }, [currentId])
  if (items.length === 0) return null
  return (
    <nav
      ref={navRef}
      aria-label={label}
      className="relative z-[2] flex shrink-0 gap-1.5 overflow-x-auto border-b border-ui-line bg-ui-surface px-4 py-2.5 sm:px-6 xl:hidden"
    >
      {items.map((m, i) => {
        const current = m.state === 'current'
        const locked = m.state === 'locked'
        return (
          <button
            key={m.id}
            type="button"
            disabled={locked || !onSelect}
            aria-current={current ? 'step' : undefined}
            onClick={() => onSelect?.(m.id)}
            className={cn(
              'inline-flex h-8 max-w-[260px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
              current
                ? 'border-ui-brand bg-ui-brand-soft font-semibold text-ui-brand-text'
                : 'border-ui-line bg-ui-surface font-medium text-ui-text hover:bg-ui-surface-2',
              locked && 'cursor-not-allowed text-ui-muted hover:bg-ui-surface',
            )}
          >
            {m.state === 'done' && <Check className="h-3.5 w-3.5 text-ui-ok" strokeWidth={2.5} aria-hidden />}
            {locked && <Lock className="h-3 w-3" aria-hidden />}
            <span className="truncate">{m.stripLabel ?? `${i + 1}. ${m.title}`}</span>
            {m.stripCount && <span className="shrink-0">, {m.stripCount}</span>}
          </button>
        )
      })}
    </nav>
  )
}

// ── Intro (pre-conversation) column ────────────────────────────────────────────

/** Scrollable overlay over the chat that holds the opening turn of a journey. */
export function JourneyIntro({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-ui-bg">
      <div className="mx-auto flex w-full max-w-[840px] flex-1 flex-col gap-4 px-4 py-5 sm:px-8 sm:py-7">{children}</div>
      {footer}
    </div>
  )
}

/** One of Anna's lines, as a bubble beside her portrait (or a custom avatar). */
export function SanaLine({ children, avatar }: { children: ReactNode; avatar?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      {avatar ?? (
        <img src={SANA_AVATAR} alt="Anna" className="h-8 w-8 shrink-0 rounded-full object-cover object-top" />
      )}
      {/* No box: Anna's lines sit on the page, like her chat replies. */}
      <div className="min-w-0 max-w-[680px] pt-1.5 text-[15px] leading-relaxed text-ui-text">
        {children}
      </div>
    </div>
  )
}

/**
 * The learner's reply as a right-aligned brand bubble. With onClick it is a
 * suggested reply instead: an outlined chip with an arrow, so it never reads
 * as something the learner already sent. Clicking it sends it.
 */
export function LearnerLine({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex max-w-[520px] items-center gap-2 self-end rounded-full border border-ui-brand/40 bg-ui-surface py-2 ps-4 pe-3 text-start text-[15px] font-medium leading-snug text-ui-brand-text shadow-ui transition-colors hover:border-ui-brand hover:bg-ui-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
      >
        <span>{children}</span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
      </button>
    )
  }
  return (
    <div className="max-w-[520px] self-end rounded-[16px_4px_16px_16px] bg-ui-brand px-3.5 py-2.5 text-start text-[15px] leading-normal text-white">
      {children}
    </div>
  )
}

/** Card indent that lines content up with Anna's bubble on wider screens. */
export const leadIndent = 'md:ms-[42px]'
