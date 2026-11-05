'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { ProgressBar } from '@/components/kit'
import { cn } from '@/lib/utils'

const STEPS = [
  'Analyzing your profile and goals',
  'Mapping your skill gaps',
  'Curating the best content',
  'Building your milestones',
  'Personalizing your path',
]

interface LearningPathGeneratingLoaderProps {
  complete?: boolean
  steps?: string[]
  subtitle?: string
}

/**
 * Step list shown while a learning path is being built. The steps advance on a
 * timer (the build itself reports no progress); the caller swaps this out once
 * the path is ready.
 */
export function LearningPathGeneratingLoader({ complete, steps = STEPS, subtitle = 'This usually takes under 2 minutes' }: LearningPathGeneratingLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (complete) {
      setCurrentStep(steps.length)
      return
    }
    if (currentStep >= steps.length - 1) return
    const timer = setTimeout(() => setCurrentStep((s) => s + 1), 3000)
    return () => clearTimeout(timer)
  }, [currentStep, complete, steps.length])

  const pct = complete ? 100 : Math.round(((currentStep + 1) / steps.length) * 100)

  return (
    <div className="flex w-full flex-col gap-5 p-5 sm:p-6" role="status" aria-live="polite">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-ui-text">Building your learning path</p>
        <p className="text-[13px] text-ui-muted">{subtitle}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((label, index) => {
          const isDone = complete || index < currentStep || currentStep === steps.length
          const isActive = index === currentStep && !complete
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  isDone && 'bg-ui-ok-soft text-ui-ok',
                  isActive && 'bg-ui-brand-soft text-ui-brand-text',
                  !isDone && !isActive && 'border-[1.5px] border-ui-line text-ui-muted',
                )}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <span className="text-[11px] font-bold">{index + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'flex-1 text-sm',
                  isActive ? 'font-semibold text-ui-text' : isDone ? 'text-ui-text' : 'text-ui-muted',
                )}
              >
                {label}
              </span>
              {isDone && <span className="text-xs font-medium text-ui-ok">Done</span>}
            </li>
          )
        })}
      </ol>

      <ProgressBar value={pct} label="Path build progress" />
    </div>
  )
}
