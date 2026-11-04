'use client'

import { cn } from '@/lib/utils'

/** The usual follow-ups a learner asks about the card in front of them. */
export const DEFAULT_FOLLOW_UPS = ['Explain it simpler', 'Give me an example for my business', 'Show my path']

/** Quick replies under the current card; each one is sent to Anna as the learner's message. */
export function FollowUpChips({
  onSend,
  options = DEFAULT_FOLLOW_UPS,
  className,
}: {
  onSend: (text: string) => void
  options?: string[]
  className?: string
}) {
  return (
    <div role="group" aria-label="Ask Anna" className={cn('mb-3 flex flex-wrap gap-1.5', className)}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onSend(o)}
          className="inline-flex h-8 items-center rounded-full border border-ui-line bg-ui-surface px-3 text-[13px] font-medium text-ui-text transition-colors hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
        >
          {o}
        </button>
      ))}
    </div>
  )
}
