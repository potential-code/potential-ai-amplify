'use client'

import { fetchBothMilestonePretest, submitBothMilestonePretest } from '@/lib/api/both'
import { ApiError } from '@/lib/api/errors'
import { PretestCard } from '@/components/journeys/AssessmentCard'

interface Props {
  milestoneId: string
  milestoneTitle: string
  pathId: string
  onComplete: () => void
  onStalePath?: () => void
  /** Tag text on the card ("Pre-test" by default). */
  label?: string
}

export function BothMilestonePretestCard({ milestoneId, milestoneTitle, pathId, onComplete, onStalePath, label = 'Pre-test' }: Props) {
  return (
    <PretestCard
      label={label}
      milestoneTitle={milestoneTitle}
      load={() => fetchBothMilestonePretest(milestoneId, pathId)}
      submit={(answers) => submitBothMilestonePretest(milestoneId, pathId, answers)}
      onComplete={onComplete}
      onLoadError={(e) => {
        // A 404 means this tab is holding a path that no longer exists — reload it rather than stranding the learner.
        if (e instanceof ApiError && e.status === 404) {
          onStalePath?.()
          return 'This course was updated. Refreshing…'
        }
        return null
      }}
    />
  )
}
