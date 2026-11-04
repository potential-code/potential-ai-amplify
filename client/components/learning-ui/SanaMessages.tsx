'use client'

/**
 * Chat primitives for the Anna Studio learning pages.
 *
 * Anna's turns render as bordered surface bubbles beside her portrait, the
 * learner's as solid magenta bubbles; cards and chips line up with Anna's
 * bubble (the `.sana-lead` indent). Synthetic driver messages that the cards send to steer the agent
 * ("Start milestone …", "Display content …") are suppressed — they are
 * plumbing, not conversation.
 *
 * Reuses the pill parsing and send refs from the dashboard chat components so
 * option pills and suggestion chips keep working unchanged.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  CopilotChatAssistantMessageProps,
  CopilotChatUserMessageProps,
} from '@copilotkit/react-core/v2'
import { CopilotChatToolCallsView } from '@copilotkit/react-core/v2'
import { motion } from 'framer-motion'
import {
  parseAssistantPills,
  isSyntheticDriverMessage,
  onPillClickRef,
} from '@/components/dashboard/chat-components'
import { ChatLoadingContext } from '@/components/dashboard/chat-loading-context'

export const SANA_AVATAR_SRC = '/images/redesign/anna-avatar-96.png'

function SanaPortrait({ size = 32 }: { size?: number }) {
  return (
    <img
      src={SANA_AVATAR_SRC}
      alt="Anna"
      width={size}
      height={size}
      className="rounded-full object-cover object-top flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

/** Extra driver patterns used by the COD/Both card flows beyond the shared set. */
const EXTRA_DRIVER_PATTERNS = [
  /^I finished the simulation for ".+"\. Now show the final quiz\.$/,
  // Prefix match: the quiz-passed driver's tail wording varies (it now asks
  // Anna for a one-line congratulation) but always starts like this.
  /^I just passed the quiz for ".+"\./,
  /^I just completed the final block/,
  /^Show my updated .+ learning path\.$/,
  // Multi Learning's hidden turns (kick-off, menu actions).
  /^\[sys\]/,
]

function isDriverMessage(text: string): boolean {
  const trimmed = text.trim()
  return isSyntheticDriverMessage(trimmed) || EXTRA_DRIVER_PATTERNS.some((re) => re.test(trimmed))
}

function contentToText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : ''))
      .join('')
  }
  return ''
}

// Module-level registry so a newer pill set disables the previous one, matching
// the behavior of the dashboard chat components.
let disablePreviousSanaPills: (() => void) | null = null

// ── SanaTypingIndicator ───────────────────────────────────────────────────────

