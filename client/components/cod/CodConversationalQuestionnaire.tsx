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
} from '@copilotkit/react-core/v2'
import '@copilotkit/react-ui/v2/styles.css'
import '@/components/dashboard/copilot.css'
import { SmeepAssistantMessage, SmeepUserMessage, SmeepChatInput } from '@/components/dashboard/chat-components'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import { SendHorizontal, Target, GraduationCap, TrendingUp, ChevronRight } from 'lucide-react'
import type { CodDiscoveryProfile } from '@/lib/api/cod'

const COD_AGENT = 'codDiscovery'
const NullInput = () => null

const TOPIC_CHIPS = [
  'Leadership & Management',
  'AI & Machine Learning',
  'Product Management',
  'Data Skills',
  'Communication',
]

const STEPS = [
  { num: '1', label: 'Your goals' },
  { num: '2', label: 'Skill check' },
  { num: '3', label: 'Path ready' },
]

const VALUE_PROPS = [
  { Icon: Target, label: 'Custom milestones' },
  { Icon: GraduationCap, label: 'Matched to your level' },
  { Icon: TrendingUp, label: 'Track progress' },
]

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [showEmptyState, setShowEmptyState] = useState(true)
  const [inputValue, setInputValue] = useState('')

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

  const handleInputSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    setInputValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    sendMessage(text)
  }, [inputValue, sendMessage])

  useFrontendTool({
    name: 'emitProfile',
    description: 'Called when the full learner profile has been extracted from the conversation. Triggers path generation.',
    parameters: ProfileSchema,
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) return null
      return (
        <div className="my-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-700">
          Profile captured — starting to build your learning path...
        </div>
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

  return (
    <div className="smeep-copilot flex flex-col h-[calc(100vh-7rem)] min-h-[560px] rounded-2xl border border-brand-surface-2 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: 'linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)' }}
      >
        <img
          src="/images/redesign/smeep-avatar-96.png"
          alt="Sana"
          className="w-8 h-8 rounded-full object-cover object-top"
        />
        <div>
          <p className="text-sm font-semibold text-white leading-tight">Sana — Learning Path Advisor</p>
          <p className="text-[10px] text-white/60 leading-tight">Building your personalised COD learning path</p>
        </div>
      </div>

      {/* Chat area */}
      <div className="relative flex-1 overflow-hidden smeep-assistant-chat">
        <CopilotChat
          agentId={COD_AGENT}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messageView={{ assistantMessage: SmeepAssistantMessage as any, userMessage: SmeepUserMessage as any }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={(showEmptyState ? NullInput : SmeepChatInput) as any}
          labels={{
            chatInputPlaceholder: 'Type your answer…',
            welcomeMessageText: '',
          }}
        />

        {/* Empty state overlay — replaced by chat once conversation begins */}
        {showEmptyState && (
          <div className="absolute inset-0 z-10 flex flex-col bg-white overflow-y-auto">
            {/* Hero */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 pt-6 pb-2">
              {/* Sana avatar */}
              <img
                src="/images/redesign/smeep-avatar-96.png"
                alt="Sana"
                className="w-24 h-24 rounded-full object-cover object-top mb-4 flex-shrink-0"
                style={{
                  boxShadow: '0 0 0 4px white, 0 0 0 6px #e8b4d0, 0 0 32px 8px rgba(159,32,99,0.25)',
                }}
              />

              {/* Headline */}
              <h2 className="text-lg font-black text-[#1A0A12] text-center leading-tight mb-1.5">
                Your personalised learning path<br />starts here.
              </h2>
              <p className="text-xs text-[#6b7280] text-center leading-relaxed mb-5 max-w-[260px]">
                I&apos;ll ask a few questions and build a path made just for you — takes under 2 minutes.
              </p>

              {/* Step indicator */}
              <div className="flex items-start mb-5">
                {STEPS.map((step, i) => (
                  <div key={step.num} className="flex items-start">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
                      >
                        {step.num}
                      </div>
                      <span className="text-[10px] text-[#6b7280] text-center whitespace-nowrap">{step.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="h-px w-10 mt-3.5 flex-shrink-0" style={{ background: '#e8b4d0' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Value props */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {VALUE_PROPS.map(({ Icon, label }) => (
                  <div
                    key={label}
                    className="flex flex-row items-center gap-2 px-3 py-2 overflow-hidden relative"
                    style={{
                      borderRadius: '999px',
                      background: 'linear-gradient(120deg, rgba(159,32,99,0.10) 0%, rgba(122,26,76,0.28) 100%)',
                      border: '1.5px solid rgba(159,32,99,0.25)',
                      boxShadow: '0 2px 10px rgba(159,32,99,0.07)',
                    }}
                  >
                    {/* faded ghost icon in background */}
                    <Icon
                      className="absolute -bottom-2 -right-3 opacity-[0.07]"
                      size={44}
                      strokeWidth={1.5}
                      style={{ color: '#9f2063' }}
                    />
                    {/* foreground icon */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.30)' }}
                    >
                      <Icon size={13} strokeWidth={2} style={{ color: '#9f2063' }} />
                    </div>
                    <span className="text-[11px] font-semibold relative z-10 whitespace-nowrap" style={{ color: '#3d1a2b' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Topic chips */}
              <p className="text-sm font-semibold mb-3 text-center" style={{ color: 'rgba(159,32,99,0.75)' }}>
                Start with a topic — or type below:
              </p>
              <div className="flex flex-wrap gap-2 w-full justify-center">
                {TOPIC_CHIPS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => sendMessage(topic)}
                    className="smeep-topic-chip"
                  >
                    {topic}
                    <ChevronRight size={14} strokeWidth={2.5} className="opacity-70" />
                  </button>
                ))}
              </div>
            </div>

            {/* Input — same styling as SmeepChatInput */}
            <div className="px-3 pb-3 pt-2 flex-shrink-0">
              <div className="smeep-chat-input-wrap flex items-end gap-2 px-3 py-2 bg-[#fdf5f9] border border-[#f7e8f0] rounded-2xl">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleInputSend()
                    }
                  }}
                  placeholder="What do you want to learn?"
                  rows={1}
                  className="smeep-chat-textarea flex-1 bg-transparent outline-none resize-none text-[13px] text-[#1A0A12] leading-snug placeholder:text-[#6B7280]/50 min-w-0"
                  style={{ minHeight: '20px', maxHeight: '120px', fontFamily: 'inherit' }}
                />
                <button
                  onClick={handleInputSend}
                  disabled={!inputValue.trim()}
                  aria-label="Send"
                  className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 self-end transition-opacity disabled:opacity-30"
                  style={
                    inputValue.trim()
                      ? { background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }
                      : { background: '#f7e8f0' }
                  }
                >
                  <SendHorizontal size={13} strokeWidth={2.5} className="text-white" />
                </button>
              </div>
              <p className="smeep-chat-hint text-[10px] text-center mt-1.5 select-none text-gray-500/45">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
