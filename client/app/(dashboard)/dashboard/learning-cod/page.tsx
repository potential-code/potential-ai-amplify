'use client'

import { useState, useEffect, useCallback } from 'react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { JourneyLoading, JourneyMessage } from '@/components/journeys/JourneyStates'
import { btn } from '@/components/kit'
import { CodPathBuildingProgress } from '@/components/cod/CodPathBuildingProgress'
import { CodConversationalQuestionnaire } from '@/components/cod/CodConversationalQuestionnaire'
import { CodEmbeddedLearningAssistant } from '@/components/cod/CodEmbeddedLearningAssistant'
import {
  useCopilotTokenReady,
  getCopilotHeaders,
} from '@/components/dashboard/copilotConfig'
import { fetchCodPath, generateCodPath, type CodPathResponse, type CodDiscoveryProfile } from '@/lib/api/cod'

const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

function CodPageInner() {
  const [path, setPath] = useState<CodPathResponse | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadPath = useCallback(async () => {
    // Clear a previous failure first, or Retry keeps showing the old error.
    setLoadError(null)
    try {
      const result = await fetchCodPath()
      setPath(result)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load path.')
    }
  }, [])

  useEffect(() => { void loadPath() }, [loadPath])

  const handleProfileExtracted = useCallback(async (rawProfile: CodDiscoveryProfile) => {
    // LLM may return "Beginner" / "Mixed" etc. — normalize to lowercase enum values
    const expMap: Record<string, CodDiscoveryProfile['experienceLevel']> = {
      beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced',
    }
    const styleMap: Record<string, CodDiscoveryProfile['learningStyle']> = {
      visual: 'visual', reading: 'reading', mixed: 'mixed',
    }
    const expKey = String(rawProfile.experienceLevel ?? '').toLowerCase().split(' ')[0] ?? ''
    const styleKey = String(rawProfile.learningStyle ?? '').toLowerCase().split(' ')[0] ?? ''
    const profile: CodDiscoveryProfile = {
      ...rawProfile,
      experienceLevel: expMap[expKey] ?? 'beginner',
      learningStyle: styleMap[styleKey] ?? 'mixed',
      milestoneCount: Math.min(6, Math.max(3, Number(rawProfile.milestoneCount) || 3)),
    }
    await generateCodPath(profile)
    setPath({ path: { id: '', status: 'building', discoveryProfile: profile }, milestones: [] })
  }, [])

  if (path === undefined && !loadError) {
    return (
      <DashboardLayout fullBleed>
        <JourneyLoading title="Content on Demand" />
      </DashboardLayout>
    )
  }

  if (loadError) {
    return (
      <DashboardLayout fullBleed>
        <JourneyMessage
          title="Content on Demand"
          heading="We couldn't load your path"
          body={loadError}
          action={
            <button type="button" onClick={loadPath} className={btn({ variant: 'primary', size: 'md' })}>
              Retry
            </button>
          }
        />
      </DashboardLayout>
    )
  }

  // No path yet → questionnaire
  if (!path) {
    return (
      <DashboardLayout fullBleed>
        <CodConversationalQuestionnaire onProfileExtracted={handleProfileExtracted} />
      </DashboardLayout>
    )
  }

  // Path building → progress spinner with polling
  if (path.path.status === 'building' || path.path.status === 'failed') {
    if (path.path.status === 'failed') {
      return (
        <DashboardLayout fullBleed>
          <JourneyMessage
            title="Content on Demand"
            heading="We couldn't build your path"
            body="Something went wrong while Anna was building it. Start again and she will build a new one."
            action={
              <button type="button" onClick={() => setPath(null)} className={btn({ variant: 'primary', size: 'md' })}>
                Retry
              </button>
            }
          />
        </DashboardLayout>
      )
    }
    return (
      <DashboardLayout fullBleed>
        <CodPathBuildingProgress title="Content on Demand" onReady={setPath} onFailed={() => setPath(null)} />
      </DashboardLayout>
    )
  }

  // Path active/complete → learning assistant
  return (
    <DashboardLayout fullBleed>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CodEmbeddedLearningAssistant codPath={path} onPathRefresh={loadPath} />
      </div>
    </DashboardLayout>
  )
}

export default function CodLearningPage() {
  const copilotReady = useCopilotTokenReady()

  if (!copilotReady) {
    return (
      <DashboardLayout fullBleed>
        <JourneyLoading title="Content on Demand" />
      </DashboardLayout>
    )
  }

  return (
    <CopilotKit
      runtimeUrl={VOICE_RUNTIME_URL}
      headers={getCopilotHeaders()}
      useSingleEndpoint={false}
      enableInspector={false}
      showDevConsole={false}
    >
      <CodPageInner />
    </CopilotKit>
  )
}
