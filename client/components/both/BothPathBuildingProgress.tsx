'use client'

import { useEffect } from 'react'
import { fetchBothPath } from '@/lib/api/both'
import type { BothPathResponse } from '@/lib/api/both'
import { LearningPathGeneratingLoader } from '@/components/shared/LearningPathGeneratingLoader'

interface Props {
  onReady: (path: BothPathResponse) => void
  onFailed: () => void
}

export function BothPathBuildingProgress({ onReady, onFailed }: Props) {
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
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <LearningPathGeneratingLoader />
    </div>
  )
}
