'use client'

import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react'
import { z } from 'zod'
import {
  useFrontendTool,
  CopilotChat,
  ToolCallStatus,
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
  type CopilotChatInputProps,
  type CopilotChatAssistantMessageProps,
} from '@copilotkit/react-core/v2'
import '@copilotkit/react-ui/v2/styles.css'
import '@/components/dashboard/copilot.css'
import { SmeepAssistantMessage, SmeepTypingCursor, onPillClickRef } from '@/components/dashboard/chat-components'
import { SanaAssistantMessage, SanaUserMessage } from '@/components/learning-ui/SanaMessages'
import { SanaChatInput } from '@/components/learning-ui/SanaChatInput'
import { useJourneyRail } from '@/components/learning-ui/useJourneyRail'
import { useSanaRunError, SanaConnectionNotice } from '@/components/learning-ui/SanaRunError'
import '@/components/learning-ui/sana-studio.css'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import { PanelRight, type LucideIcon } from 'lucide-react'
import {
  HeaderIconButton,
  JourneyBody,
  JourneyCanvas,
  JourneyHeader,
  JourneyIntro,
  LearnerLine,
  SANA_AVATAR,
} from '@/components/journeys/JourneyKit'
import { AfterAnswersNote, DiscoveryHowItWorks } from '@/components/journeys/DiscoveryPanel'
import { DiscoveryIntro, IntroComposer, ProfileCapturedNote, STANDARD_DISCOVERY_STEPS } from '@/components/journeys/DiscoveryIntro'
import type { BothDiscoveryProfile } from '@/lib/api/both'
import { TOPIC_CHIPS, TopicGoalCard, ButtonChoiceCard, type TopicGoalResult } from '../cod/discovery-cards'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'

export interface ValueProp {
  Icon: LucideIcon
  label: string
}

export interface AccentTheme {
  solid: string
  dark: string
  ink: string
  line: string
}

// Hides CopilotChat's own composer while the opening turn (with its own composer) is up.
const NullInput = () => null

const DEFAULT_HEADER_AVATAR = (
  <img src={SANA_AVATAR} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover object-top" />
)

interface Props {
  /**
   * `topicSelection` is the verbatim `collectTopicGoal` chip/goal payload the learner last
   * responded with (null if they only typed free text) — ground truth, unlike `profile`
   * which the LLM composes and may paraphrase away from the exact chip label.
   */
  onProfileExtracted: (profile: BothDiscoveryProfile, topicSelection?: TopicGoalResult | null) => void | Promise<void>
  agentId?: string
  headerAvatar?: ReactNode
  headerTitle?: ReactNode
  headerSubtitle?: ReactNode
  heroAvatar?: ReactNode
  heroHeadline?: ReactNode
  heroSubtitle?: ReactNode
  valueProps?: ValueProp[]
  topicPrompt?: ReactNode
  topicChips?: string[]
  topicCard?: { title?: string; prompt?: string; chips?: string[]; goalPlaceholder?: string; singleSelect?: boolean; hideGoal?: boolean }
  composerPlaceholder?: string
  /** Placeholder for the in-chat composer once the conversation has started (SmeepChatInput). Undefined preserves the existing default there — set only by callers that need it to match `composerPlaceholder`. */
  chatInputPlaceholder?: string
  /** Shows a typing-dots bubble while the assistant composes its next reply. Opt-in so existing callers render exactly as before. */
  showTypingIndicator?: boolean
  /** Per-message assistant avatar in the chat bubbles/typing cursor. Undefined keeps the existing AI Amplify avatar. */
  assistantAvatar?: ReactNode
  accent?: Partial<AccentTheme>
  showValueProps?: boolean
  showTopicPrompt?: boolean
  /** Whether the learning-style card is offered to the agent. */
  askLearningStyle?: boolean
  entryAction?: { label: ReactNode; message?: string; onClick?: () => void }
  /** Card that opens the conversation instead of Anna's topic starters. */
  introCard?: ReactNode
  /** Side panel content; defaults to "How it works" plus the build steps. */
  panel?: ReactNode
  /** Journey name used in Anna's opening line. */
  journeyName?: string
  /** Extra content after the entry action in the opening turn. */
  introExtra?: ReactNode
}

const ProfileSchema = z.object({
  goals: z.string(),
  topics: z.array(z.string()),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  learningStyle: z.enum(['visual', 'reading', 'mixed']).optional().default('mixed'),
  milestoneCount: z.number().int().min(3).max(6),
})

