'use client'

import { useEffect, type ReactNode } from 'react'
import { fetchBothPath } from '@/lib/api/both'
import type { BothPathResponse } from '@/lib/api/both'
import { LearningPathGeneratingLoader } from '@/components/shared/LearningPathGeneratingLoader'
import { JourneyBuilding } from '@/components/journeys/JourneyStates'

interface Props {
  onReady: (path: BothPathResponse) => void
  onFailed: () => void
  subtitle?: string
  steps?: string[]
  /** Page header title (defaults to Blended Learning). */
  title?: ReactNode
  /** Page header subtitle. */
  headerSubtitle?: ReactNode
  /** Leading header element. */
  leading?: ReactNode
  /** What the guide says while the path builds. */
  sanaLine?: ReactNode
  /** Guide avatar (defaults to Anna). */
  sanaAvatar?: ReactNode
}

export function BothPathBuildingProgress({
  onReady,
  onFailed,
  subtitle,
  steps,
  title = 'Blended Learning',
  headerSubtitle = 'Building your personalised Blended Learning path',
  leading,
  sanaLine = "I'm mixing AI Amplify course blocks with the best external content for your goals.",
  sanaAvatar,
}: Props) {
  useEffect(() => {
    const poll = async () => {
      try {
        const result = await fetchBothPath()
        if (result?.path.status === 'active' || result?.path.status === 'completed') {
          onReady(result)
        } else if (result?.path.status === 'failed') {
          onFailed()
        }
      } catch { /* ignore poll errors */ }
    }
    const interval = setInterval(poll, 3000)
    void poll()
    return () => clearInterval(interval)
  }, [onReady, onFailed])

  return (
    <JourneyBuilding title={title} subtitle={headerSubtitle} leading={leading} sanaLine={sanaLine} sanaAvatar={sanaAvatar}>
      <LearningPathGeneratingLoader subtitle={subtitle} steps={steps} />
    </JourneyBuilding>
  )
}
