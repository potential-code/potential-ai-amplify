'use client'

import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { EmbeddedDashboardAssistant } from '@/components/dashboard/EmbeddedDashboardAssistant'
import { useCopilotTokenReady } from '@/components/dashboard/AssistantProvider'
import { getCopilotHeaders } from '@/components/dashboard/copilotConfig'

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). The agent + thread bind on <CopilotChat>/useAgent inside
// EmbeddedDashboardAssistant, not on the provider.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

/**
 * Anna's dedicated page — the dashboard assistant on a full-bleed canvas,
 * like the learning surfaces. The dashboard itself keeps only a slim entry
 * card that links here.
 */
export default function AnnaPage() {
  // Assistant is for logged-in users only: wait for the minted service token
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
      /* Hide CopilotKit's dev chrome: enableInspector kills the floating debug
         diamond + announcement bubbles; showDevConsole kills the dev console. */
      enableInspector={false}
      showDevConsole={false}
    >
      <DashboardLayout fullBleed>
        {/* sana-studio--wide: dedicated page has no journey rail, so the thread
            and composer widen to 960px (see sana-studio.css). */}
        <EmbeddedDashboardAssistant className="flex-1 min-h-0 h-auto sana-studio--wide" />
      </DashboardLayout>
    </CopilotKit>
  )
}
