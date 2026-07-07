'use client'

import { motion } from 'framer-motion'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { EmbeddedDashboardAssistant } from '@/components/dashboard/EmbeddedDashboardAssistant'
import { useCopilotTokenReady, getCopilotHeaders } from '@/components/dashboard/copilotConfig'

// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run). Same runtime settings used by Overview's assistant slot.
const AI_BACKEND_URL =
  (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

export default function AnnaPage() {
  const copilotReady = useCopilotTokenReady()

  if (!copilotReady) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 bg-white shadow-sm animate-pulse" />
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <CopilotKit
        runtimeUrl={VOICE_RUNTIME_URL}
        /* Resolved object, not the function: the core's /info fetch doesn't
           resolve function-form headers (agent runs do), which 401s the
           runtime-info request. Safe here — this subtree only mounts after
           useCopilotTokenReady(), so the token is already cached. */
        headers={getCopilotHeaders()}
        /* Express handler is multi-route (/info, /transcribe, /agent/:id/run),
           so the client must NOT use single-endpoint mode (default true) — else
           the runtime-info fetch 404s. */
        useSingleEndpoint={false}
        /* Hide CopilotKit's dev chrome: enableInspector kills the floating
           debug diamond + announcement bubbles (@copilotkit/web-inspector);
           showDevConsole kills the dev console. */
        enableInspector={false}
        showDevConsole={false}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-brand-surface-2 bg-white overflow-hidden"
          style={{ boxShadow: '0 16px 64px rgba(26, 10, 18, 0.24), 0 4px 20px rgba(26, 10, 18, 0.14)' }}
        >
          <EmbeddedDashboardAssistant className="h-[calc(100vh-7rem)] min-h-[560px]" />
        </motion.div>
      </CopilotKit>
    </DashboardLayout>
  )
}
