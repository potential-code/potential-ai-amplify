'use client'

/**
 * Opening turn of the discovery chat for Content on Demand and Blended
 * Learning: Anna introduces the questionnaire and offers topic starters. The
 * learner can also just type a goal in the composer below.
 */

import { Check } from 'lucide-react'
import { getUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { SanaLine, leadIndent } from './JourneyKit'
import { SanaChatInput } from '@/components/learning-ui/SanaChatInput'

export function DiscoveryIntro({
  journeyName,
  topics,
  onTopic,
  prompt = 'Start with a topic, or type your own goal below.',
}: {
  journeyName: string
  topics: string[]
  onTopic: (topic: string) => void
  prompt?: string
}) {
  const firstName = (getUser()?.fullName ?? '').trim().split(/\s+/)[0]
  return (
    <>
      <SanaLine>
        {firstName ? `Hi ${firstName}, I'm Anna. ` : "Hi, I'm Anna. "}I&apos;ll ask a few quick questions and build a {journeyName} path
        made for you. It takes under 2 minutes.
      </SanaLine>
      <article aria-labelledby="discovery-start" className={cn('flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-4 shadow-ui sm:px-[18px]', leadIndent)}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="discovery-start" className="text-[17px] font-semibold leading-snug text-ui-text">
            What do you want to learn?
          </h2>
          <span className="shrink-0 pt-1 text-xs text-ui-muted">Step 1 of 3</span>
        </div>
        <p className="text-sm text-ui-muted">{prompt}</p>
        <div role="group" aria-label="Topics" className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTopic(t)}
              className="inline-flex min-h-[38px] items-center rounded-full border border-ui-line bg-ui-surface px-4 text-[13px] font-medium text-ui-text transition-colors hover:bg-ui-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
            >
              {t}
            </button>
          ))}
        </div>
        <ol className="mt-1 flex flex-col gap-2 border-t border-ui-line pt-3">
          {['Your level and how you like to learn', 'Anna builds your milestones'].map((text, i) => (
            <li key={text} className="flex items-center gap-2 text-[13px] text-ui-muted">
              <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ui-line text-[10px] font-bold">
                {i + 2}
              </span>
              {text}
            </li>
          ))}
        </ol>
      </article>
    </>
  )
}

/** Shown in the thread when the questionnaire hands the profile over for building. */
export function ProfileCapturedNote() {
  return (
    <p className="my-2 flex items-center gap-2 rounded-[10px] bg-ui-ok-soft px-3.5 py-2.5 text-[13px] font-medium text-ui-ok">
      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      Profile captured. Starting to build your learning path.
    </p>
  )
}

export const STANDARD_DISCOVERY_STEPS = [
  { label: 'Your goals', detail: 'Pick a topic and tell Anna why it matters to you.' },
  { label: 'Skill check', detail: 'Your experience level and how you like to learn.' },
  { label: 'Path ready', detail: 'Anna builds your milestones and you start straight away.' },
]

/**
 * Composer for the opening turn. CopilotChat's own composer is hidden until the
 * conversation starts, so the intro overlay carries this one; it sends through
 * the questionnaire's own send path.
 */
export function IntroComposer({ placeholder, onSend }: { placeholder: string; onSend: (text: string) => void }) {
  const Input = SanaChatInput as unknown as (props: {
    isRunning: boolean
    onSubmitMessage: (text: string) => void
    placeholder?: string
  }) => React.ReactElement
  return (
    <div className="sticky bottom-0 z-[1] mt-auto shrink-0">
      <Input isRunning={false} onSubmitMessage={onSend} placeholder={placeholder} />
    </div>
  )
}
