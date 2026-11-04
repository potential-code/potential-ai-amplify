'use client'

import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { JourneyLoading } from '@/components/journeys/JourneyStates'
import { LearningPathPanel } from '@/components/both/LearningPathPanel'
import {
  useCopilotTokenReady,
  getCopilotHeaders,
} from '@/components/dashboard/copilotConfig'

const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

export default function BothLearningPage() {
  const copilotReady = useCopilotTokenReady()

  if (!copilotReady) {
    return (
      <DashboardLayout fullBleed>
        <JourneyLoading title="Blended Learning" />
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
      <DashboardLayout fullBleed>
        <LearningPathPanel />
      </DashboardLayout>
    </CopilotKit>
  )
}
