'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBlockAnswers } from '@/lib/api/lms'

export type SavedAnswers = Record<string, number | string>

/**
 * The learner's own saved answers for a question block, keyed by question id,
 * so a finished (or half-finished) block shows what they wrote instead of
 * empty boxes.
 */
export function useSavedAnswers(blockId: string): SavedAnswers | undefined {
  const { data } = useQuery({
    queryKey: ['block-answers', blockId],
    queryFn: () => fetchBlockAnswers(blockId),
    staleTime: 60_000,
  })
  // Memoised on the query data so effects keyed on the result only run when
  // the saved answers actually change.
  return useMemo(() => {
    if (!data) return undefined
    const out: SavedAnswers = {}
    for (const row of data) {
      const a = row.answerData
      if (!a) continue
      if (typeof a.openEndedAnswer === 'string') out[row.questionId] = a.openEndedAnswer
      else if (typeof a.selectedAnswer === 'number') out[row.questionId] = a.selectedAnswer
    }
    return out
  }, [data])
}
