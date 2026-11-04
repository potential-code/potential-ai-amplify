'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiSaveQuestionAnswer, apiUpdateBlockProgress, type LearnerBlock } from '@/lib/api/lms'
import { cn } from '@/lib/utils'
import { useSavedAnswers } from './useSavedAnswers'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

/**
 * An action-plan step. A step can hold several prompts; each gets its own box,
 * Save waits until every one is answered, saves them all and then completes
 * the block (the server only accepts completion once every prompt has an
 * answer). Answers saved earlier fill their boxes. (Ported from AI Amplify d40e894.)
 */
export function ActionPlanBlock({ block, onCompleted }: Props) {
  const queryClient = useQueryClient()
  const isAlreadyCompleted = block.blockProgress?.status === 'completed'
  const prompts = [...block.questions].sort((a, b) => a.order - b.order)

  const [texts, setTexts] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(isAlreadyCompleted)
  const saved = useSavedAnswers(block.id)

  // Reset only when the learner moves to another block (keying on completion
  // too wiped the text the moment it was saved).
  useEffect(() => {
    setTexts({})
  }, [block.id])

  useEffect(() => {
    if (isAlreadyCompleted) setSubmitted(true)
  }, [isAlreadyCompleted])

  useEffect(() => {
    if (!saved) return
    const fromServer: Record<string, string> = {}
    for (const [id, v] of Object.entries(saved)) if (typeof v === 'string') fromServer[id] = v
    setTexts((prev) => ({ ...fromServer, ...prev }))
  }, [saved])

  const allAnswered = prompts.length > 0 && prompts.every((q) => (texts[q.id] ?? '').trim().length > 0)

  const submitMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        prompts.map((q) => apiSaveQuestionAnswer(q.id, { openEndedAnswer: (texts[q.id] ?? '').trim() })),
      )
      return apiUpdateBlockProgress(block.id, { status: 'completed' })
    },
    onSuccess: () => {
      setSubmitted(true)
      queryClient.invalidateQueries({ queryKey: ['learner-course'] })
      queryClient.invalidateQueries({ queryKey: ['block-answers', block.id] })
      onCompleted()
    },
  })

  return (
    <div>
      <p className="mb-2 text-[15px] text-ui-muted">Turn this unit into a step for your own business. Your answers build your action plan.</p>

      {prompts.map((q, i) => {
        const text = texts[q.id] ?? ''
        return (
          <div key={q.id} className={i === 0 ? '' : 'mt-6'}>
            <p className="text-base sm:text-[17px] text-ui-text leading-relaxed font-semibold">{q.prompt}</p>
            <div className="mt-3 relative">
              <textarea
                maxLength={10_000}
                value={text}
                onChange={(e) => setTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                disabled={submitted}
                aria-label={q.prompt}
                placeholder={q.placeholder ?? 'Write your action plan here…'}
                rows={prompts.length > 1 ? 4 : 5}
                className={cn(
                  'w-full rounded-[10px] border bg-ui-surface px-4 py-3 text-sm text-ui-text leading-relaxed placeholder:text-ui-muted focus:outline-none transition-all resize-none',
                  submitted
                    ? 'border-transparent bg-ui-ok-soft'
                    : 'border-ui-line focus:border-ui-brand focus:ring-2 focus:ring-ui-brand/20',
                )}
              />
              {!submitted && (
                <div className="absolute bottom-2 right-3 text-xs text-ui-muted">
                  {text.length} chars
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Saved badge */}
      <AnimatePresence>
        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-ui-ok-soft border border-transparent px-3 py-2 text-xs font-bold text-ui-ok">
              <CheckCircle2 className="w-4 h-4" />
              Saved to your action plan
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {submitMutation.isError && !submitted && (
        <p className="mt-4 text-sm text-ui-danger">We couldn&apos;t save your action plan. Please try again.</p>
      )}

      {/* CTA */}
      {!submitted && (
        <div className="mt-5 flex items-center justify-end gap-3">
          {prompts.length > 1 && !allAnswered && (
            <span className="text-xs text-ui-muted">Answer every prompt to save</span>
          )}
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!allAnswered || submitMutation.isPending}
            className="inline-flex items-center gap-2 rounded-[10px] bg-ui-brand hover:bg-ui-brand-hover text-white h-10 px-4 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {submitMutation.isPending ? 'Saving…' : 'Save my action plan'}
          </button>
        </div>
      )}
    </div>
  )
}
