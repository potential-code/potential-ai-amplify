'use client'

import { fetchMilestonePretest, submitMilestonePretest } from '@/lib/api/cod'
import { PretestCard } from '@/components/journeys/AssessmentCard'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onComplete: () => void
}

export function MilestonePretestCard({ milestoneId, milestoneTitle, pathId, onComplete }: Props) {
  return (
    <PretestCard
      milestoneTitle={milestoneTitle}
      load={() => fetchMilestonePretest(milestoneId, pathId)}
      submit={(answers) => submitMilestonePretest(milestoneId, pathId, answers)}
      onComplete={onComplete}
    />
  )
}
