'use client'

import { useState, useEffect, useCallback } from 'react'
import { JourneyLoading, JourneyMessage } from '@/components/journeys/JourneyStates'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import { BothPathBuildingProgress } from '@/components/both/BothPathBuildingProgress'
import { BothConversationalQuestionnaire } from '@/components/both/BothConversationalQuestionnaire'
import { BothEmbeddedLearningAssistant } from '@/components/both/BothEmbeddedLearningAssistant'
import { fetchBothPath, generateBothPath, type BothPathResponse, type BothDiscoveryProfile } from '@/lib/api/both'

/**
 * The learner's Blended Learning journey as one state machine: loading →
 * error → questionnaire → building → the learning assistant. It renders no
 * page chrome; callers own the DashboardLayout and the CopilotKit provider.
 *
 * `embedded` sizes it as a framed box for the Home page; otherwise it fills a
 * full-bleed page (/dashboard/learning-both).
 */
export function LearningPathPanel({ embedded = false }: { embedded?: boolean }) {
  // Home calls it the learner's learning path; the Blended name is kept for
  // its own page, which is not in the menu.
  const TITLE = embedded ? 'Your learning path' : 'Blended Learning'
  const [path, setPath] = useState<BothPathResponse | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadPath = useCallback(async () => {
    // Clear a previous failure first, or Retry keeps showing the old error.
    setLoadError(null)
    try {
      setPath(await fetchBothPath())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load path.')
    }
  }, [])

  useEffect(() => {
    void loadPath()
  }, [loadPath])

  const handleProfileExtracted = useCallback(async (rawProfile: BothDiscoveryProfile) => {
    // The model may answer "Beginner" / "Mixed" etc.: normalise to the enum values.
    const expMap: Record<string, BothDiscoveryProfile['experienceLevel']> = {
      beginner: 'beginner',
      intermediate: 'intermediate',
      advanced: 'advanced',
    }
    const styleMap: Record<string, BothDiscoveryProfile['learningStyle']> = {
      visual: 'visual',
      reading: 'reading',
      mixed: 'mixed',
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

  let body: React.ReactNode
  if (path === undefined && !loadError) {
    body = <JourneyLoading title={TITLE} />
  } else if (loadError) {
    body = (
      <JourneyMessage
        title={TITLE}
        heading="We couldn't load your path"
        body={loadError}
        action={
          <button type="button" onClick={loadPath} className={btn({ variant: 'primary', size: 'md' })}>
            Retry
          </button>
        }
      />
    )
  } else if (!path) {
    body = embedded ? (
      <BothConversationalQuestionnaire
        onProfileExtracted={handleProfileExtracted}
        headerTitle={TITLE}
        headerSubtitle="Anna builds it from AI Amplify courses and the best videos and articles"
        journeyName="personalised learning"
      />
    ) : (
      <BothConversationalQuestionnaire onProfileExtracted={handleProfileExtracted} />
    )
  } else if (path.path.status === 'failed') {
    body = (
      <JourneyMessage
        title={TITLE}
        heading="We couldn't build your path"
        body="Something went wrong while Anna was building it. Start again and she will build a new one."
        action={
          <button type="button" onClick={() => setPath(null)} className={btn({ variant: 'primary', size: 'md' })}>
            Retry
          </button>
        }
      />
    )
  } else if (path.path.status === 'building') {
    body = (
      <BothPathBuildingProgress
        title={TITLE}
        headerSubtitle={embedded ? 'Building your personalised learning path' : undefined}
        onReady={setPath}
        onFailed={() => setPath(null)}
      />
    )
  } else {
    body = embedded ? (
      <BothEmbeddedLearningAssistant
        bothPath={path}
        onPathRefresh={loadPath}
        headerTitle={TITLE}
        headerSubtitle={(n) => `${n} milestone${n !== 1 ? 's' : ''}, AI Amplify courses plus curated videos and articles`}
      />
    ) : (
      <BothEmbeddedLearningAssistant bothPath={path} onPathRefresh={loadPath} />
    )
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        embedded
          ? // Tall enough for a real conversation, short enough that the page
            // below stays reachable on a phone.
            'h-[min(720px,calc(100dvh-9rem))] min-h-[480px] rounded-[14px] border border-ui-line shadow-ui'
          : 'flex-1',
      )}
    >
      {body}
    </div>
  )
}
