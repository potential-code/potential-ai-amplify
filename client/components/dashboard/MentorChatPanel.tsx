'use client'

/**
 * AI Mentor chat on the shared Anna conversation canvas: a header with the
 * mentor's identity, the mentor's turns in bordered bubbles beside their icon
 * tile, the learner's in magenta bubbles, ice-breakers as chips over the
 * composer, and (on wide screens) a rail with the mentor's details, human
 * mentors to book and the other AI mentors. Bot config and the SSE stream come
 * through the AI Amplify server (/api/ai-mentors), behind the learner's session.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react'
import { ASK_DOCUMENT_ACCEPT, readDocument } from './askAnnaDocuments'
import type { SanaSharedDocument } from '@/components/learning-ui/SanaChatInput'
import { cn } from '@/lib/utils'
import { Avatar, btn, Chip, EmptyState } from '@/components/kit'
import { getMentors } from '@/lib/api/sme'
import { aiMentorViewByBotId, aiMentorViews, type AiMentorView } from './aiMentorMeta'
import { SanaReplyButtons, type ReadAloud } from '@/components/learning-ui/SanaReplyActions'
import { useDictation, useReadAloud } from '@/components/tutor/useVoice'
import '@/components/learning-ui/sana-studio.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BotConfig {
  name: string
  greeting: string
  active: boolean
  prePrompt: string[]
}

interface Message {
  id: string
  text: string
  timestamp: Date
  isUser: boolean
  isStreaming?: boolean
  /** The bot's opening line: no reply actions on it. */
  isGreeting?: boolean
  /** A document the learner shared with this message. */
  docName?: string
  /** Follow-up questions the bot offered (its hidden "[Suggestions: a | b]" line). */
  suggestions?: string[]
}

type Attachment =
  | { status: 'reading'; name: string }
  | { status: 'ready'; name: string; doc: SanaSharedDocument }
  | { status: 'error'; name: string; error: string }

