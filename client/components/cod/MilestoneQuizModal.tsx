'use client'

import { useEffect, useState } from 'react'
import { fetchMilestoneQuiz, submitMilestoneQuiz } from '@/lib/api/cod'
import type { CodQuiz } from '@/lib/api/cod'
import { CheckCircle2 } from 'lucide-react'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onPass: () => void
  onClose: () => void
}

export function MilestoneQuizModal({ milestoneId, milestoneTitle, pathId, onPass, onClose }: Props) {
  const [quiz, setQuiz] = useState<CodQuiz | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMilestoneQuiz(milestoneId, pathId)
      .then(setQuiz)
      .catch((e: Error) => setError(e.message))
  }, [milestoneId, pathId])

  const selectAnswer = (idx: number) => {
    const next = [...answers]
    next[currentQ] = idx
    setAnswers(next)
  }

  const submit = async () => {
    if (!quiz) return
    setLoading(true)
    try {
      const res = await submitMilestoneQuiz(milestoneId, pathId, answers)
      setResult(res)
      if (res.passed) onPass()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <ModalShell title={milestoneTitle} onClose={onClose}>
        <p className="text-red-500 text-sm">{error}</p>
      </ModalShell>
    )
  }

  if (!quiz) {
    return (
      <ModalShell title={milestoneTitle} onClose={onClose}>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-brand-surface rounded-xl" />)}
        </div>
      </ModalShell>
    )
  }

  if (result) {
    return (
      <ModalShell title="Quiz Complete" onClose={onClose}>
        <div className="text-center space-y-4 py-2">
          {result.passed ? (
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          ) : (
            <div className="w-12 h-12 rounded-full border-4 border-red-400 mx-auto flex items-center justify-center">
              <span className="text-red-500 text-lg font-bold">✗</span>
            </div>
          )}
          <p className="text-4xl font-bold text-brand-text-primary">{result.score}/{result.total}</p>
          <p className={result.passed ? 'text-emerald-600 font-medium text-sm' : 'text-red-500 font-medium text-sm'}>
            {result.passed ? 'Passed — milestone unlocked!' : `Not quite — you need 70% to pass (${Math.ceil(result.total * 0.7)}/${result.total})`}
          </p>
          {!result.passed && (
            <button
              type="button"
              onClick={() => { setResult(null); setAnswers([]); setCurrentQ(0) }}
              className="px-5 py-2 rounded-xl text-sm font-bold border-2 text-brand-text-primary"
              style={{ borderColor: '#9f2063' }}
            >
              Retry Quiz
            </button>
          )}
        </div>
      </ModalShell>
    )
  }

  const question = quiz.questions[currentQ]!
  const isLastQuestion = currentQ === quiz.questions.length - 1
  const allAnswered = answers.length === quiz.questions.length && answers.every((a) => a !== undefined)

  return (
    <ModalShell title={`${milestoneTitle} — Quiz`} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-brand-text-muted">Question {currentQ + 1} of {quiz.questions.length}</p>
          <div className="h-1.5 w-32 rounded-full bg-brand-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${((currentQ + 1) / quiz.questions.length) * 100}%`, background: 'linear-gradient(90deg, #9f2063 0%, #7a1a4c 100%)' }}
            />
          </div>
        </div>
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
              {loading ? 'Submitting...' : 'Submit Quiz'}
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
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-brand-text-secondary hover:text-brand-text-primary w-7 h-7 rounded-full hover:bg-brand-surface flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
