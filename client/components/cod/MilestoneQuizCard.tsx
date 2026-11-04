'use client'

import { fetchMilestoneQuiz, submitMilestoneQuiz } from '@/lib/api/cod'
import { QuizCard } from '@/components/journeys/AssessmentCard'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onPass: () => void
}

export function MilestoneQuizCard({ milestoneId, milestoneTitle, pathId, onPass }: Props) {
  return (
    <QuizCard
      milestoneTitle={milestoneTitle}
      load={() => fetchMilestoneQuiz(milestoneId, pathId)}
      submit={(answers) => submitMilestoneQuiz(milestoneId, pathId, answers)}
      onPass={onPass}
    />
  )
}