export function SanaTypingIndicator() {
  return (
    <div className="flex gap-2.5 items-start mb-4" style={{ animation: 'sana-fadeup 0.24s ease both' }} role="status" aria-label="Anna is replying">
      <SanaPortrait />
      <div className="sana-bubble sana-typing flex items-center gap-1.5 !py-[18px]">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full bg-ui-muted"
            animate={{ y: [0, -3, 0], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  )
}

// ── SanaAssistantMessage ──────────────────────────────────────────────────────

/**
 * Actions under each finished reply (copy, read aloud, regenerate). A surface
 * opts in by providing a renderer; without one, replies show no actions.
 */
export type SanaReplyActionsRenderer = (reply: { id: string; text: string; isLast: boolean; question?: string }) => ReactNode
export const SanaReplyActions = createContext<SanaReplyActionsRenderer | null>(null)

export function SanaAssistantMessage({ message, messages }: CopilotChatAssistantMessageProps) {
  const m = message as { content?: unknown; toolCalls?: unknown[]; id?: string } | undefined
  const content = contentToText(m?.content)
  const hasText = content.trim().length > 0
  const hasToolCalls = !!m?.toolCalls?.length
  const { prose, pills, label, multiSelect, isSuggest } = parseAssistantPills(content)
  const hasPills = pills.length > 0

  const [pillsDisabledByNewer, setPillsDisabledByNewer] = useState(false)
  const [selectedPills, setSelectedPills] = useState<Set<number>>(new Set())
  const streaming = useContext(ChatLoadingContext)
  const renderActions = useContext(SanaReplyActions)
  const hasRegisteredPillsRef = useRef(false)

  useEffect(() => {
    if (!hasPills || hasRegisteredPillsRef.current) return
    hasRegisteredPillsRef.current = true
    disablePreviousSanaPills?.()
    disablePreviousSanaPills = () => setPillsDisabledByNewer(true)
  }, [hasPills])

  const thisId = m?.id
  const lastId = (messages as Array<{ id?: string }> | undefined)?.[(messages?.length ?? 0) - 1]?.id
  const isStale = Boolean(thisId && lastId && thisId !== lastId)
  // Reply actions: once per answer (on its last shown text, not the greeting),
  // and only after the answer has finished.
  const answerList = (messages as Array<{ id?: string; role?: string; content?: unknown; toolCalls?: unknown[] }> | undefined) ?? []
  const answerIdx = thisId ? answerList.findIndex((mm) => mm.id === thisId) : -1
  const lastUserIdx = answerList.map((mm) => mm.role).lastIndexOf('user')
  let laterTextInTurn = false
  for (let k = answerIdx + 1; answerIdx >= 0 && k < answerList.length; k++) {
    const next = answerList[k]
    if (next?.role === 'user') break
    // A later text with tool calls is a repeated lead-in, and isn't shown.
    if (next?.role === 'assistant' && !next.toolCalls?.length && contentToText(next.content).trim()) {
      laterTextInTurn = true
      break
    }
  }
  const inLatestTurn = answerIdx > lastUserIdx
  // Not the opening greeting: something the learner actually said (hidden
  // driver messages don't count), or an earlier answer, comes before it.
  const before = answerIdx > 0 ? answerList.slice(0, answerIdx) : []
  const afterGreeting = before.some(
    (mm) =>
      (mm.role === 'user' && !isDriverMessage(contentToText(mm.content))) ||
      (mm.role === 'assistant' && !mm.toolCalls?.length && contentToText(mm.content).trim()),
  )
  const showActions = afterGreeting && !laterTextInTurn && !(streaming && inLatestTurn)
  // What the learner asked that this answers (for "report this answer").
  const question = (() => {
    for (let k = answerIdx - 1; k >= 0; k--) {
      const mm = answerList[k]
      if (mm?.role !== 'user') continue
      const said = contentToText(mm.content)
      if (isDriverMessage(said)) continue
      return said.replace(/<!--[\s\S]*?-->/g, '').split('\n\n[Attached document "')[0]!.trim().slice(0, 4000)
    }
    return undefined
  })()
  const pillsDisabled = streaming || pillsDisabledByNewer || isStale

  if (!hasText && !hasToolCalls) return null

  // One voice line per run: an agent answering across several tool-call turns
  // tends to restate its lead-in on each turn. If an earlier assistant message
  // in this run (no user message in between) already spoke, render only this
  // message's tool calls and drop the repeated prose.
  let suppressRepeatedLeadIn = false
  if (hasText && hasToolCalls && messages && thisId) {
    const list = messages as Array<{ id?: string; role?: string; content?: unknown }>
    const idx = list.findIndex((mm) => mm.id === thisId)
    for (let i = idx - 1; i >= 0; i--) {
      const prev = list[i]
      if (prev?.role === 'user') break
      if (prev?.role === 'assistant' && contentToText(prev.content).trim().length > 0) {
        suppressRepeatedLeadIn = true
        break
      }
    }
  }

  if (!hasText || suppressRepeatedLeadIn) {
    return (
      <div className="sana-lead">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
      </div>
    )
  }

  const proseBlock = (text: string) => (
    <div className="sana-prose [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_td]:px-2 [&_td]:py-1 [&_td]:border-t [&_td]:border-ui-line [&_code]:rounded [&_code]:bg-ui-surface-2 [&_code]:px-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )

  // Follow-up suggestion chips: no portrait, just a row of chips.
  if (isSuggest) {
    return (
      <>
        <div className="sana-lead flex flex-wrap gap-1.5 mb-4" style={{ animation: 'sana-fadeup 0.24s ease both' }}>
          {pills.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              className="sana-chip"
              disabled={pillsDisabled}
              onClick={() => onPillClickRef.current?.(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
        {hasToolCalls && (
          <div className="sana-lead">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="flex gap-2.5 items-start mb-4" style={{ animation: 'sana-fadeup 0.24s ease both' }}>
        <SanaPortrait />
        <div className="min-w-0 flex-1">
          <div className="sana-bubble w-fit" dir="auto">{proseBlock(hasPills ? prose : content)}</div>
          {hasPills && (
            <div className="mt-3">
              {label && <p className="text-[13px] font-semibold text-ui-muted mb-1.5">{label}</p>}
              <div className="flex flex-wrap gap-1.5">
                {pills.map((pillText, index) => {
                  const isSelected = selectedPills.has(index)
                  return (
                    <button
                      key={`${index}-${pillText}`}
                      type="button"
                      className="sana-chip"
                      aria-pressed={multiSelect ? isSelected : undefined}
                      style={
                        isSelected
                          ? { borderColor: 'var(--ui-brand)', background: 'var(--ui-brand-soft)', color: 'var(--ui-brand-text)' }
                          : undefined
                      }
                      disabled={pillsDisabled}
                      onClick={() => {
                        if (multiSelect) {
                          setSelectedPills((prev) => {
                            const next = new Set(prev)
                            if (next.has(index)) next.delete(index)
                            else next.add(index)
                            return next
                          })
                        } else {
                          onPillClickRef.current?.(pillText)
                        }
                      }}
                    >
                      {pillText}
                    </button>
                  )
                })}
              </div>
              {multiSelect && (
                <button
                  type="button"
                  className="sana-next mt-2.5"
                  disabled={pillsDisabled || selectedPills.size === 0}
                  onClick={() => {
                    const chosen = pills.filter((_, i) => selectedPills.has(i))
                    onPillClickRef.current?.(chosen.join(', '))
                  }}
                >
                  Confirm selection{selectedPills.size > 0 ? ` (${selectedPills.size})` : ''}
                </button>
              )}
            </div>
          )}
          {renderActions && showActions && (
            <div className="sana-reply-actions">{renderActions({ id: thisId!, text: hasPills ? prose : content, isLast: inLatestTurn, question })}</div>
          )}
        </div>
      </div>
      {hasToolCalls && (
        <div className="sana-lead">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <CopilotChatToolCallsView message={message as any} messages={messages ?? []} />
        </div>
      )}
    </>
  )
}

// ── SanaUserMessage ───────────────────────────────────────────────────────────

export function SanaUserMessage({ message }: CopilotChatUserMessageProps) {
  const text = contentToText(message.content)
  if (isDriverMessage(text)) return null

  return (
    <motion.div
      className="flex justify-end mb-4"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="sana-bubble-user" dir="auto">{text}</div>
    </motion.div>
  )
}

// ── SanaChatInput (glass composer) ────────────────────────────────────────────

export { SanaChatInput } from './SanaChatInput'

// Convenience re-export for callers that want the portrait elsewhere.
export function SanaAvatar({ size = 32 }: { size?: number }): ReactNode {
  return <SanaPortrait size={size} />
}
