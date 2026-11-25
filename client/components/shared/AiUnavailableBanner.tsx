'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { HUMAN_MENTORS_ENABLED } from '@/lib/features'

const AI_BASE = process.env['NEXT_PUBLIC_AI_BACKEND_URL'] ?? 'http://localhost:8000'

/**
 * Pings the AI backend's public health endpoint and reports reachability.
 * null = not yet checked, true = healthy, false = unreachable/unhealthy.
 * Re-checks every 30s so the banner clears itself once the service recovers.
 */
function useAiBackendHealth(): boolean | null {
  const [healthy, setHealthy] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch(`${AI_BASE}/healthz`, { signal: AbortSignal.timeout(4000) })
        if (!cancelled) setHealthy(res.ok)
      } catch {
        if (!cancelled) setHealthy(false)
      }
    }

    void check()
    const id = window.setInterval(check, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return healthy
}

/**
 * The banner's words. Human mentors are named among the things that still
 * work only while they are switched on (HUMAN_MENTORS_ENABLED).
 */
export function aiUnavailableCopy(humanMentorsOn: boolean): { title: string; body: string } {
  const stillWorks = humanMentorsOn ? 'Courses, mentors, offers and events' : 'Courses, offers and events'
  return {
    title: 'Anna is temporarily unavailable',
    body:
      'The AI assistant can’t be reached right now, so Anna, the AI Mentors and Interactive Learning won’t respond. ' +
      `${stillWorks} all still work — please try the AI features again in a few minutes.`,
  }
}

/**
 * Renders a dismissable notice when the AI backend is unreachable, so
 * Anna-dependent surfaces (chat, AI Mentors, Interactive Learning) fail with
 * an explanation instead of endless skeletons and silent "Failed to fetch"
 * console errors. Renders nothing while unknown or healthy.
 */
export function AiUnavailableBanner() {
  const healthy = useAiBackendHealth()
  const [dismissed, setDismissed] = useState(false)

  if (healthy !== false || dismissed) return null

  const copy = aiUnavailableCopy(HUMAN_MENTORS_ENABLED)
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="status">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <div className="flex-1 text-xs text-amber-800">
        <p className="font-semibold">{copy.title}</p>
        <p className="mt-0.5">{copy.body}</p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-amber-500 transition-colors hover:text-amber-700"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
