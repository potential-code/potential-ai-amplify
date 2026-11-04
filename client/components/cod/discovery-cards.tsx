'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { ToolCallStatus } from '@copilotkit/react-core/v2'
import { btn, inputClass } from '@/components/kit'
import { cn } from '@/lib/utils'

// Shared topic chips for the "collectTopicGoal" step — single source of truth,
// also used by the opening turn in Cod/BothConversationalQuestionnaire.
export const TOPIC_CHIPS = [
  'Leadership & Management',
  'AI & Machine Learning',
  'Product Management',
  'Data Skills',
  'Communication',
]

/** Display text for a chip value (values stay verbatim; they are matched downstream). */
function chipText(label: string): string {
  return label.replace(/\s+—\s+/g, ': ')
}

// ---------------------------------------------------------------------------
// Shared card shell: a conversation card with the question as its heading, an
// optional "Question n of N" counter, and the questions still to come.
// ---------------------------------------------------------------------------

export interface QuestionProgress {
  /** "Question 1 of 4". */
  label: string
  /** Questions still to come, listed under the card. */
  upcoming?: { num: number; text: string }[]
}

function CardShell({ title, progress, children }: { title: string; progress?: QuestionProgress; children: ReactNode }) {
  return (
    <article
      className="my-3 flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-4 text-ui-text shadow-ui sm:px-[18px]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] font-semibold leading-snug">{title}</h3>
        {progress && <span className="shrink-0 pt-1 text-xs text-ui-muted">{progress.label}</span>}
      </div>
      {children}
      {progress?.upcoming && progress.upcoming.length > 0 && (
        <ol className="mt-1 flex flex-col gap-2 border-t border-ui-line pt-3">
          {progress.upcoming.map((u) => (
            <li key={u.num} className="flex items-center gap-2 text-[13px] text-ui-muted">
              <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ui-line text-[10px] font-bold">
                {u.num}
              </span>
              {u.text}
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}

function CompleteRow({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-ui-text">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ui-ok-soft text-ui-ok">
        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="min-w-0 truncate">{label}</span>
      <span className="sr-only">(answered)</span>
    </p>
  )
}

/** Pill answer button (design `.chipbtn`, 38px). */
function ChoiceChip({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-4 py-1.5 text-start text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand disabled:cursor-not-allowed',
        selected
          ? 'border-ui-brand bg-ui-brand-soft text-ui-brand-text'
          : 'border-ui-line bg-ui-surface text-ui-text hover:bg-ui-surface-2 disabled:opacity-50 disabled:hover:bg-ui-surface',
      )}
    >
      {selected && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Step 1 card: collectTopicGoal — multi-select topic chips + free-text goal
// ---------------------------------------------------------------------------

export interface TopicGoalResult {
  topics: string[]
  goals: string
}

interface TopicGoalCardProps {
  status: ToolCallStatus
  respond: (value: TopicGoalResult) => void
  title?: string
  prompt?: string
  chips?: string[]
  goalPlaceholder?: string
  /** One choice only, answered on click — no multi-select, no Continue button. */
  singleSelect?: boolean
  /** Drops the free-text goal box for flows that never read it. */
  hideGoal?: boolean
  progress?: QuestionProgress
}

export function TopicGoalCard({
  status,
  respond,
  title = 'What do you want to learn?',
  prompt = 'Pick one or more topics, then tell us why. This helps us tailor your path.',
  chips = TOPIC_CHIPS,
  goalPlaceholder = 'Why do you want to learn this? (e.g. prepping for a promotion)',
  singleSelect = false,
  hideGoal = false,
  progress,
}: TopicGoalCardProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [goals, setGoals] = useState('')
  const [responded, setResponded] = useState(false)
  const [lastResult, setLastResult] = useState<TopicGoalResult | null>(null)

  const isComplete = status === ToolCallStatus.Complete
  const isDisabled = isComplete || responded

  // Reset local state whenever a fresh call of this tool starts streaming.
  useEffect(() => {
    if (status === ToolCallStatus.InProgress) {
      setSelected([])
      setGoals('')
      setResponded(false)
    }
  }, [status])

  function toggleTopic(topic: string) {
    if (isDisabled) return
    if (singleSelect) {
      setSelected([topic])
      setResponded(true)
      const result: TopicGoalResult = { topics: [topic], goals: goals.trim() }
      setLastResult(result)
      respond(result)
      return
    }
    setSelected((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]))
  }

  const canContinue = selected.length > 0 && (hideGoal || goals.trim().length > 0)

  function handleContinue() {
    if (isDisabled || !canContinue) return
    const result: TopicGoalResult = { topics: selected, goals: goals.trim() }
    setResponded(true)
    setLastResult(result)
    respond(result)
  }

  return (
    <CardShell title={title} progress={isComplete ? undefined : progress}>
      {isComplete ? (
        <CompleteRow label={(lastResult?.topics ?? []).map(chipText).join(', ') || 'Topics selected'} />
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ui-muted">{prompt}</p>
          <div role="group" aria-label={title} className="flex flex-wrap gap-2">
            {chips.map((topic) => (
              <ChoiceChip
                key={topic}
                selected={selected.includes(topic)}
                disabled={isDisabled && !selected.includes(topic)}
                onClick={() => toggleTopic(topic)}
              >
                {chipText(topic)}
              </ChoiceChip>
            ))}
          </div>
          {!hideGoal && (
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              disabled={isDisabled}
              placeholder={goalPlaceholder}
              rows={2}
              aria-label="Your goal"
              className={cn(inputClass, 'h-auto resize-none py-2.5')}
            />
          )}
          {!singleSelect && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isDisabled || !canContinue}
                onClick={handleContinue}
                className={cn(btn({ variant: 'primary', size: 'md' }), 'h-9 w-full sm:w-auto')}
              >
                Continue
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </CardShell>
  )
}

// ---------------------------------------------------------------------------
// Shared button-choice card: used for both selectExperienceLevel and
// selectLearningStyle — a title + N single-click option buttons.
// ---------------------------------------------------------------------------

export interface ChoiceOption {
  value: string
  label: string
  description?: string
}

interface ButtonChoiceCardProps {
  title: string
  status: ToolCallStatus
  options: ChoiceOption[]
  respond: (value: string) => void
  progress?: QuestionProgress
}

export function ButtonChoiceCard({ title, status, options, respond, progress }: ButtonChoiceCardProps) {
  const [responded, setResponded] = useState(false)
  const [lastValue, setLastValue] = useState<string | null>(null)

  const isComplete = status === ToolCallStatus.Complete
  const isDisabled = isComplete || responded

  useEffect(() => {
    if (status === ToolCallStatus.InProgress) {
      setResponded(false)
    }
  }, [status])

  function handleSelect(value: string) {
    if (isDisabled) return
    setResponded(true)
    setLastValue(value)
    respond(value)
  }

  const selectedLabel = options.find((o) => o.value === lastValue)?.label

  return (
    <CardShell title={title} progress={isComplete ? undefined : progress}>
      {isComplete ? (
        <CompleteRow label={selectedLabel ? chipText(selectedLabel) : 'Selected'} />
      ) : (
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <ChoiceChip
              key={opt.value}
              selected={lastValue === opt.value}
              disabled={isDisabled && lastValue !== opt.value}
              onClick={() => handleSelect(opt.value)}
            >
              <span className="flex flex-col">
                {chipText(opt.label)}
                {opt.description && <span className="text-xs font-normal text-ui-muted">{opt.description}</span>}
              </span>
            </ChoiceChip>
          ))}
        </div>
      )}
    </CardShell>
  )
}
