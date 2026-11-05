'use client'

/**
 * The Anna-styled chat used by the admin AI pages: CopilotKit v2's
 * `CopilotChat` with the Anna Studio message, cursor and composer slots, the
 * connection notice, and a send/reset helper that starter prompts and buttons
 * share with the composer (so a click and a typed question are one code path).
 */
import { useCallback, type ComponentType, type ReactElement, type ReactNode } from 'react'
import {
  CopilotChat,
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
  type CopilotChatAssistantMessageProps,
} from '@copilotkit/react-core/v2'
import { SanaAssistantMessage, SanaTypingIndicator, SanaUserMessage } from '@/components/learning-ui/SanaMessages'
import { SanaChatInput, SanaComposerOptions } from '@/components/learning-ui/SanaChatInput'
import { SanaConnectionNotice, useSanaRunError } from '@/components/learning-ui/SanaRunError'
import { ChatLoadingContext } from '@/components/dashboard/chat-loading-context'
import { useNewConversation } from './AdminCopilot'
import { cn } from '@/lib/utils'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Send a message the way CopilotChat's composer does: add it, then run. */
export function useConversation(agentId: string) {
  const { agent } = useAgent({
    agentId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  })
  const { copilotkit } = useCopilotKit()

  const send = useCallback(
    async (content: string) => {
      if (agent.isRunning) return
      agent.addMessage({ id: newId(), role: 'user', content })
      try {
        await copilotkit.runAgent({ agent })
      } catch (error) {
        console.error('[admin-ai] run failed', error)
      }
    },
    [agent, copilotkit],
  )

  // A new thread as well as an empty transcript (see AdminCopilotSession).
  const newConversation = useNewConversation()
  const reset = useCallback(() => {
    if (agent.isRunning) copilotkit.stopAgent({ agent })
    newConversation()
  }, [agent, copilotkit, newConversation])

  return { agent, copilotkit, send, reset, running: agent.isRunning, hasMessages: agent.messages.length > 0 }
}

/**
 * The graphs stream their internal router/planner completions as assistant
 * text (`{"route":…}`, `{"ok":true,"spec":{…}}`) before the real reply. A
 * natural-language reply never parses as one of these, so they are dropped.
 */
const INTERNAL_KEYS = ['route', 'spec', 'refusalReason', 'ok']

export function isAgentInternalJson(content: unknown): boolean {
  if (typeof content !== 'string') return false
  const text = content.trim()
  if (!text.startsWith('{') || !text.endsWith('}')) return false
  try {
    const parsed = JSON.parse(text) as unknown
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && INTERNAL_KEYS.some((k) => k in parsed)
  } catch {
    return false
  }
}

function AdminAssistantMessage(props: CopilotChatAssistantMessageProps) {
  const { message } = props
  if (!isAgentInternalJson(message.content)) return <SanaAssistantMessage {...props} />
  if (!message.toolCalls?.length) return null
  return <SanaAssistantMessage {...props} message={{ ...message, content: '' }} />
}

const MESSAGE_VIEW = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assistantMessage: AdminAssistantMessage as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userMessage: SanaUserMessage as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor: SanaTypingIndicator as any,
}

export type WelcomeScreenProps = { input: ReactElement; className?: string }

export function AdminChat({
  agentId,
  welcomeScreen,
  placeholder,
  footnote,
  header,
  className,
  reportSurface,
}: {
  agentId: string
  welcomeScreen: ComponentType<WelcomeScreenProps>
  placeholder: string
  footnote?: string
  /** Rendered above the transcript (title row, conversation actions). */
  header?: ReactNode
  className?: string
  /** Learner-facing uses (the course helper) turn on "report this answer"; admins' own tools don't. */
  reportSurface?: string
}) {
  const { agent, copilotkit, running } = useConversation(agentId)
  const [runFailed, setRunFailed] = useSanaRunError(copilotkit, agent)

  const retry = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent }).catch(() => undefined)
  }, [agent, copilotkit, setRunFailed])

  return (
    <ChatLoadingContext.Provider value={running}>
      <div className={cn('sana-studio smeep-copilot relative flex min-h-0 flex-col overflow-hidden bg-ui-bg', className)}>
        {header}
        <SanaComposerOptions.Provider value={{ placeholder, footnote, dictation: false }}>
          <div className="smeep-assistant-chat relative min-h-0 min-w-0 flex-1 overflow-hidden">
            {runFailed && <SanaConnectionNotice onRetry={retry} />}
            <SanaReplyActionsProvider reportSurface={reportSurface}>
            <CopilotChat
              agentId={agentId}
              messageView={MESSAGE_VIEW}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input={SanaChatInput as any}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              welcomeScreen={welcomeScreen as any}
              labels={{ chatInputPlaceholder: placeholder }}
              className="h-full min-h-0"
            />
            </SanaReplyActionsProvider>
          </div>
        </SanaComposerOptions.Provider>
      </div>
    </ChatLoadingContext.Provider>
  )
}
