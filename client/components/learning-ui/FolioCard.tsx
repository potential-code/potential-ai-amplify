'use client'

/**
 * Folio primitives for Anna Studio: lesson content arrives in the thread as
 * flat cards (see sana-studio.css).
 *
 * Rules carried over from the VX folio direction:
 *  - The card title is the biggest thing on the card, with a quiet "kind line"
 *    above it in muted type ("Video, Unit 2"), never an eyebrow label above.
 *  - Exactly one accent action at a time: a gated action renders quiet until
 *    it can actually be taken.
 *  - Failure is amber, never red.
 */

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FolioInsert({
  title,
  kind,
  latest = true,
  children,
  footer,
  className,
}: {
  title?: ReactNode
  kind?: ReactNode
  latest?: boolean
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('sana-insert mb-4', className)} data-latest={latest ? 'true' : 'false'}>
      {(title || kind) && (
        <div className="px-[18px] pt-4">
          {kind && <p className="sana-kind mb-1">{kind}</p>}
          {title && <p className="text-[17px] font-semibold tracking-[-0.01em] text-ui-text leading-snug">{title}</p>}
        </div>
      )}
      {children && <div className="px-[18px] py-3.5 text-[14px] leading-relaxed">{children}</div>}
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pb-4">
          {footer}
        </div>
      )}
    </div>
  )
}

export function NextAction({
  children,
  gated = false,
  busy = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  /** True while a prerequisite holds the action back — renders the quiet style. */
  gated?: boolean
  busy?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  if (gated && !busy) {
    return (
      <span className="sana-quiet" aria-disabled="true">
        {children}
      </span>
    )
  }
  return (
    <button type="button" className="sana-next" disabled={disabled || busy} onClick={onClick}>
      {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function ResultBand({
  tone,
  score,
  children,
}: {
  tone: 'good' | 'warn'
  score?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cn('flex items-center gap-3.5 px-4 py-3', tone === 'good' ? 'sana-band-good' : 'sana-band-warn')}>
      {score !== undefined && <span className="text-2xl font-semibold leading-none flex-none tabular-nums">{score}</span>}
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  )
}

export function Receipt({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="sana-receipt my-2">
      <span className="flex items-center gap-2 min-w-0">{children}</span>
      {action}
    </div>
  )
}

export function FolioSkeleton() {
  return (
    <div className="sana-insert mb-4 p-[18px] animate-pulse space-y-3" data-latest="false" aria-hidden>
      <div className="h-4 w-2/3 rounded-md bg-ui-surface-2" />
      <div className="h-3 w-full rounded-md bg-ui-surface-2" />
      <div className="h-3 w-4/5 rounded-md bg-ui-surface-2" />
    </div>
  )
}