interface Props {
  botId: string
  name: string
  specialty: string
  avatar: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function processMarkdown(text: string): string {
  return text
    .replace(/(\d+)\.\s+/g, '\n\n$1. ')
    .replace(/(\d+)\.\s*\n+/g, '$1. ')
    .replace(/([^\d]|^)\.\s+([A-Z])/g, '$1.\n\n$2')
    .replace(/:\s+([A-Z])/g, ':\n\n$1')
    .trim()
}

/** How much of a shared document goes with the message (the server reads up to this much). */
const DOCUMENT_CHARS = 12_000
const DOC_DEFAULT_MESSAGE = 'Please read this document and tell me what stands out.'
const REPLY_FAILED = "Sorry, I couldn't answer that just now. Please try again."

/**
 * The reply without the bot's hidden "[Suggestions: a | b]" line (also while
 * it is still streaming in), and the suggestions it held.
 */
function splitReply(text: string): { text: string; suggestions: string[] } {
  const at = text.search(/\[\s*Suggestions\s*:/i)
  if (at < 0) return { text, suggestions: [] }
  const inside = text.slice(at).match(/\[\s*Suggestions\s*:\s*([^\]]*)\]/i)?.[1] ?? ''
  return {
    text: text.slice(0, at).trimEnd(),
    suggestions: inside.split('|').map((x) => x.trim()).filter((x) => x.length > 1 && x.length < 140).slice(0, 4),
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MentorPortrait({ src, size = 32 }: { src: string; size?: number }) {
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      unoptimized
    />
  )
}

/** The mentor's face in the redesign: their specialty icon on a tinted tile. */
function MentorMark({ view, src, size = 32 }: { view?: AiMentorView; src: string; size?: number }) {
  if (!view) return <MentorPortrait src={src} size={size} />
  const Icon = view.icon
  return (
    <span
      aria-hidden
      className="inline-flex flex-shrink-0 items-center justify-center rounded-[10px]"
      style={{ width: size, height: size, background: view.tile.bg, color: view.tile.fg }}
    >
      <Icon style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }} strokeWidth={1.75} />
    </span>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-1 h-4 pt-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-ui-muted"
          style={{ animation: 'mentorBounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  )
}

/** The mentor's turn: a bordered bubble beside the mentor's tile. */
function MentorTurn({
  view,
  avatarUrl,
  message,
  isLast,
  readAloud,
  reportSurface,
  question,
  onSuggest,
  busy,
}: {
  view?: AiMentorView
  avatarUrl: string
  message: Message
  isLast: boolean
  readAloud: ReadAloud
  reportSurface: string
  /** What the learner asked; none for the greeting, which gets no buttons. */
  question?: string
  onSuggest: (text: string) => void
  busy: boolean
}) {
  return (
    <div className="group flex gap-2.5 items-start mb-4" style={{ animation: 'sana-fadeup 0.24s ease both' }}>
      <MentorMark view={view} src={avatarUrl} />
      <div className="min-w-0 flex-1">
        {message.isStreaming && message.text === '' ? (
          <div className="sana-bubble w-fit !py-[16px]">
            <TypingDots />
          </div>
        ) : (
          <>
            <div className="sana-bubble w-fit space-y-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_ul]:space-y-1 [&_ol]:space-y-1 [&_h1]:text-[15px] [&_h2]:text-[15px] [&_h3]:text-[15px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_strong]:font-semibold" dir="auto">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="my-2 border-s-[3px] border-ui-line ps-3 italic text-ui-muted">{children}</blockquote>
                  ),
                  img: () => null,
                  code: ({ children, className }) => {
                    const isBlock = className?.includes('language-')
                    return isBlock ? (
                      <code className={cn('block overflow-x-auto rounded-lg bg-ui-surface-2 p-2.5 text-xs', className)}>{children}</code>
                    ) : (
                      <code className="rounded bg-ui-surface-2 px-1 py-0.5 text-xs">{children}</code>
                    )
                  },
                }}
              >
                {processMarkdown(message.text)}
              </ReactMarkdown>
            </div>
            {!message.isStreaming && message.text && question !== undefined && (
              <div className="sana-reply-actions">
                <SanaReplyButtons id={message.id} text={message.text} isLast={isLast} readAloud={readAloud} reportSurface={reportSurface} question={question} />
              </div>
            )}
            {isLast && !message.isStreaming && message.suggestions && message.suggestions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Suggested follow-ups">
                {message.suggestions.map((q) => (
                  <button key={q} type="button" className="sana-chip" disabled={busy} onClick={() => onSuggest(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The learner's turn: a magenta bubble, right-aligned. */
function LearnerTurn({ message }: { message: Message }) {
  return (
    <div className="mb-4 flex flex-col items-end gap-1.5" style={{ animation: 'sana-fadeup 0.24s ease both' }}>
      {message.docName && (
        <span className="sana-sent-file">
          <FileText className="h-4 w-4 flex-none" strokeWidth={1.75} aria-hidden />
          <span className="truncate">{message.docName}</span>
        </span>
      )}
      <p className="sana-bubble-user" dir="auto">{message.text}</p>
    </div>
  )
}

/** Wide screens: who this mentor is, people to book, other AI mentors. */
function MentorRail({ view, name, specialty, description }: { view?: AiMentorView; name: string; specialty: string; description?: string }) {
  const { data: humans } = useQuery({ queryKey: ['mentors'], queryFn: getMentors })
  const others = aiMentorViews().filter((m) => m.slug !== view?.slug).slice(0, 3)
  const people = (() => {
    const list = humans ?? []
    const words = specialty.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 3)
    const matching = list.filter((h) => h.expertise?.some((e) => words.some((w) => e.toLowerCase().includes(w))))
    return (matching.length ? matching : list).slice(0, 3)
  })()

  return (
    <aside
      aria-label={`About ${name}`}
      className="hidden w-[300px] flex-none flex-col gap-5 overflow-y-auto border-s border-ui-line bg-ui-surface px-4 py-5 xl:flex"
    >
      <section className="flex flex-col gap-2.5 border-b border-ui-line pb-5">
        {view && <MentorMark view={view} src="" size={48} />}
        <h2 className="text-base font-semibold text-ui-text">{name}</h2>
        {description && <p className="text-sm leading-relaxed text-ui-muted">{description}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Chip>{specialty}</Chip>
          <Chip>Available 24/7</Chip>
        </div>
      </section>
      {people.length > 0 && (
        <section className="flex flex-col gap-2.5 border-b border-ui-line pb-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ui-text">Prefer a person?</h2>
            <p className="mt-0.5 text-[13px] text-ui-muted">Book a free one-on-one session with a business mentor.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {people.map((h) => (
              <li key={h.id} className="flex items-center gap-2.5">
                <Avatar name={h.fullName} src={h.avatarUrl} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-ui-text">{h.fullName}</span>
                  {h.expertise && h.expertise.length > 0 && (
                    <span className="truncate text-xs text-ui-muted">{h.expertise.slice(0, 3).join(', ')}</span>
                  )}
                </span>
                <Link
                  href={`/dashboard/human-mentors?mentor=${encodeURIComponent(h.id)}`}
                  className="rounded-md px-1.5 py-1 text-[13px] font-semibold text-ui-brand-text hover:underline"
                  aria-label={`Book ${h.fullName}`}
                >
                  Book
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h2 className="pb-1.5 text-[15px] font-semibold text-ui-text">Other AI mentors</h2>
        {others.map((m) => (
          <Link
            key={m.slug}
            href={`/dashboard/ai-mentors/${m.slug}`}
            className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-ui-surface-2"
          >
            <MentorMark view={m} src="" size={30} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-ui-text">{m.name}</span>
              <span className="truncate text-xs text-ui-muted">{m.specialty}</span>
            </span>
          </Link>
        ))}
      </section>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MentorChatPanel({ botId, name, specialty, avatar }: Props) {
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [configAttempt, setConfigAttempt] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const readAloud = useReadAloud()

  // A shared document: read on the AI Amplify server once chosen, sent with the next message.
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const readSeq = useRef(0)
  async function pickFile(file: File | undefined) {
    if (!file) return
    const seq = ++readSeq.current
    setAttachment({ status: 'reading', name: file.name })
    try {
      const doc = await readDocument(file)
      if (seq === readSeq.current) setAttachment({ status: 'ready', name: doc.name, doc })
    } catch (e) {
      if (seq === readSeq.current)
        setAttachment({ status: 'error', name: file.name, error: e instanceof Error ? e.message : 'That file could not be read.' })
    }
    textareaRef.current?.focus({ preventScroll: true })
  }
  function removeAttachment() {
    readSeq.current++
    setAttachment(null)
  }

  // Dictation into the composer (browser speech recognition, where supported).
  const dictationBase = useRef('')
  const dictation = useDictation('en', (text, final) => {
    setInputValue(`${dictationBase.current}${dictationBase.current ? ' ' : ''}${text}`)
    if (final) dictationBase.current = ''
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    })
  })

  // Stable session id — generated once
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  const avatarUrl = avatar
  const displayName = botConfig?.name ?? name
  const prePrompts = botConfig?.prePrompt ?? []
  const view = aiMentorViewByBotId(botId)
  // The bot's own ice-breakers when it has them, else starters for its specialty.
  const starters = prePrompts.length > 0 ? prePrompts : (view?.starters ?? [])

  // -------------------------------------------------------------------------
  // Fetch bot config on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function fetchConfig() {
      setIsLoadingConfig(true)
      try {
        const res = await fetch(`/api/ai-mentors/${botId}`, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const config: BotConfig = (await res.json()).data
        if (cancelled) return
        setBotConfig(config)
        if (config.greeting) {
          setMessages([{ id: makeId(), text: config.greeting, timestamp: new Date(), isUser: false, isGreeting: true }])
        }
      } catch {
        // Leave messages empty; the UI will show a fallback
      } finally {
        if (!cancelled) setIsLoadingConfig(false)
      }
    }

    fetchConfig()
    return () => {
      cancelled = true
    }
  }, [botId, configAttempt])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value)
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  // -------------------------------------------------------------------------
  // Send message (SSE streamed through the AI Amplify server)
  // -------------------------------------------------------------------------

  async function sendMessage(text: string) {
    const typed = text.trim()
    const doc = attachment?.status === 'ready' ? attachment.doc : null
    if ((!typed && !doc) || isStreaming || !botConfig || attachment?.status === 'reading') return
    const message = typed || DOC_DEFAULT_MESSAGE

    const userMsg: Message = { id: makeId(), text: message, timestamp: new Date(), isUser: true, docName: doc?.name }
    const botMsgId = makeId()
    const botMsg: Message = { id: botMsgId, text: '', timestamp: new Date(), isUser: false, isStreaming: true }
    const setBot = (patch: Partial<Message>) => setMessages((prev) => prev.map((m) => (m.id === botMsgId ? { ...m, ...patch } : m)))

    setMessages((prev) => [...prev, userMsg, botMsg])
    setInputValue('')
    if (doc) setAttachment(null)
    dictation.stop()
    dictationBase.current = ''
    setHasUserSentMessage(true)
    setIsStreaming(true)
    readAloud.stop()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const abort = new AbortController()
    abortRef.current = abort
    let accumulated = ''
    try {
      const response = await fetch(`/api/ai-mentors/${botId}/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId,
          ...(doc
            ? { document: { name: doc.name, text: doc.text.slice(0, DOCUMENT_CHARS), truncated: doc.truncated || doc.text.length > DOCUMENT_CHARS } }
            : {}),
        }),
        signal: abort.signal,
      })

      if (response.status === 429) {
        setBot({ text: "You're sending messages quickly. Wait a moment and try again.", isStreaming: false })
        return
      }
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue

          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(raw)
          } catch {
            continue
          }

          // The bot's own error text can be technical; the learner gets a plain one.
          if (parsed.type === 'error') {
            setBot({ text: accumulated ? splitReply(accumulated).text : REPLY_FAILED, isStreaming: false })
            return
          }
          // Reasoning and tool activity are not part of the answer.
          if (parsed.type === 'thinking' || parsed.type === 'toolCall' || parsed.type === 'toolResponse') continue

          if (typeof parsed.content === 'string') {
            accumulated += parsed.content
            setBot({ text: splitReply(accumulated).text, isStreaming: true })
          }
        }
      }

      const reply = splitReply(accumulated)
      setBot({ text: reply.text || REPLY_FAILED, suggestions: reply.suggestions, isStreaming: false })
    } catch {
      if (abort.signal.aborted) {
        const partial = splitReply(accumulated).text
        if (partial) setBot({ text: partial, isStreaming: false })
        else setMessages((prev) => prev.filter((m) => m.id !== botMsgId))
      } else {
        setBot({ text: "Sorry, I couldn't connect right now. Please try again.", isStreaming: false })
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null
      setIsStreaming(false)
    }
  }

  function stopReply() {
    abortRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  const docReady = attachment?.status === 'ready'
  const canSend = !isStreaming && (inputValue.trim().length > 0 || docReady) && attachment?.status !== 'reading' && Boolean(botConfig)
  const lastMentorId = [...messages].reverse().find((m) => !m.isUser)?.id

  // -------------------------------------------------------------------------
  // Shell
  // -------------------------------------------------------------------------

  return (
    <div className="sana-studio relative flex flex-col flex-1 min-h-0 overflow-hidden bg-ui-bg">
      <style>{`
        @keyframes mentorBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="mentorBounce"] { animation: none !important; }
        }
      `}</style>

      <header className="relative z-[2] flex flex-shrink-0 items-center gap-3 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 sm:py-3.5">
        <Link
          href="/dashboard/ai-mentors"
          aria-label="All AI mentors"
          title="All AI mentors"
          className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 w-9 px-0')}
        >
          <ArrowLeft className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
        </Link>
        <MentorMark view={view} src={avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight text-ui-text">{view?.name ?? displayName}</h1>
          <p className="truncate text-[13px] text-ui-muted">
            {specialty}
            {view?.description ? `. ${view.description}` : ''}
          </p>
        </div>
        <span className="hidden flex-shrink-0 items-center gap-2 text-[13px] font-semibold text-ui-muted sm:inline-flex" aria-live="polite">
          <span
            className={cn('h-2 w-2 rounded-full', isStreaming ? 'bg-[#d97706]' : 'bg-ui-brand')}
            aria-hidden
          />
          {isStreaming ? 'Thinking' : 'Online, 24/7'}
        </span>
      </header>

      <div className="relative z-[1] flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Thread */}
          <div className="relative flex-1 min-h-0 overflow-y-auto" role="log" aria-live="polite" aria-label="Chat messages">
            <div className="mx-auto px-4 pt-4 pb-4 sm:px-8 sm:pt-7" style={{ maxWidth: 'calc(var(--sana-thread-max, 776px) + 64px)' }}>
              {isLoadingConfig && (
                <div className="flex items-center justify-center gap-3 pt-10" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-ui-brand-text" aria-hidden />
                  <p className="text-sm text-ui-muted">Loading {view?.name ?? name}</p>
                </div>
              )}
              {!isLoadingConfig && botConfig && !botConfig.active && (
                <EmptyState
                  title={`${view?.name ?? displayName} is offline right now`}
                  body="This AI mentor is not available at the moment. Please check back later or try another mentor."
                  action={
                    <Link href="/dashboard/ai-mentors" className={btn({ variant: 'secondary', size: 'md' })}>
                      All AI mentors
                    </Link>
                  }
                />
              )}
              {!isLoadingConfig && !botConfig && messages.length === 0 && (
                <EmptyState
                  title={`${view?.name ?? name} could not be reached`}
                  body="Check your connection and try again."
                  action={
                    <button type="button" onClick={() => setConfigAttempt((n) => n + 1)} className={btn({ variant: 'secondary', size: 'md' })}>
                      Try again
                    </button>
                  }
                />
              )}
              {!isLoadingConfig && (!botConfig || botConfig.active) && messages.length > 0 && (
                <p className="mb-4 text-center text-xs font-semibold text-ui-muted">Today</p>
              )}
              {!isLoadingConfig &&
                (!botConfig || botConfig.active) &&
                messages.map((m, i) =>
                  m.isUser ? (
                    <LearnerTurn key={m.id} message={m} />
                  ) : (
                    <MentorTurn
                      key={m.id}
                      view={view}
                      avatarUrl={avatarUrl}
                      message={m}
                      isLast={m.id === lastMentorId}
                      readAloud={readAloud}
                      reportSurface={`mentor:${view?.slug ?? 'ai-mentor'}`}
                      question={messages.slice(0, i).reverse().find((x) => x.isUser)?.text}
                      onSuggest={sendMessage}
                      busy={isStreaming}
                    />
                  ),
                )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Ice-breakers + composer */}
          {botConfig?.active && !isLoadingConfig && (
            <div className="sana-composer relative z-[2] px-4 pb-4 pt-2 sm:px-8 sm:pb-[18px]">
              <div className="mx-auto" style={{ maxWidth: 'var(--sana-thread-max, 776px)' }}>
                {!hasUserSentMessage && starters.length > 0 && (
                  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2.5 sm:flex-wrap" role="group" aria-label="Suggested questions">
                    {starters.map((prompt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => sendMessage(prompt)}
                        disabled={isStreaming || !botConfig}
                        className="sana-chip shrink-0 whitespace-nowrap"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
                {attachment && (
                  <div className={cn('sana-attachment', attachment.status === 'error' && 'sana-attachment--error')} role="status" aria-live="polite">
                    <span className="sana-attachment-icon" aria-hidden>
                      {attachment.status === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" strokeWidth={1.75} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ui-text">{attachment.name}</span>
                      <span className="block truncate text-xs text-ui-muted">
                        {attachment.status === 'reading'
                          ? 'Reading…'
                          : attachment.status === 'error'
                            ? attachment.error
                            : [
                                'Ready',
                                attachment.doc.pages ? `${attachment.doc.pages} page${attachment.doc.pages === 1 ? '' : 's'}` : null,
                                attachment.doc.truncated || attachment.doc.text.length > DOCUMENT_CHARS ? 'Reads the first part' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                      </span>
                    </span>
                    <button type="button" className="sana-attachment-remove" onClick={removeAttachment} aria-label={`Remove ${attachment.name}`}>
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                )}
                <div
                  className="sana-composer-box"
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
                  }}
                  onDrop={(e) => {
                    if (!e.dataTransfer.files.length) return
                    e.preventDefault()
                    void pickFile(e.dataTransfer.files[0])
                  }}
                >
                  <button
                    type="button"
                    className="sana-icon-btn sana-icon-btn--ghost"
                    onClick={() => fileRef.current?.click()}
                    aria-label={`Share a document with ${view?.name ?? displayName}`}
                    title="Share a document (PDF, Word, TXT, MD, CSV)"
                  >
                    <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ASK_DOCUMENT_ACCEPT}
                    hidden
                    onChange={(e) => {
                      void pickFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={docReady ? `Ask about ${attachment.name}` : 'Ask a question'}
                    rows={1}
                    aria-label={`Message ${view?.name ?? displayName}`}
                    className="flex-1 min-w-0 resize-none bg-transparent outline-none"
                    style={{ fontFamily: 'inherit' }}
                  />
                  {dictation.supported && (
                    <button
                      type="button"
                      className="sana-icon-btn"
                      aria-pressed={dictation.listening}
                      aria-label={dictation.listening ? 'Stop dictation' : 'Dictate'}
                      title={dictation.listening ? 'Stop dictation' : 'Dictate'}
                      onClick={() => {
                        if (dictation.listening) dictation.stop()
                        else {
                          dictationBase.current = inputValue.trim()
                          dictation.start()
                        }
                      }}
                    >
                      <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={isStreaming ? stopReply : () => sendMessage(inputValue)}
                    disabled={!isStreaming && !canSend}
                    aria-label={isStreaming ? 'Stop' : 'Send message'}
                    title={isStreaming ? 'Stop' : 'Send message'}
                    className="sana-icon-btn sana-icon-btn--primary"
                  >
                    {isStreaming ? (
                      <Square className="h-3 w-3" fill="currentColor" aria-hidden />
                    ) : (
                      <Send className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
                    )}
                  </button>
                </div>
                {dictation.blocked && (
                  <p className="mt-1.5 text-center text-xs text-ui-muted" role="status">
                    Microphone access is blocked. Allow it in your browser to dictate.
                  </p>
                )}
                {!dictation.blocked && <p className="mt-2 text-center text-xs text-ui-muted select-none">
                  AI mentors can make mistakes. Always verify important information.
                </p>}
              </div>
            </div>
          )}
        </div>
        <MentorRail view={view} name={view?.name ?? displayName} specialty={specialty} description={view?.description} />
      </div>
    </div>
  )
}
