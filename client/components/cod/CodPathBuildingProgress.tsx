'use client'

import { useEffect } from 'react'
import { fetchCodPath } from '@/lib/api/cod'
import type { CodPathResponse } from '@/lib/api/cod'
import { LearningPathGeneratingLoader } from '@/components/shared/LearningPathGeneratingLoader'
import { JourneyBuilding } from '@/components/journeys/JourneyStates'

interface Props {
  onReady: (path: CodPathResponse) => void
  onFailed: () => void
  title?: string
}

export function CodPathBuildingProgress({ onReady, onFailed, title = 'Content on Demand' }: Props) {
  useEffect(() => {
    const poll = async () => {
      try {
        const result = await fetchCodPath()
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
    <JourneyBuilding
      title={title}
      subtitle="Building your personalised Content on Demand path"
      sanaLine="I'm curating the best videos and articles for your goals."
    >
      <LearningPathGeneratingLoader />
    </JourneyBuilding>
  )
}
