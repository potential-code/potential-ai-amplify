'use client'

/**
 * Visible failure state for Anna's agent runs. Until now a failed run (AI
 * backend down, network drop) died completely silently — CopilotKit logged
 * `agent_run_error_event` to the console and the thread just never answered.
 *
 * `useSanaRunError(agent)` subscribes to the ag-ui agent's run events:
 * RUN_ERROR shows the notice, the next RUN_STARTED clears it. This catches
 * every send path — typed composer messages, pill clicks, and the synthetic
 * card/driver sends — because they all end in the same agent run pipeline.
 *
 * `SanaConnectionNotice` floats above the composer. Retry just re-runs the
 * agent: the user's message already landed in the local thread before the run
 * failed, so no text is lost.
 */

import { useEffect, useState } from 'react'
import { RotateCw, WifiOff } from 'lucide-react'

// Error codes that mean "the run never produced a reply" — anything else
// (tool parse hiccups etc.) recovers on its own and shouldn't alarm the user.
const RUN_DEAD_CODES = new Set([
  'agent_run_failed_event',
  'agent_run_error_event',
  'agent_not_found',
])

type SubscribableCore = {
  subscribe?: (subscriber: {
    onError?: (event: { code?: string }) => void
  }) => { unsubscribe?: () => void } | undefined
} | null | undefined

type SubscribableAgent = {
  subscribe?: (subscriber: Record<string, () => void>) => { unsubscribe?: () => void } | undefined
} | null | undefined

export function useSanaRunError(copilotkit: unknown, agent?: unknown): [boolean, (failed: boolean) => void] {
  const [failed, setFailed] = useState(false)

  // Failures surface on the CopilotKit CORE subscriber — agent-level
  // AgentSubscriber registrations do NOT receive run error events (runs only
  // notify their run-scoped subscribers), which is why this hook listens here.
  useEffect(() => {
    const core = copilotkit as SubscribableCore
    if (!core?.subscribe) return
    const sub = core.subscribe({
      onError: (event) => {
        if (RUN_DEAD_CODES.has(String(event?.code ?? ''))) setFailed(true)
      },
    })
    return () => sub?.unsubscribe?.()
  }, [copilotkit])

  // Best-effort clear on the next run start; retry/next-send paths also clear
  // explicitly via the returned setter.
  useEffect(() => {
    const a = agent as SubscribableAgent
    if (!a?.subscribe) return
    const sub = a.subscribe({ onRunStartedEvent: () => setFailed(false) })
    return () => sub?.unsubscribe?.()
  }, [agent])

  return [failed, setFailed]
}

export function SanaConnectionNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[96px] z-[6] flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex items-center gap-3 rounded-[10px] border px-3.5 py-2 shadow-ui"
        style={{
          borderColor: 'color-mix(in srgb, var(--sana-warn, #87490f) 25%, transparent)',
          background: 'var(--sana-warn-bg, #fbefe2)',
          animation: 'sana-fadeup 0.24s ease both',
        }}
      >
        <WifiOff className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--sana-warn, #87490f)' }} aria-hidden />
        <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--sana-warn, #87490f)' }}>
          Anna couldn&rsquo;t respond. She may be offline right now.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-[10px] border border-ui-line bg-ui-surface px-3 text-[13px] font-semibold text-ui-text transition-colors hover:bg-ui-surface-2"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
