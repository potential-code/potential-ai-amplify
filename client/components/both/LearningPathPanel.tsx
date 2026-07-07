'use client'

import { useState, useEffect, useCallback } from 'react'
import { BothPathBuildingProgress } from '@/components/both/BothPathBuildingProgress'
import { BothConversationalQuestionnaire } from '@/components/both/BothConversationalQuestionnaire'
import { BothEmbeddedLearningAssistant } from '@/components/both/BothEmbeddedLearningAssistant'
import { fetchBothPath, generateBothPath, type BothPathResponse, type BothDiscoveryProfile } from '@/lib/api/both'

export function PathPanelSkeleton() {
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

/**
 * Self-contained Learning Path state machine (skeleton → error → questionnaire
 * → building → embedded assistant). Assumes it is already inside a
 * DashboardLayout + CopilotKit provider owned by its caller (Overview page or
 * the standalone /dashboard/learning-both route) — it renders no page chrome
 * of its own.
 */
export function LearningPathPanel() {
  const [path, setPath] = useState<BothPathResponse | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadPath = useCallback(async () => {
    try {
      const result = await fetchBothPath()
      setPath(result)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load path.')
    }
  }, [])

  useEffect(() => { void loadPath() }, [loadPath])

  const handleProfileExtracted = useCallback(async (rawProfile: BothDiscoveryProfile) => {
    // LLM may return "Beginner" / "Mixed" etc. — normalize to lowercase enum values
    const expMap: Record<string, BothDiscoveryProfile['experienceLevel']> = {
      beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced',
    }
    const styleMap: Record<string, BothDiscoveryProfile['learningStyle']> = {
      visual: 'visual', reading: 'reading', mixed: 'mixed',
    }
    const expKey = String(rawProfile.experienceLevel ?? '').toLowerCase().split(' ')[0] ?? ''
    const styleKey = String(rawProfile.learningStyle ?? '').toLowerCase().split(' ')[0] ?? ''
    const profile: BothDiscoveryProfile = {
      ...rawProfile,
      experienceLevel: expMap[expKey] ?? 'beginner',
      learningStyle: styleMap[styleKey] ?? 'mixed',
      milestoneCount: Math.min(6, Math.max(3, Number(rawProfile.milestoneCount) || 3)),
    }
    await generateBothPath(profile)
    setPath({
      path: { id: '', status: 'building', discoveryProfile: profile, internalBlockCount: 0 },
      milestones: [],
    })
  }, [])

  if (path === undefined && !loadError) {
    return <PathPanelSkeleton />
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <p className="text-sm font-semibold text-red-700">{loadError}</p>
        <button
          type="button"
          onClick={loadPath}
          className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
        >
          Retry
        </button>
      </div>
    )
  }

  // No path yet → questionnaire
  if (!path) {
    return <BothConversationalQuestionnaire onProfileExtracted={handleProfileExtracted} />
  }

  // Path building → progress spinner with polling
  if (path.path.status === 'building' || path.path.status === 'failed') {
    if (path.path.status === 'failed') {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-red-700">Path generation failed. Please try again.</p>
          <button
            type="button"
            onClick={() => setPath(null)}
            className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
          >
            Retry
          </button>
        </div>
      )
    }
    return (
      <div className="smeep-copilot flex flex-col h-[calc(100vh-11rem)] min-h-[480px] rounded-2xl border border-brand-surface-2 overflow-hidden">
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
          style={{ background: 'linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)' }}
        >
          <img
            src="/images/redesign/anna-avatar-96.png"
            alt="Anna"
            className="w-8 h-8 rounded-full object-cover object-top"
          />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Anna — Learning Path Advisor</p>
            <p className="text-[10px] text-white/60 leading-tight">Building your personalised learning path</p>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <BothPathBuildingProgress onReady={setPath} onFailed={() => setPath(null)} />
        </div>
      </div>
    )
  }

  // Path active/complete → learning assistant
  return (
    <div className="h-[calc(100vh-11rem)] min-h-[480px] rounded-2xl border border-brand-surface-2 bg-white overflow-hidden" style={{ boxShadow: '0 16px 64px rgba(26, 10, 18, 0.24), 0 4px 20px rgba(26, 10, 18, 0.14)' }}>
      <BothEmbeddedLearningAssistant bothPath={path} onPathRefresh={loadPath} />
    </div>
  )
}
