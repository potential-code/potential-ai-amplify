'use client'

import { useState, useEffect, useCallback } from 'react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
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

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-brand-surface-2 bg-white p-6 space-y-3">
          <div className="h-4 w-1/3 bg-brand-surface-2 rounded" />
          <div className="h-3 w-2/3 bg-brand-surface-2 rounded" />
        </div>
      ))}
    </div>
  )
}

function CodPageInner() {
  const [path, setPath] = useState<CodPathResponse | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadPath = useCallback(async () => {
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
      <DashboardLayout>
        <PageSkeleton />
      </DashboardLayout>
    )
  }

  if (loadError) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={loadPath}
            className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
          >
            Retry
          </button>
        </div>
      </DashboardLayout>
    )
  }

  // No path yet → questionnaire
  if (!path) {
    return (
      <DashboardLayout>
        <CodConversationalQuestionnaire onProfileExtracted={handleProfileExtracted} />
      </DashboardLayout>
    )
  }

  // Path building → progress spinner with polling
  if (path.path.status === 'building' || path.path.status === 'failed') {
    if (path.path.status === 'failed') {
      return (
        <DashboardLayout>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
            <p className="text-sm font-semibold text-red-700">Path generation failed. Please try again.</p>
            <button
              type="button"
              onClick={() => setPath(null)}
              className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
            >
              Retry
            </button>
          </div>
        </DashboardLayout>
      )
    }
    return (
      <DashboardLayout>
        <div className="smeep-copilot flex flex-col h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
            style={{ background: 'linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)' }}
          >
            <img
              src="/images/redesign/smeep-avatar-96.png"
              alt="Sana"
              className="w-8 h-8 rounded-full object-cover object-top"
            />
            <div>
              <p className="text-sm font-semibold text-white leading-tight">Sana — Learning Path Advisor</p>
              <p className="text-[10px] text-white/60 leading-tight">Building your personalised COD learning path</p>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <CodPathBuildingProgress onReady={setPath} onFailed={() => setPath(null)} />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Path active/complete → learning assistant
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white overflow-hidden" style={{ boxShadow: '0 16px 64px rgba(26, 10, 18, 0.24), 0 4px 20px rgba(26, 10, 18, 0.14)' }}>
        <CodEmbeddedLearningAssistant codPath={path} onPathRefresh={loadPath} />
      </div>
    </DashboardLayout>
  )
}

export default function CodLearningPage() {
  const copilotReady = useCopilotTokenReady()

  if (!copilotReady) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white shadow-sm animate-pulse" />
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
