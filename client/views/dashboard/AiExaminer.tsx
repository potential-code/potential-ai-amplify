'use client'

import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { SanaExaminer } from '@/components/examiner/SanaExaminer'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). The agent + thread bind on <CopilotChat>/useAgent inside
// SanaExaminer, not on the provider.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

/**
 * The AI Examiner — Anna as a mystery shopper, graded against a chosen AI Amplify
 * course. Full-bleed Anna Studio canvas, same provider pattern as the
 * concierge and learning pages.
 */
export default function AiExaminerPage() {
  // Examiner is for logged-in users only: wait for the minted service token
  // before mounting the CopilotKit provider (its first request needs auth).
  const copilotReady = useCopilotTokenReady()

  if (!copilotReady) {
    return (
      <DashboardLayout fullBleed>
        <div className="flex-1 min-h-0 bg-ui-bg" aria-busy="true" />
      </DashboardLayout>
    )
  }

  return (
    <CopilotKit
      runtimeUrl={VOICE_RUNTIME_URL}
      /* Resolved object, not the function — the core's /info fetch doesn't
         resolve function-form headers (agent runs do), which 401s the
         runtime-info request. Safe here: this subtree only mounts after
         useCopilotTokenReady(), so the token is already cached. */
      headers={getCopilotHeaders()}
      /* Express handler is multi-route (/info, /transcribe, /agent/:id/run),
         so the client must NOT use single-endpoint mode (default true) — else
         the runtime-info fetch 404s. */
      useSingleEndpoint={false}
      /* Hide CopilotKit's dev chrome. */
      enableInspector={false}
      showDevConsole={false}
    >
      <DashboardLayout fullBleed>
        <SanaExaminer />
      </DashboardLayout>
    </CopilotKit>
  )
}
