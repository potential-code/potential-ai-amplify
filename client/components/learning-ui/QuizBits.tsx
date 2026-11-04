'use client'

/**
 * Quiz building blocks shared by the pretest/quiz cards: a segment progress
 * bar (one segment per question) and lettered answer options.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function QuizSegments({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1 mb-3.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn('h-1 flex-1 rounded-full transition-colors', i <= current ? 'bg-ui-brand' : 'bg-ui-surface-2')}
        />
      ))}
    </div>
  )
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function QuizOption({
  index,
  selected,
  onSelect,
  children,
}: {
  index: number
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full flex items-center gap-3 text-start rounded-[10px] border px-3.5 py-2.5 text-[14px] text-ui-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand',
        selected ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line bg-ui-surface hover:bg-ui-surface-2',
      )}
    >
      <span
        className={cn(
          'w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold flex-none border transition-colors',
          selected ? 'bg-ui-brand border-ui-brand text-white' : 'border-ui-line text-ui-muted',
        )}
      >
        {LETTERS[index] ?? index + 1}
      </span>
      {children}
    </button>
  )
}
