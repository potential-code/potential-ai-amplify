'use client'

import { useEffect, useState } from 'react'
import { fetchMilestoneQuiz, submitMilestoneQuiz } from '@/lib/api/cod'
import type { CodQuiz } from '@/lib/api/cod'
import { CheckCircle2, Trophy } from 'lucide-react'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onPass: () => void
}

export function MilestoneQuizCard({ milestoneId, milestoneTitle, pathId, onPass }: Props) {
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

  return (
    <div className="my-2 rounded-2xl border border-brand-surface-2 bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10"
        style={{ background: 'linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)' }}
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
          <Trophy className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-white leading-tight">Final Quiz</p>
          <p className="text-[10px] text-white/60 leading-tight">{milestoneTitle}</p>
        </div>
      </div>

      <div className="p-4">
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {!error && !quiz && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-brand-surface rounded-xl" />)}
          </div>
        )}

        {quiz && !result && (() => {
          const question = quiz.questions[currentQ]!
          const isLastQuestion = currentQ === quiz.questions.length - 1
          const allAnswered = answers.length === quiz.questions.length && answers.every((a) => a !== undefined)
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-brand-text-muted">Question {currentQ + 1} of {quiz.questions.length}</p>
                <div className="h-1.5 w-32 rounded-full bg-brand-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${((currentQ + 1) / quiz.questions.length) * 100}%`, background: 'linear-gradient(90deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
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
                    {loading ? 'Submitting...' : 'Submit Quiz'}
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
          )
        })()}

        {result && (
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
              {result.passed ? 'Passed — next milestone unlocked!' : `Not quite — you need 70% to pass (${Math.ceil(result.total * 0.7)}/${result.total})`}
            </p>
            {!result.passed && (
              <button
                type="button"
                onClick={() => { setResult(null); setAnswers([]); setCurrentQ(0) }}
                className="px-5 py-2 rounded-xl text-sm font-bold border-2 text-brand-text-primary"
                style={{ borderColor: 'var(--color-brand-primary)' }}
              >
                Retry Quiz
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
