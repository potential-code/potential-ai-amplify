'use client'

/**
 * Knowledge check (pre-test) and milestone quiz, one question at a time, used
 * by Content on Demand and Blended Learning. The caller supplies the
 * load/submit calls for its own API; everything else (stepping, scoring
 * bands, retry, the hand-off to the next step) lives here.
 */

import { useEffect, useId, useState } from 'react'
import { ChevronRight, ClipboardCheck, Target } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import {
  CardAction,
  CardLoadingRows,
  CardTag,
  DoneNote,
  FooterNote,
  JourneyCard,
  QuizChoice,
  QuizSegments,
  ResultBand,
} from './JourneyCard'

export interface AssessmentData {
  questions: Array<{ question: string; options: string[] }>
}

type Result = { score: number; total: number; passed?: boolean }

interface BaseProps {
  milestoneTitle: string
  load: () => Promise<AssessmentData>
  /** Called when loading fails; return a message to show instead of the raw error (or null to show it). */
  onLoadError?: (err: unknown) => string | null
}

export function PretestCard({
  milestoneTitle,
  load,
  submit,
  onComplete,
  onLoadError,
  label = 'Knowledge check',
}: BaseProps & {
  submit: (answers: number[]) => Promise<{ score: number; total: number }>
  onComplete: () => void
  /** Tag text: "Knowledge check" (Content on Demand) or "Pre-test" (Blended). */
  label?: string
}) {
  const [done, setDone] = useState(false)
  return (
    <AssessmentFlow
      kind="pretest"
      label={label}
      milestoneTitle={milestoneTitle}
      load={load}
      onLoadError={onLoadError}
      submit={submit}
      renderResult={(result) => {
        const strong = result.total > 0 && result.score / result.total >= 0.7
        return (
          <JourneyCard
            latest={!done}
            tag={<CardTag icon={Target}>{label}</CardTag>}
            meta={milestoneTitle}
            title={done ? undefined : 'Your starting point'}
            footer={
              done ? (
                <DoneNote>Baseline saved, on to the content</DoneNote>
              ) : (
                <>
                  <FooterNote>Your content is unlocked.</FooterNote>
                  <CardAction
                    onClick={() => {
                      setDone(true)
                      onComplete()
                    }}
                  >
                    Start learning
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </CardAction>
                </>
              )
            }
          >
            <ResultBand tone={strong ? 'good' : 'neutral'} score={`${result.score}/${result.total}`}>
              {strong
                ? 'Strong start: you already know this ground. Your content is unlocked; let’s sharpen it further.'
                : 'A snapshot so we can measure how much you improve, nothing to worry about. Your content is unlocked.'}
            </ResultBand>
          </JourneyCard>
        )
      }}
    />
  )
}

export function QuizCard({
  milestoneTitle,
  load,
  submit,
  onPass,
  onLoadError,
}: BaseProps & {
  submit: (answers: number[]) => Promise<{ score: number; total: number; passed: boolean }>
  onPass: () => void
}) {
  return (
    <AssessmentFlow
      kind="quiz"
      milestoneTitle={milestoneTitle}
      load={load}
      onLoadError={onLoadError}
      submit={async (answers) => {
        const res = await submit(answers)
        if (res.passed) onPass()
        return res
      }}
      renderResult={(result, retry) => (
        <JourneyCard
          tag={<CardTag icon={ClipboardCheck} tone={result.passed ? 'ok' : 'brand'}>Quiz result</CardTag>}
          meta={`${milestoneTitle}, 70% to pass`}
          title={result.passed ? 'Milestone quiz passed' : 'Not quite yet'}
          footer={
            result.passed ? (
              <DoneNote>Milestone complete</DoneNote>
            ) : (
              <>
                <FooterNote>The questions stay the same.</FooterNote>
                <CardAction onClick={retry}>Retry quiz</CardAction>
              </>
            )
          }
        >
          {result.passed ? (
            <ResultBand tone="good" score={`${result.score}/${result.total}`}>
              Milestone complete. The next milestone just unlocked in your journey.
            </ResultBand>
          ) : (
            <ResultBand tone="neutral" score={`${result.score}/${result.total}`}>
              You need {Math.ceil(result.total * 0.7)}/{result.total} to pass. Review the content and try again.
            </ResultBand>
          )}
        </JourneyCard>
      )}
    />
  )
}

function AssessmentFlow({
  kind,
  label = 'Knowledge check',
  milestoneTitle,
  load,
  submit,
  onLoadError,
  renderResult,
}: BaseProps & {
  kind: 'pretest' | 'quiz'
  label?: string
  submit: (answers: number[]) => Promise<Result>
  renderResult: (result: Result, retry: () => void) => React.ReactNode
}) {
  const [data, setData] = useState<AssessmentData | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uid = useId()

  useEffect(() => {
    load()
      .then(setData)
      .catch((e: unknown) => {
        const custom = onLoadError?.(e)
        setError(custom ?? (e instanceof Error ? e.message : 'We could not load the questions.'))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectAnswer = (idx: number) => {
    const next = [...answers]
    next[currentQ] = idx
    setAnswers(next)
  }

  const doSubmit = async () => {
    if (!data) return
    setLoading(true)
    try {
      setResult(await submit(answers))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <>
        {renderResult(result, () => {
          setResult(null)
          setAnswers([])
          setCurrentQ(0)
        })}
      </>
    )
  }

  const total = data?.questions.length ?? 0
  const q = data?.questions[currentQ]
  const isLast = currentQ === total - 1
  const isPretest = kind === 'pretest'

  return (
    <JourneyCard
      latest
      tag={isPretest ? <CardTag icon={Target}>{label}</CardTag> : <CardTag icon={ClipboardCheck}>Milestone quiz</CardTag>}
      meta={isPretest ? `${milestoneTitle}, no right or wrong` : `${milestoneTitle}, 70% to pass`}
      title={isPretest ? 'Before we start, where are you now?' : 'Show what you learned'}
      footer={
        data ? (
          <>
            <FooterNote>
              Question {currentQ + 1} of {total}
            </FooterNote>
            <div className="flex items-center gap-2">
              {currentQ > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentQ((n) => n - 1)}
                  className={cn(btn({ variant: 'ghost', size: 'md' }), 'h-9')}
                >
                  Back
                </button>
              )}
              {isLast ? (
                <CardAction
                  busy={loading}
                  disabled={answers.length !== total || answers.some((a) => a === undefined)}
                  onClick={() => void doSubmit()}
                >
                  {loading ? 'Submitting' : isPretest ? 'Submit answers' : 'Submit quiz'}
                </CardAction>
              ) : (
                <CardAction disabled={answers[currentQ] === undefined} onClick={() => setCurrentQ((n) => n + 1)}>
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </CardAction>
              )}
            </div>
          </>
        ) : undefined
      }
    >
      {error && <p className="text-sm text-ui-danger" role="alert">{error}</p>}
      {!error && !data && <CardLoadingRows />}
      {data && q && (
        <div className="flex flex-col gap-3">
          <QuizSegments total={total} current={currentQ} />
          <p id={`${uid}-q${currentQ}`} className="text-[15px] font-semibold leading-snug text-ui-text">
            {q.question}
          </p>
          <div role="radiogroup" aria-labelledby={`${uid}-q${currentQ}`} className="flex flex-col gap-2">
            {q.options.map((opt, i) => (
              <QuizChoice key={i} selected={answers[currentQ] === i} onSelect={() => selectAnswer(i)}>
                {opt}
              </QuizChoice>
            ))}
          </div>
        </div>
      )}
    </JourneyCard>
  )
}
