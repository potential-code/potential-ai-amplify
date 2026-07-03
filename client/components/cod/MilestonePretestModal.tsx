'use client'

import { useEffect, useState } from 'react'
import { fetchMilestonePretest, submitMilestonePretest } from '@/lib/api/cod'
import type { CodPretest } from '@/lib/api/cod'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onComplete: () => void
}

export function MilestonePretestModal({ milestoneId, milestoneTitle, pathId, onComplete }: Props) {
  const [pretest, setPretest] = useState<CodPretest | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<{ score: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMilestonePretest(milestoneId, pathId)
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
      const res = await submitMilestonePretest(milestoneId, pathId, answers)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <ModalShell title={milestoneTitle}>
        <p className="text-red-500 text-sm">{error}</p>
      </ModalShell>
    )
  }

  if (!pretest) {
    return (
      <ModalShell title={milestoneTitle}>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-brand-surface rounded-xl" />)}
        </div>
      </ModalShell>
    )
  }

  if (result) {
    return (
      <ModalShell title={`Before you start — ${milestoneTitle}`}>
        <div className="text-center space-y-4 py-2">
          <p className="text-sm text-brand-text-secondary">Your starting point for this milestone:</p>
          <p className="text-4xl font-bold text-brand-text-primary">{result.score}/{result.total}</p>
          <p className="text-sm text-brand-text-secondary">
            No worries about the score — this is a snapshot so we can measure how much you improve.
          </p>
          <button
            type="button"
            onClick={onComplete}
            className="w-full py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
          >
            Start Learning →
          </button>
        </div>
      </ModalShell>
    )
  }

  const question = pretest.questions[currentQ]!
  const isLastQuestion = currentQ === pretest.questions.length - 1
  const allAnswered = answers.length === pretest.questions.length && answers.every((a) => a !== undefined)

  return (
    <ModalShell title={`Before you start — ${milestoneTitle}`}>
      <p className="text-sm text-brand-text-secondary mb-4">
        Answer these quick questions to capture your starting point. There are no wrong answers.
      </p>
      <div className="space-y-5">
        <p className="text-xs text-brand-text-muted">Question {currentQ + 1} of {pretest.questions.length}</p>
        <p className="font-medium text-brand-text-primary text-sm">{question.question}</p>
        <div className="space-y-2">
          {question.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectAnswer(i)}
              className="w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-colors"
              style={answers[currentQ] === i
                ? { background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)', color: '#fff', borderColor: 'transparent' }
                : { borderColor: 'var(--color-brand-primary)', color: '#1A0A12', background: '#fff' }}
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
              style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
            >
              {loading ? 'Submitting...' : 'Submit Answers'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentQ((q) => q + 1)}
              disabled={answers[currentQ] === undefined}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-brand-text-primary">{title}</h2>
        {children}
      </div>
    </div>
  )
}