export function BothConversationalQuestionnaire({
  onProfileExtracted,
  agentId = 'codDiscovery',
  headerAvatar = DEFAULT_HEADER_AVATAR,
  headerTitle = 'Blended Learning',
  headerSubtitle = 'Building your personalized Blended Learning path',
  topicPrompt = 'Start with a topic, or type your own goal below.',
  topicChips = TOPIC_CHIPS,
  topicCard,
  composerPlaceholder = 'What do you want to learn?',
  chatInputPlaceholder,
  showTypingIndicator = false,
  assistantAvatar,
  showTopicPrompt = true,
  askLearningStyle = true,
  entryAction,
  introCard,
  panel,
  journeyName = 'Blended Learning',
  introExtra,
}: Props) {
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  const runChainRef = useRef<Promise<void>>(Promise.resolve())
  const collectTopicGoalResolveRef = useRef<((value: TopicGoalResult) => void) | null>(null)
  const lastTopicSelectionRef = useRef<TopicGoalResult | null>(null)
  const selectExperienceLevelResolveRef = useRef<((value: string) => void) | null>(null)
  const selectLearningStyleResolveRef = useRef<((value: string) => void) | null>(null)

  const [showEmptyState, setShowEmptyState] = useState(true)
  const [panelOpen, togglePanel] = useJourneyRail()

  // The composer stays live under the opening turn: before the conversation it
  // shows the intro prompt, after that the in-chat one. SanaChatInput reads it
  // from this shared ref as well as the prop.
  const placeholder = showEmptyState ? composerPlaceholder : (chatInputPlaceholder ?? 'Type your answer')

  // Custom `input` renderers only receive CopilotChat's standard props, so the
  // per-caller placeholder is threaded through a small wrapper instead — memoized
  // so identity stays stable and typing doesn't lose focus on every render.
  const StudioChatInput = useMemo(() => {
    return function StudioChatInputWithPlaceholder(props: CopilotChatInputProps) {
      return <SanaChatInput {...props} placeholder={placeholder} />
    }
  }, [placeholder])

  const AssistantMessage = useMemo(() => {
    return function AssistantMessageWithAvatar(props: CopilotChatAssistantMessageProps) {
      return <SmeepAssistantMessage {...props} avatar={assistantAvatar} />
    }
  }, [assistantAvatar])

  const Cursor = useMemo(() => {
    return function CursorWithAvatar() {
      return <SmeepTypingCursor avatar={assistantAvatar} />
    }
  }, [assistantAvatar])

  const { agent } = useAgent({
    agentId,
    updates: [UseAgentUpdate.OnMessagesChanged],
  })
  agentRef.current = agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentAny = agent as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = agentAny?.messages ?? []
  const hasConversation = messages.some((m) => m?.role === 'user' || m?.role === 'assistant')

  useEffect(() => {
    if (hasConversation) setShowEmptyState(false)
  }, [hasConversation])

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return
      setShowEmptyState(false)
      runChainRef.current = runChainRef.current.then(async () => {
        const liveAgent = agentRef.current
        try {
          liveAgent.addMessage({ id: makeUuid(), role: 'user', content: text })
          await copilotkit.runAgent({ agent: liveAgent })
        } catch (err) {
          console.warn('[both-questionnaire] runAgent failed', err)
        }
      })
    },
    [copilotkit],
  )

  // Wire answer-pill clicks (SanaAssistantMessage renders the agent's
  // <!-- options: --> blocks as pills; without this registration they are dead).
  useEffect(() => {
    onPillClickRef.current = sendMessage
    return () => { onPillClickRef.current = null }
  }, [sendMessage])

  // Visible failure state for runs (backend down / network drop) — retry
  // re-runs the agent; the user's message is already in the local thread.
  const [runFailed, setRunFailed] = useSanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent: agentRef.current }).catch(() => setRunFailed(true))
  }, [copilotkit, setRunFailed])

  useFrontendTool({
    name: 'emitProfile',
    description: 'Called when the full learner profile has been extracted from the conversation. Triggers path generation.',
    parameters: ProfileSchema,
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) return null
      return (
        <ProfileCapturedNote />
      )
    },
    handler: async (profile) => {
      try {
        await onProfileExtracted(profile, lastTopicSelectionRef.current)
      } catch (err) {
        console.warn('[both] onProfileExtracted failed', err)
      }
      return 'Path generation triggered.'
    },
  })

  useFrontendTool({
    name: 'collectTopicGoal',
    description:
      'Show an in-chat card for the learner to pick one or more topics of interest and describe their goal. Pauses until the learner responds, then returns their selection.',
    parameters: z.object({}),
    render: ({ status }) => (
      <TopicGoalCard
        {...topicCard}
        status={status}
        respond={(value) => {
          lastTopicSelectionRef.current = value
          collectTopicGoalResolveRef.current?.(value)
          collectTopicGoalResolveRef.current = null
        }}
      />
    ),
    handler: async () => {
      const value = await new Promise<TopicGoalResult>((resolve) => {
        collectTopicGoalResolveRef.current = resolve
      })
      return JSON.stringify(value)
    },
  })

  useFrontendTool({
    name: 'selectExperienceLevel',
    description:
      "Show a 3-option card for the learner's experience level (beginner/intermediate/advanced). Pauses until the learner responds.",
    parameters: z.object({}),
    render: ({ status }) => (
      <ButtonChoiceCard
        title="What's your experience level?"
        status={status}
        options={[
          { value: 'beginner', label: 'Beginner' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'advanced', label: 'Advanced' },
        ]}
        respond={(value) => {
          selectExperienceLevelResolveRef.current?.(value)
          selectExperienceLevelResolveRef.current = null
        }}
      />
    ),
    handler: async () => {
      const value = await new Promise<string>((resolve) => {
        selectExperienceLevelResolveRef.current = resolve
      })
      return JSON.stringify({ experienceLevel: value })
    },
  })

  useFrontendTool({
    name: 'selectLearningStyle',
    available: askLearningStyle,
    description:
      'Show a 3-option card for how the learner prefers to learn (videos/reading/mix). Pauses until the learner responds.',
    parameters: z.object({}),
    render: ({ status }) => (
      <ButtonChoiceCard
        title="How do you learn best?"
        status={status}
        options={[
          { value: 'visual', label: 'Videos' },
          { value: 'reading', label: 'Reading' },
          { value: 'mixed', label: 'Mix' },
        ]}
        respond={(value) => {
          selectLearningStyleResolveRef.current?.(value)
          selectLearningStyleResolveRef.current = null
        }}
      />
    ),
    handler: async () => {
      const value = await new Promise<string>((resolve) => {
        selectLearningStyleResolveRef.current = resolve
      })
      return JSON.stringify({ learningStyle: value })
    },
  })

  return (
    <JourneyCanvas>
      <JourneyHeader
        leading={headerAvatar}
        title={headerTitle}
        subtitle={headerSubtitle}
        secondaryActions={
          <HeaderIconButton
            label={panelOpen ? 'Hide how it works' : 'Show how it works'}
            aria-pressed={panelOpen}
            onClick={togglePanel}
            className="hidden xl:inline-flex"
          >
            <PanelRight className="h-4 w-4" aria-hidden />
          </HeaderIconButton>
        }
      />
      {runFailed && <SanaConnectionNotice onRetry={retryRun} />}

      <JourneyBody
        panelOpen={panelOpen}
        panel={
          panel ?? (
            <>
              <DiscoveryHowItWorks steps={STANDARD_DISCOVERY_STEPS} current={messages.some((m) => m?.role === 'user') ? 1 : 0} />
              <AfterAnswersNote />
            </>
          )
        }
      >
        <SanaReplyActionsProvider reportSurface="blended-setup">
        <CopilotChat
          agentId={agentId}
          messageView={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            assistantMessage: (assistantAvatar ? AssistantMessage : SanaAssistantMessage) as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userMessage: SanaUserMessage as any,
            // CopilotKit's own cursor slot fires reliably on isRunning regardless of
            // message-array timing (unlike keying off an empty assistant message).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(showTypingIndicator ? { cursor: Cursor as any } : {}),
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={(showEmptyState ? NullInput : StudioChatInput) as any}
          labels={{
            chatInputPlaceholder: placeholder,
            welcomeMessageText: '',
          }}
        />
        </SanaReplyActionsProvider>

        {/* Opening turn — replaced by the chat once the conversation begins.
            The composer below stays live, so the learner can just type. */}
        {showEmptyState && (
          <JourneyIntro footer={<IntroComposer placeholder={placeholder} onSend={sendMessage} />}>
            {introCard ??
              (showTopicPrompt ? (
                <DiscoveryIntro journeyName={journeyName} topics={topicChips} onTopic={sendMessage} prompt={typeof topicPrompt === 'string' ? topicPrompt : undefined} />
              ) : null)}
            {entryAction && (
              <LearnerLine
                onClick={() => {
                  if (entryAction.onClick) entryAction.onClick()
                  else if (entryAction.message) sendMessage(entryAction.message)
                }}
              >
                {entryAction.label}
              </LearnerLine>
            )}
            {introExtra}
          </JourneyIntro>
        )}
      </JourneyBody>
    </JourneyCanvas>
  )
}
