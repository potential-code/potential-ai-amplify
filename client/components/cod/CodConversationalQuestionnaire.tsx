'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { z } from 'zod'
import {
  useFrontendTool,
  CopilotChat,
  ToolCallStatus,
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
  type CopilotChatInputProps,
} from '@copilotkit/react-core/v2'
import '@copilotkit/react-ui/v2/styles.css'
import '@/components/dashboard/copilot.css'
import '@/components/learning-ui/sana-studio.css'
import { SanaAssistantMessage, SanaUserMessage } from '@/components/learning-ui/SanaMessages'
import { onPillClickRef } from '@/components/dashboard/chat-components'
import { SanaChatInput } from '@/components/learning-ui/SanaChatInput'
import { useJourneyRail } from '@/components/learning-ui/useJourneyRail'
import { useSanaRunError, SanaConnectionNotice } from '@/components/learning-ui/SanaRunError'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import { PanelRight } from 'lucide-react'
import {
  HeaderIconButton,
  JourneyBody,
  JourneyCanvas,
  JourneyHeader,
  JourneyIntro,
  SANA_AVATAR,
} from '@/components/journeys/JourneyKit'
import { AfterAnswersNote, DiscoveryHowItWorks } from '@/components/journeys/DiscoveryPanel'
import { DiscoveryIntro, IntroComposer, ProfileCapturedNote, STANDARD_DISCOVERY_STEPS } from '@/components/journeys/DiscoveryIntro'
import type { CodDiscoveryProfile } from '@/lib/api/cod'
import { TOPIC_CHIPS, TopicGoalCard, ButtonChoiceCard, type TopicGoalResult } from './discovery-cards'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'

const COD_AGENT = 'codDiscovery'

// CopilotChat's custom input only receives the standard props; the placeholder rides along here.
function CodChatInput(props: CopilotChatInputProps) {
  return <SanaChatInput {...props} placeholder="Type your answer" />
}
// Hides CopilotChat's own composer while the opening turn (with its own composer) is up.
const NullInput = () => null

interface Props {
  onProfileExtracted: (profile: CodDiscoveryProfile) => Promise<void>
}

const ProfileSchema = z.object({
  goals: z.string(),
  topics: z.array(z.string()),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  learningStyle: z.enum(['visual', 'reading', 'mixed']),
  milestoneCount: z.number().int().min(3).max(6),
})

export function CodConversationalQuestionnaire({ onProfileExtracted }: Props) {
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  const runChainRef = useRef<Promise<void>>(Promise.resolve())
  const collectTopicGoalResolveRef = useRef<((value: TopicGoalResult) => void) | null>(null)
  const selectExperienceLevelResolveRef = useRef<((value: string) => void) | null>(null)
  const selectLearningStyleResolveRef = useRef<((value: string) => void) | null>(null)

  const [showEmptyState, setShowEmptyState] = useState(true)
  const [panelOpen, togglePanel] = useJourneyRail()


  const { agent } = useAgent({
    agentId: COD_AGENT,
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
          console.warn('[cod-questionnaire] runAgent failed', err)
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
        await onProfileExtracted(profile)
      } catch (err) {
        console.warn('[cod] onProfileExtracted failed', err)
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
        status={status}
        respond={(value) => {
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
        leading={<img src={SANA_AVATAR} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover object-top" />}
        title="Content on Demand"
        subtitle="Anna, your learning path advisor, builds a path of curated videos and articles"
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
          <>
            <DiscoveryHowItWorks steps={STANDARD_DISCOVERY_STEPS} />
            <AfterAnswersNote />
          </>
        }
      >
        <SanaReplyActionsProvider reportSurface="content-on-demand-setup">
        <CopilotChat
          agentId={COD_AGENT}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messageView={{ assistantMessage: SanaAssistantMessage as any, userMessage: SanaUserMessage as any }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={(showEmptyState ? NullInput : CodChatInput) as any}
          labels={{
            chatInputPlaceholder: 'What do you want to learn?',
            welcomeMessageText: '',
          }}
        />
        </SanaReplyActionsProvider>

        {/* Opening turn — replaced by the chat once the conversation begins.
            The composer below stays live, so the learner can just type a goal. */}
        {showEmptyState && (
          <JourneyIntro footer={<IntroComposer placeholder={'What do you want to learn?'} onSend={sendMessage} />}>
            <DiscoveryIntro journeyName="Content on Demand" topics={TOPIC_CHIPS} onTopic={sendMessage} />
          </JourneyIntro>
        )}
      </JourneyBody>
    </JourneyCanvas>
  )
}
