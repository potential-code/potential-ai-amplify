'use client'

import { useEffect, useState } from 'react'
import { fetchBothMilestonePretest, submitBothMilestonePretest } from '@/lib/api/both'
import type { BothPretest } from '@/lib/api/both'
import { CheckCircle2, ClipboardList } from 'lucide-react'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onComplete: () => void
}

export function BothMilestonePretestCard({ milestoneId, milestoneTitle, pathId, onComplete }: Props) {
  const [pretest, setPretest] = useState<BothPretest | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<{ score: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchBothMilestonePretest(milestoneId, pathId)
      .then(setPretest)
      .catch((e: Error) => setError(e.message))
  }, [milestoneId, pathId])

  const selectAnswer = (idx: number) => {
    const next = [...answers]
    next[currentQ] = idx
    setAnswers(next)
  }

  const submit = async () => {
    if (!pretest) return
    setLoading(true)
    try {
      const res = await submitBothMilestonePretest(milestoneId, pathId, answers)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="my-2 rounded-2xl border border-brand-surface-2 bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10"
        style={{ background: 'linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)' }}
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
          <ClipboardList className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-white leading-tight">Knowledge Check</p>
          <p className="text-[10px] text-white/60 leading-tight">{milestoneTitle}</p>
        </div>
      </div>

      <div className="p-4">
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {!error && !pretest && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-brand-surface rounded-xl" />)}
          </div>
        )}

        {pretest && !result && (() => {
          const question = pretest.questions[currentQ]!
          const isLastQuestion = currentQ === pretest.questions.length - 1
          const allAnswered = answers.length === pretest.questions.length && answers.every((a) => a !== undefined)
          return (
            <div className="space-y-4">
              <p className="text-xs text-brand-text-muted">
                Question {currentQ + 1} of {pretest.questions.length} · No right or wrong — just capturing your starting point
              </p>
              <p className="font-medium text-brand-text-primary text-sm">{question.question}</p>
              <div className="space-y-2">
                {question.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectAnswer(i)}
                    className="w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-colors"
                    style={answers[currentQ] === i
                      ? { background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)', color: '#fff', borderColor: 'transparent' }
                      : { borderColor: '#9f2063', color: '#1A0A12', background: '#fff' }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setCurrentQ((q) => q - 1)}
                  disabled={currentQ === 0}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-brand-text-secondary disabled:opacity-40"
                >
                  Back
                </button>
                {isLastQuestion ? (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!allAnswered || loading}
                    className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
                  >
                    {loading ? 'Submitting...' : 'Submit Answers'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentQ((q) => q + 1)}
                    disabled={answers[currentQ] === undefined}
                    className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {result && (
          <div className="text-center space-y-4 py-2">
            {done ? (
              <div className="flex items-center justify-center gap-2 py-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-semibold">Knowledge check complete</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-brand-text-secondary">Your starting point for this milestone:</p>
                <p className="text-4xl font-bold text-brand-text-primary">{result.score}/{result.total}</p>
                <p className="text-sm text-brand-text-secondary">
                  No worries about the score — this is a snapshot so we can measure how much you improve.
                </p>
                <button
                  type="button"
                  onClick={() => { setDone(true); onComplete() }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
                >
                  Start Learning →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
