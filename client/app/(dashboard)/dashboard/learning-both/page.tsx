'use client'

import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { LearningPathPanel } from '@/components/both/LearningPathPanel'
import {
  useCopilotTokenReady,
  getCopilotHeaders,
} from '@/components/dashboard/copilotConfig'

const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

// Kept live as a direct URL for backward compatibility (matches how
// /dashboard/learning and /dashboard/learning-cod remain live-but-unlinked
// today) — it's simply no longer reachable from the sidebar; the same
// LearningPathPanel now lives on the Overview page.
export default function BothLearningPage() {
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
      <DashboardLayout>
        <LearningPathPanel />
      </DashboardLayout>
    </CopilotKit>
  )
}
