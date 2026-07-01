'use client'

import { useEffect } from 'react'
import { fetchCodPath } from '@/lib/api/cod'
import type { CodPathResponse } from '@/lib/api/cod'
import { LearningPathGeneratingLoader } from '@/components/shared/LearningPathGeneratingLoader'

interface Props {
  onReady: (path: CodPathResponse) => void
  onFailed: () => void
}

export function CodPathBuildingProgress({ onReady, onFailed }: Props) {
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
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <LearningPathGeneratingLoader />
    </div>
  )
}
