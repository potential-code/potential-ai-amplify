'use client'

import { fetchBothMilestoneQuiz, submitBothMilestoneQuiz } from '@/lib/api/both'
import { QuizCard } from '@/components/journeys/AssessmentCard'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onPass: () => void
}

export function BothMilestoneQuizCard({ milestoneId, milestoneTitle, pathId, onPass }: Props) {
  return (
    <QuizCard
      milestoneTitle={milestoneTitle}
      load={() => fetchBothMilestoneQuiz(milestoneId, pathId)}
      submit={(answers) => submitBothMilestoneQuiz(milestoneId, pathId, answers)}
      onPass={onPass}
    />
  )
}
