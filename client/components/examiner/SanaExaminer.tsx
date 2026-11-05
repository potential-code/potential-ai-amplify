'use client'

/**
 * AI Amplify's AI Examiner — Anna as a mystery shopper, graded against a chosen
 * course. Ported from the VX Academy examiner (ExaminerExperience) onto the
 * Anna Studio canvas and the smeepExaminer LangGraph agent.
 *
 * Flow: pick an enrolled course and a mode → Anna sets a scene and plays a
 * customer of the learner's own business → three judged questions → she steps
 * out of the role and records a scorecard (record_assessment frontend tool),
 * which this page renders and saves to /api/ai/examiner/attempts.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import '@copilotkit/react-ui/v2/styles.css'
import {
  CopilotChat,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useFrontendTool,
  UseAgentUpdate,
  ToolCallStatus,
} from '@copilotkit/react-core/v2'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, BookOpen, ChevronRight, History, Loader2, MessageCircle, Mic, MicOff, PhoneOff, Video } from 'lucide-react'
import { btn, Chip, EmptyState, PageHeader, ProgressBar, Skeleton } from '@/components/kit'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { makeUuid, useStreamingVoice } from '@/components/dashboard/useStreamingVoice'
import { VoiceDock } from '@/components/dashboard/VoiceDock'
import {
  SanaAssistantMessage,
  SanaTypingIndicator,
  SanaUserMessage,
} from '@/components/learning-ui/SanaMessages'
import { SanaChatInput, SanaComposerOptions } from '@/components/learning-ui/SanaChatInput'
import { FolioInsert, FolioSkeleton } from '@/components/learning-ui/FolioCard'
import { useSanaRunError, SanaConnectionNotice } from '@/components/learning-ui/SanaRunError'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'
import '@/components/learning-ui/sana-studio.css'

const AGENT_ID = 'smeepExaminer'
const START_MARKER = '[start-exam]'
const END_MARKER = '[end-exam]'
const QUESTIONS = 3

export type ExamMode = 'text' | 'voice' | 'video'

// Call discipline, mirrored from the VX examiner:
/** Pieces of one spoken reply are merged when they land within this window. */
const SPEECH_MERGE_MS = 1500
/** The learner is mid-sentence: hold the pending pieces a little longer. */
const SPEECH_HOLD_MS = 4000
/** Voice calls never run past this. */
const MAX_VOICE_CALL_MS = 10 * 60_000
/** Video (avatar) calls are shorter — the Anam plan is metered. */
const MAX_VIDEO_CALL_MS = 6 * 60_000
/** After the scorecard lands, give Anna a moment to close, then hang up. */
const HANG_UP_AFTER_CARD_MS = { voice: 2500, video: 12_000 }

const DIMENSION_LABELS: Record<string, string> = {
  courseKnowledge: 'Course knowledge',
  application: 'Applying it',
  communication: 'Communication',
  problemSolving: 'Problem-solving',
  professionalism: 'Professionalism',
}

// ── Server data shapes ────────────────────────────────────────────────────────

interface ExaminableCourse {
  courseId: string
  title: string
  difficulty: string
  cover: string | null
  progressPercentage: number
}
interface ExamineeProfile {
  firstName: string
  fullName: string
  company: string | null
  country: string | null
  role: string
  /** False until the server has an Anam avatar for Anna: the Video mode is hidden. */
  videoAvailable?: boolean
}
interface CourseReference {
  courseId: string
  title: string
  difficulty: string
  reference: string
}
interface AttemptRow {
  id: string
  courseId: string
  courseTitle: string
  mode: string
  scenario: string
  overallScore: number
  createdAt: string
}

// ── Small bits ────────────────────────────────────────────────────────────────

function bandOf(score: number): { label: string; tone: 'good' | 'warn' } {
  if (score >= 80) return { label: 'Excellent', tone: 'good' }
  if (score >= 60) return { label: 'Good', tone: 'good' }
  return { label: 'Keep practising', tone: 'warn' }
}

/** The page's hidden driver messages must never render as learner slips. */
function ExaminerUserMessage(props: Parameters<typeof SanaUserMessage>[0]) {
  const raw = props.message?.content
  const text = typeof raw === 'string' ? raw : ''
  if (/^\s*\[(start-exam|end-exam|assess-transcript)\]/.test(text)) return null
  return <SanaUserMessage {...props} />
}

// ── Scorecard card (record_assessment render) ────────────────────────────────

interface ScorecardArgs {
  scenario: string
  overallScore: number
  dimensions: Record<string, number>
  strengths: string[]
  improvements: string[]
  feedback: string
}

/**
 * The marked result from the server. The examiner's own scorecard (the
 * record_assessment arguments) only ends the exam: AI Amplify marks the transcript
 * on the server and shows and saves that, so a score can't be made up in the
 * browser. A context, not a prop: CopilotKit registers a tool's render
 * closure once, so a prop captured there would stay at its first value.
 */
type ScorecardResult = { result: ScorecardArgs | null; error: string | null }
const ScorecardResultContext = createContext<ScorecardResult>({ result: null, error: null })

/** What record_assessment renders: marking, then the server's scorecard (or why it failed). */
function MarkedScorecard({ courseTitle }: { courseTitle: string }) {
  const { result, error } = useContext(ScorecardResultContext)
  if (result) return <ScorecardCard args={result} courseTitle={courseTitle} />
  if (error) {
    return (
      <FolioInsert title="Exam result" kind={`Scorecard, ${courseTitle}`} latest>
        <p className="text-[14px] leading-[1.7] text-ui-text" role="alert">{error}</p>
      </FolioInsert>
    )
  }
  return (
    <FolioInsert title="Marking your exam" kind="Anna is scoring your answers against the course" latest={false}>
      <FolioSkeleton />
    </FolioInsert>
  )
}

function ScorecardCard({ args, courseTitle }: { args: ScorecardArgs; courseTitle: string }) {
  const band = bandOf(args.overallScore)
  return (
    <FolioInsert title="Exam result" kind={`Scorecard, ${courseTitle}`} latest>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="text-[40px] font-semibold leading-none tracking-[-0.02em] text-ui-text tabular-nums">
          {args.overallScore}
          <span className="text-base font-medium text-ui-muted">/100</span>
        </div>
        <span
          className="inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-semibold"
          style={
            band.tone === 'good'
              ? { color: 'var(--ui-ok)', background: 'var(--ui-ok-soft)' }
              : { color: 'var(--sana-warn)', background: 'var(--sana-warn-bg)' }
          }
        >
          {band.label}
        </span>
      </div>
      <dl className="mb-4 space-y-2.5">
        {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
          const v = Math.max(0, Math.min(100, args.dimensions?.[key] ?? 0))
          return (
            <div key={key} className="grid grid-cols-[minmax(0,130px)_1fr_32px] items-center gap-3 text-[13px] sm:grid-cols-[160px_1fr_32px]">
              <dt className="truncate text-ui-text">{label}</dt>
              <dd className="contents">
                <ProgressBar value={v} label={label} />
                <span className="text-end font-semibold tabular-nums text-ui-text">{v}</span>
              </dd>
            </div>
          )
        })}
      </dl>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[10px] border border-ui-line bg-ui-surface-2 px-3.5 py-3">
          <p className="mb-1.5 text-[13px] font-semibold text-ui-ok">What you did well</p>
          <ul className="list-disc space-y-1 ps-4">
            {args.strengths?.map((item, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-ui-text">{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-[10px] border border-ui-line bg-ui-surface-2 px-3.5 py-3">
          <p className="mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--sana-warn)' }}>What to work on</p>
          <ul className="list-disc space-y-1 ps-4">
            {args.improvements?.map((item, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-ui-text">{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-[14px] leading-[1.7] text-ui-text">{args.feedback}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ui-ok" role="status">
        <BadgeCheck className="h-4 w-4" aria-hidden /> Saved to your past attempts
      </p>
    </FolioInsert>
  )
}

// ── Video call (Anam avatar) — ported from the VX examiner's AvatarCall ──────

const AVATAR_VIDEO_ID = 'examiner-avatar-video'

function AnamCall({
  clientRef,
  onLive,
  onLearnerSpeech,
  onLearnerTalking,
  examOver,
  thinking,
  onExit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientRef: React.MutableRefObject<any>
  onLive: (live: boolean) => void
  onLearnerSpeech: (text: string) => void
  /** Anam hears the learner talking: hold any pending reply. */
  onLearnerTalking: () => void
  /** The scorecard is shown: end the call once Anna has had time to close. */
  examOver: boolean
  /** Anna is preparing her reply: not the learner's turn yet. */
  thinking: boolean
  /** The call could not start: let the learner leave the dead exam screen. */
  onExit: () => void
}) {
  const [state, setState] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle')
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [personaSpeaking, setPersonaSpeaking] = useState(false)
  const [caption, setCaption] = useState('')
  const heard = useRef(new Set<string>())
  const speechRef = useRef(onLearnerSpeech)
  speechRef.current = onLearnerSpeech
  const talkingRef = useRef(onLearnerTalking)
  talkingRef.current = onLearnerTalking

  const stop = useCallback(() => {
    const client = clientRef.current
    clientRef.current = null
    onLive(false)
    if (client) void client.stopStreaming().catch(() => undefined)
  }, [clientRef, onLive])
  useEffect(() => stop, [stop])

  const live = state === 'live'
  const end = useCallback(() => {
    stop()
    setState('ended')
  }, [stop])

  useEffect(() => {
    if (!live) return
    const cap = window.setTimeout(end, MAX_VIDEO_CALL_MS)
    window.addEventListener('pagehide', end)
    return () => {
      window.clearTimeout(cap)
      window.removeEventListener('pagehide', end)
    }
  }, [live, end])
  useEffect(() => {
    if (!live || !examOver) return
    const t = window.setTimeout(end, HANG_UP_AFTER_CARD_MS.video)
    return () => window.clearTimeout(t)
  }, [live, examOver, end])

  const start = useCallback(async () => {
    setError(null)
    setState('connecting')
    try {
      const { data } = await apiFetch<{ data: { sessionToken: string } }>('/api/ai/anam/session-token', {
        method: 'POST',
      })
      const [{ createClient }, { AnamEvent }] = await Promise.all([
        import('@anam-ai/js-sdk'),
        import('@anam-ai/js-sdk/dist/module/types'),
      ])
      const client = createClient(data.sessionToken)
      clientRef.current = client
      client.addListener(AnamEvent.SESSION_READY, () => {
        setState('live')
        onLive(true)
      })
      client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        clientRef.current = null
        onLive(false)
        setState((s) => (s === 'live' ? 'ended' : 'idle'))
      })
      // Whose turn is it, and what is she hearing as the learner speaks.
      const captionParts = new Map<string, string>()
      client.addListener(
        AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED,
        (e: { id: string; role: string; content: string; endOfSpeech?: boolean; interrupted?: boolean }) => {
          if (e.role === 'persona') {
            setPersonaSpeaking(!e.endOfSpeech && !e.interrupted)
            return
          }
          if (e.content.trim()) talkingRef.current()
          captionParts.set(e.id, (captionParts.get(e.id) ?? '') + e.content)
          setCaption(e.endOfSpeech ? '' : (captionParts.get(e.id) ?? '').trim())
          if (e.endOfSpeech) captionParts.delete(e.id)
        },
      )
      // Anam transcribes the learner; each finished user turn is a reply.
      client.addListener(
        AnamEvent.MESSAGE_HISTORY_UPDATED,
        (history: Array<{ id: string; role: string; content: string }>) => {
          for (const m of history) {
            if (m.role !== 'user' || heard.current.has(m.id)) continue
            heard.current.add(m.id)
            const text = m.content.trim()
            if (text) speechRef.current(text)
          }
        },
      )
      await client.streamToVideoElement(AVATAR_VIDEO_ID)
    } catch (err) {
      console.warn('[examiner] video call failed', err)
      stop()
      const body = err as { error?: { code?: string } } | null
      setError(
        body?.error?.code === 'ANAM_NOT_CONFIGURED'
          ? 'Video isn’t available on this environment yet. Try Text or Voice instead.'
          : 'The video call couldn’t start. Please try again.',
      )
      setState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Starting the exam with Video chosen is the go-ahead: connect now. Deferred
  // a tick so StrictMode's throwaway first mount cancels it — one Anam
  // session, never two.
  useEffect(() => {
    const t = window.setTimeout(() => void start(), 0)
    return () => window.clearTimeout(t)
  }, [start])

  return (
    <div className="relative z-[2] flex-shrink-0 px-4 pt-3">
      <div
        className="relative mx-auto max-w-[776px] overflow-hidden rounded-[14px] border border-ui-line bg-black shadow-ui"
        style={{ aspectRatio: '16/6.5' }}
      >
        <video id={AVATAR_VIDEO_ID} autoPlay playsInline className="h-full w-full object-cover" />
        {state !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <p className="px-6 text-center text-sm font-medium text-white/90">
              {error ?? (state === 'ended' ? 'Call ended' : 'Connecting to Anna…')}
            </p>
            {error && (
              <button
                type="button"
                onClick={onExit}
                className="inline-flex h-9 items-center rounded-[10px] bg-white px-4 text-sm font-semibold text-[#17171C] hover:bg-white/90"
              >
                Back to exam setup
              </button>
            )}
          </div>
        )}
        {live && (
          <>
            <div className="absolute bottom-2.5 left-3 right-16">
              <p className="text-[13px] font-semibold text-white">
                {personaSpeaking ? 'Anna is speaking…' : thinking && !examOver ? 'Anna is thinking…' : muted ? 'Mic muted' : 'Your turn, just speak'}
              </p>
              {caption && !personaSpeaking && <p className="truncate text-xs text-white/80" dir="auto">{caption}</p>}
            </div>
            <div className="absolute bottom-2.5 right-3 flex gap-1.5">
              <button
                type="button"
                aria-label={muted ? 'Unmute' : 'Mute'}
                onClick={() => {
                  const client = clientRef.current
                  if (!client) return
                  try {
                    if (muted) client.unmuteInputAudio()
                    else client.muteInputAudio()
                    setMuted(!muted)
                  } catch {
                    /* noop */
                  }
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
              >
                {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                aria-label="End call"
                onClick={end}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ui-danger text-white hover:opacity-90"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── The exam session (inside the CopilotKit provider) ────────────────────────

interface SessionProps {
  course: CourseReference
  profile: ExamineeProfile
  mode: ExamMode
  threadId: string
  onExit: () => void
  onSaved: () => void
}

function ExamSession({ course, profile, mode, threadId, onExit, onSaved }: SessionProps) {
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  const { agent } = useAgent({
    agentId: AGENT_ID,
    threadId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged, UseAgentUpdate.OnStateChanged],
  })
  agentRef.current = agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentAny = agent as any
  const questionNumber: number =
    typeof agentAny?.state?.questionNumber === 'number' ? agentAny.state.questionNumber : 1
  const [scorecard, setScorecard] = useState<ScorecardResult>({ result: null, error: null })
  const [ended, setEnded] = useState(false)

  // What the agent reads: who it is testing, and its syllabus.
  useAgentContext({
    description: '__examiner_learner__',
    value: JSON.stringify({
      firstName: profile.firstName,
      company: profile.company,
      role: profile.role,
      country: profile.country,
    }),
  })
  useAgentContext({
    description: '__examiner_course__',
    value: JSON.stringify({ title: course.title, difficulty: course.difficulty, reference: course.reference }),
  })

  const runChainRef = useRef<Promise<void>>(Promise.resolve())
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return
      runChainRef.current = runChainRef.current.then(async () => {
        const liveAgent = agentRef.current
        try {
          liveAgent.addMessage({ id: makeUuid(), role: 'user', content: text })
          await copilotkit.runAgent({ agent: liveAgent })
        } catch (err) {
          console.warn('[examiner] runAgent failed', err)
        }
      })
    },
    [copilotkit],
  )

  const [runFailed, setRunFailed] = useSanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent: agentRef.current }).catch(() => setRunFailed(true))
  }, [copilotkit, setRunFailed])

  // ── Calls (voice + video) — orchestration mirrored from the VX examiner ────

  const isRunning: boolean = Boolean(agentAny?.isRunning)

  // Spoken replies arrive in pieces; merge them into one turn, and never send
  // while Anna is still answering (flushed again when her run ends).
  const heardRef = useRef<string[]>([])
  const mergeTimerRef = useRef<number | undefined>(undefined)
  const flushHeard = useCallback(() => {
    mergeTimerRef.current = undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((agentRef.current as any)?.isRunning || !heardRef.current.length) return
    const text = heardRef.current.join(' ')
    heardRef.current = []
    sendMessage(text)
  }, [sendMessage])
  const onLearnerSpeech = useCallback(
    (text: string) => {
      heardRef.current.push(text)
      window.clearTimeout(mergeTimerRef.current)
      mergeTimerRef.current = window.setTimeout(flushHeard, SPEECH_MERGE_MS)
    },
    [flushHeard],
  )
  const onLearnerTalking = useCallback(() => {
    if (!heardRef.current.length) return
    window.clearTimeout(mergeTimerRef.current)
    mergeTimerRef.current = window.setTimeout(flushHeard, SPEECH_HOLD_MS)
  }, [flushHeard])
  useEffect(() => {
    if (isRunning || !heardRef.current.length || mergeTimerRef.current !== undefined) return
    flushHeard()
  }, [isRunning, flushHeard])
  useEffect(() => () => window.clearTimeout(mergeTimerRef.current), [])

  // Voice: AI Amplify's streaming-voice stack (Deepgram STT + Anna TTS + half-duplex)
  // already does what VX's useExamVoice + ElevenLabs path does. It observes the
  // agent and speaks each new reply itself; its finalized utterances go through
  // the same merge as video speech.
  const voice = useStreamingVoice({
    agent,
    submit: onLearnerSpeech,
    onInterrupt: () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(copilotkit as any).stopAgent?.({ agent: agentRef.current })
      } catch {
        /* no active run */
      }
    },
  })
  const { startVoice, stopVoice } = voice
  useEffect(() => {
    if (mode !== 'voice') return
    startVoice()
    const cap = window.setTimeout(stopVoice, MAX_VOICE_CALL_MS)
    return () => {
      window.clearTimeout(cap)
      stopVoice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Video: Anam renders the face and voice; the graph's new lines are spoken
  // with client.talk(). Speak only the newest fresh line, once her run ends,
  // so a closing line and the scorecard never queue up old lines.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const avatarRef = useRef<any>(null)
  const [avatarLive, setAvatarLive] = useState(false)
  const spokenRef = useRef(new Set<string>())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = agentAny?.messages ?? []
  useEffect(() => {
    if (mode !== 'video' || !avatarLive || isRunning) return
    const said = messages.filter(
      (m) => m.role === 'assistant' && !(m.toolCalls?.length > 0) && typeof m.content === 'string' && m.content.trim(),
    )
    const fresh = said.filter((m) => !spokenRef.current.has(m.id))
    said.forEach((m) => spokenRef.current.add(m.id))
    const line = fresh[fresh.length - 1]
    if (!line) return
    void avatarRef.current?.talk(String(line.content).trim()).catch(() => undefined)
  }, [mode, avatarLive, isRunning, messages])

  const callLive = mode === 'video' ? avatarLive : mode === 'voice' ? voice.callStartedAt !== null : true
  const pendingSpeech =
    mode === 'video' &&
    avatarLive &&
    messages.some(
      (m) =>
        m.role === 'assistant' &&
        !(m.toolCalls?.length > 0) &&
        typeof m.content === 'string' &&
        m.content.trim() &&
        !spokenRef.current.has(m.id),
    )

  // ── Frontend tools ──────────────────────────────────────────────────────────

  useFrontendTool({
    name: 'set_scene',
    description: 'Open the scene card for the role-play: a short title and a one-sentence setting.',
    parameters: z.object({ title: z.string(), setting: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <FolioSkeleton />
      return (
        // latest=false: the quiet card — the "stacked sheets" treatment and its
        // extra shadow opened an awkward gap before the customer's first line.
        <FolioInsert title={String(args?.title ?? 'The scene')} kind="The scene" latest={false} className="!mb-1">
          <p className="text-[14px] leading-relaxed text-ui-text">{String(args?.setting ?? '')}</p>
        </FolioInsert>
      )
    },
    handler: async () => 'Scene set. Now speak your opening line as the customer.',
  })

  const courseIdRef = useRef(course.courseId)
  courseIdRef.current = course.courseId
  useFrontendTool({
    name: 'record_assessment',
    description: "The examiner's scorecard at the end of the role-play. The page renders and stores it.",
    parameters: z.object({
      scenario: z.string().describe('A short name for the scenario that was played'),
      overallScore: z.number().int().min(0).max(100),
      dimensions: z.object({
        courseKnowledge: z.number().int().min(0).max(100),
        application: z.number().int().min(0).max(100),
        communication: z.number().int().min(0).max(100),
        problemSolving: z.number().int().min(0).max(100),
        professionalism: z.number().int().min(0).max(100),
      }),
      strengths: z.array(z.string()).min(1).max(6),
      improvements: z.array(z.string()).min(1).max(6),
      feedback: z.string(),
    }),
    followUp: false,
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) {
        // Scoring takes a few seconds — show that the result is on its way.
        return (
          <FolioInsert title="Marking your exam" kind="Anna is scoring your answers against the course" latest={false}>
            <FolioSkeleton />
          </FolioInsert>
        )
      }
      return <MarkedScorecard courseTitle={course.title} />
    },
    handler: async (args) => {
      setEnded(true)
      try {
        const { data } = await apiFetch<{ data: ScorecardArgs }>('/api/ai/examiner/attempts', {
          method: 'POST',
          body: JSON.stringify({
            courseId: courseIdRef.current,
            mode,
            scenario: args.scenario,
            // The exam's thread, not its transcript: AI Amplify's server has the
            // AI service read the transcript from this learner's own thread
            // and mark it, so nothing the page holds can change the result.
            threadId,
          }),
        })
        setScorecard({ result: data, error: null })
        onSaved()
      } catch (err) {
        console.warn('[examiner] marking the attempt failed', err)
        setScorecard({
          result: null,
          error:
            (err as { error?: { message?: string } } | null)?.error?.message ??
            "Your exam couldn't be marked right now. Please try again in a moment.",
        })
      }
      return 'Scorecard recorded.'
    },
  })

  // Kick the exam off exactly once per thread — and, on a call, only once the
  // call is up, so Anna speaks her opening line to someone listening. Declared
  // AFTER the frontend tools above: effects run in declaration order, so the
  // tools are registered with the runtime before the first run — otherwise the
  // graph receives no actions and the model improvises the scene as plain
  // text. The tick is a safety margin for the registration's own async work
  // (setTimeout, not rAF: rAF never fires in a hidden tab).
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current || !callLive) return
    // Latch only when the send actually fires: StrictMode's double-mount
    // clears the first timer in cleanup, and a pre-latched ref would skip
    // the second mount's send entirely.
    const t = setTimeout(() => {
      if (startedRef.current) return
      startedRef.current = true
      sendMessage(`${START_MARKER} Begin the exam.`)
    }, 50)
    return () => clearTimeout(t)
  }, [sendMessage, callLive])

  // Voice: once the scorecard is on screen, give Anna a moment to close and
  // hang up. (Video handles its own hang-up inside AnamCall.)
  useEffect(() => {
    if (mode !== 'voice' || !ended) return
    const t = window.setTimeout(stopVoice, HANG_UP_AFTER_CARD_MS.voice)
    return () => window.clearTimeout(t)
  }, [mode, ended, stopVoice])

  const endExam = useCallback(() => {
    sendMessage(`${END_MARKER} End the exam and assess me.`)
  }, [sendMessage])

  return (
    <div className="sana-studio smeep-copilot sana-studio--wide relative flex flex-col flex-1 min-h-0 overflow-hidden bg-ui-bg">
      {runFailed && <SanaConnectionNotice onRetry={retryRun} />}

      <header className="relative z-[3] flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 sm:py-3.5">
        <button
          type="button"
          onClick={onExit}
          aria-label="Back to exam setup"
          title="Back to exam setup"
          className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 w-9 px-0')}
        >
          <ArrowLeft className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={1.75} aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 basis-[200px] flex-col">
          <h1 className="truncate text-lg font-semibold leading-tight text-ui-text">AI Examiner</h1>
          <p className="truncate text-[13px] text-ui-muted">
            {course.title}, {MODE_LABEL[mode].toLowerCase()} exam
          </p>
        </div>
        <div className="flex items-center gap-2.5" aria-live="polite">
          {!ended && (
            <span className="hidden items-center gap-2 text-[13px] font-medium text-ui-muted sm:inline-flex">
              Question {Math.min(questionNumber, QUESTIONS)} of {QUESTIONS}
              <span className="flex gap-1" aria-hidden>
                {Array.from({ length: QUESTIONS }).map((_, i) => (
                  <span
                    key={i}
                    className={cn('h-1.5 w-5 rounded-full', i < Math.min(questionNumber, QUESTIONS) ? 'bg-ui-brand' : 'bg-ui-surface-2')}
                  />
                ))}
              </span>
            </span>
          )}
          {!ended ? (
            <button type="button" onClick={endExam} className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 px-3.5')}>
              End and get feedback
            </button>
          ) : (
            <button type="button" onClick={onExit} className={cn(btn({ variant: 'primary', size: 'md' }), 'h-9 px-3.5')}>
              Try another scenario
              <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            </button>
          )}
        </div>
      </header>

      {mode === 'video' && (
        <AnamCall
          clientRef={avatarRef}
          onLive={setAvatarLive}
          onLearnerSpeech={onLearnerSpeech}
          onLearnerTalking={onLearnerTalking}
          examOver={ended}
          thinking={isRunning || pendingSpeech}
          onExit={onExit}
        />
      )}
      {mode === 'voice' && voice.voiceOn && (
        <VoiceDock
          state={voice.voiceState}
          callStartedAt={voice.callStartedAt}
          isMuted={voice.isMuted}
          caption={voice.caption}
          agentName="Anna"
          onMute={voice.toggleMute}
          onHangup={voice.stopVoice}
        />
      )}
      <audio ref={voice.audioRef} hidden />

      <ScorecardResultContext.Provider value={scorecard}>
      <SanaComposerOptions.Provider
        value={{
          placeholder: 'Reply as you would at work',
          // Once marked, the exam is over: replies would only confuse the scorecard.
          closed: ended ? 'This exam is over. Use “Try another scenario” to practise again.' : undefined,
        }}
      >
      <div className="relative z-[1] flex-1 overflow-hidden smeep-assistant-chat">
        <SanaReplyActionsProvider reportSurface="examiner">
        <CopilotChat
          agentId={AGENT_ID}
          threadId={threadId}
          messageView={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            assistantMessage: SanaAssistantMessage as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userMessage: ExaminerUserMessage as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cursor: SanaTypingIndicator as any,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={SanaChatInput as any}
          labels={{ chatInputPlaceholder: 'Reply as you would at work' }}
        />
        </SanaReplyActionsProvider>
      </div>
      </SanaComposerOptions.Provider>
      </ScorecardResultContext.Provider>
    </div>
  )
}

// ── Start screen ──────────────────────────────────────────────────────────────

const MODES: Array<{ key: ExamMode; label: string; hint: string; icon: typeof Mic }> = [
  { key: 'text', label: 'Text', hint: 'Type your replies', icon: MessageCircle },
  { key: 'voice', label: 'Voice', hint: 'A live spoken conversation', icon: Mic },
  { key: 'video', label: 'Video', hint: 'Face to face with Anna', icon: Video },
]

const MODE_NOTE: Record<ExamMode, string> = {
  text: 'Three questions, about ten minutes. You can end the exam at any time.',
  voice: 'Voice exams end after 10 minutes. Allow your microphone when asked.',
  video: 'Video exams end after 6 minutes. Allow your camera and microphone when asked.',
}

const HOW_IT_WORKS = [
  { title: 'Anna sets a scene', body: 'She plays a real customer of your business.' },
  { title: 'Three real questions', body: 'You answer as you would at work.' },
  { title: 'Score and feedback', body: 'A score out of 100, marked against the course.' },
]

interface StartProps {
  courses: ExaminableCourse[]
  coursesLoaded: boolean
  attempts: AttemptRow[]
  attemptsLoaded: boolean
  profile: ExamineeProfile | null
  starting: boolean
  startError: string | null
  onStart: (courseId: string, mode: ExamMode) => void
}

const MODE_LABEL: Record<string, string> = { text: 'Text', voice: 'Voice', video: 'Video' }

function StartScreen({ courses, coursesLoaded, attempts, attemptsLoaded, profile, starting, startError, onStart }: StartProps) {
  const [courseId, setCourseId] = useState<string | null>(null)
  const [mode, setMode] = useState<ExamMode>('text')
  useEffect(() => {
    if (!courseId && courses.length > 0) setCourseId(courses[0].courseId)
  }, [courses, courseId])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-ui-bg text-sm text-ui-text">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-[22px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <PageHeader
          className="mb-0"
          title="AI Examiner"
          subtitle={
            <>
              Anna plays a customer of {profile?.company ? <b className="font-semibold text-ui-text">{profile.company}</b> : 'your business'} and puts a
              course to the test: three questions, then a score out of 100 with honest feedback.
            </>
          }
        />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form
            className="flex flex-col gap-[22px] rounded-[14px] border border-ui-line bg-ui-surface p-5 sm:p-[22px]"
            aria-labelledby="ex-setup"
            onSubmit={(e) => {
              e.preventDefault()
              if (courseId) onStart(courseId, mode)
            }}
          >
            <h2 id="ex-setup" className="text-[17px] font-semibold text-ui-text">Set up a practice exam</h2>

            <fieldset className="flex flex-col gap-2.5">
              <legend className="pb-2.5 text-sm font-semibold text-ui-text">Which course should Anna test you on?</legend>
              {!coursesLoaded ? (
                <>
                  <Skeleton className="h-[68px] rounded-[12px]" />
                  <Skeleton className="h-[68px] rounded-[12px]" />
                </>
              ) : courses.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-ui-line">
                  <EmptyState
                    icon={BookOpen}
                    title="No enrolled courses yet"
                    body="Enroll in a course first, then come back and let Anna test you on it."
                    action={
                      <Link href="/dashboard/courses" className={btn({ variant: 'secondary', size: 'md' })}>
                        Browse courses
                      </Link>
                    }
                  />
                </div>
              ) : (
                courses.map((c) => {
                  const sel = c.courseId === courseId
                  const pct = Math.max(0, Math.min(100, Math.round(c.progressPercentage)))
                  return (
                    <label
                      key={c.courseId}
                      className={cn(
                        'grid cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-start gap-3 rounded-[12px] border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ui-brand',
                        sel ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line bg-ui-surface hover:bg-ui-surface-2',
                      )}
                    >
                      <input
                        type="radio"
                        name="exam-course"
                        className="mt-0.5 h-[18px] w-[18px] accent-[var(--color-brand-primary)] focus-visible:outline-none"
                        checked={sel}
                        onChange={() => setCourseId(c.courseId)}
                      />
                      <span className="flex min-w-0 flex-col gap-2">
                        <span className="flex justify-between gap-3">
                          <span className="font-semibold text-ui-text">{c.title}</span>
                          <span className="text-[13px] tabular-nums text-ui-muted">{pct}%</span>
                        </span>
                        <ProgressBar value={pct} label={`${c.title}: ${pct}% studied`} className={sel ? 'bg-ui-surface' : undefined} />
                      </span>
                    </label>
                  )
                })
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2.5">
              <legend className="pb-2.5 text-sm font-semibold text-ui-text">How do you want to take it?</legend>
              <div className={cn('grid gap-2.5', profile?.videoAvailable ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                {MODES.filter((m) => m.key !== 'video' || profile?.videoAvailable).map(({ key, label, hint, icon: Icon }) => {
                  const sel = key === mode
                  return (
                    <label
                      key={key}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-[12px] border p-4 transition-colors sm:flex-col sm:gap-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ui-brand',
                        sel ? 'border-ui-brand bg-ui-brand-soft' : 'border-ui-line bg-ui-surface hover:bg-ui-surface-2',
                      )}
                    >
                      <input
                        type="radio"
                        name="exam-mode"
                        className="sr-only"
                        checked={sel}
                        onChange={() => setMode(key)}
                      />
                      <span
                        className={cn(
                          'inline-flex h-10 w-10 flex-none items-center justify-center rounded-[10px]',
                          sel ? 'bg-ui-brand text-white' : 'bg-ui-surface-2 text-ui-text',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-semibold text-ui-text">{label}</span>
                        <span className="text-[13px] text-ui-muted">{hint}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3.5 border-t border-ui-line pt-[18px]">
              <button
                type="submit"
                className={cn(btn({ variant: 'primary', size: 'lg' }), 'h-11 px-[22px]')}
                disabled={!courseId || starting || courses.length === 0}
              >
                {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {starting ? 'Preparing your exam' : 'Start exam'}
              </button>
              <span className="text-[13px] text-ui-muted">{MODE_NOTE[mode]}</span>
              {startError && (
                <p className="w-full text-[13px] text-ui-danger" role="alert">{startError}</p>
              )}
            </div>
          </form>

          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3.5 rounded-[14px] border border-ui-line bg-ui-surface p-5" aria-labelledby="ex-how">
              <h2 id="ex-how" className="text-base font-semibold text-ui-text">How it works</h2>
              <ol className="flex flex-col gap-3">
                {HOW_IT_WORKS.map((step, i) => (
                  <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3">
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold',
                        i === 0 ? 'bg-ui-brand text-white' : 'bg-ui-surface-2 text-ui-text',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-ui-text">{step.title}</span>
                      <span className="text-[13px] text-ui-muted">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="flex flex-col gap-3 rounded-[14px] border border-ui-line bg-ui-surface p-5" aria-labelledby="ex-scored">
              <h2 id="ex-scored" className="text-base font-semibold text-ui-text">What you&rsquo;re scored on</h2>
              <ul className="flex flex-wrap gap-1.5">
                {Object.values(DIMENSION_LABELS).map((label) => (
                  <li key={label} className="inline-flex h-7 items-center rounded-full bg-ui-surface-2 px-2.5 text-[13px] font-medium text-ui-text">
                    {label}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] leading-relaxed text-ui-muted">
                80 and above is Excellent, 60 and above is Good. Below that, Anna tells you what to practice.
              </p>
            </section>
          </div>
        </div>

        <PastAttempts attempts={attempts} loaded={attemptsLoaded} />
      </div>
    </div>
  )
}

function PastAttempts({ attempts, loaded }: { attempts: AttemptRow[]; loaded: boolean }) {
  if (loaded && attempts.length === 0) {
    return (
      <section className="flex flex-wrap items-center gap-4 rounded-[14px] border border-ui-line bg-ui-surface p-5" aria-labelledby="ex-past">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-ui-surface-2 text-ui-muted">
          <History className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="ex-past" className="text-base font-semibold text-ui-text">Past attempts</h2>
          <p className="text-sm text-ui-muted">No practice exams yet. Your scorecards will be kept here.</p>
        </div>
      </section>
    )
  }
  return (
    <section className="overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface" aria-labelledby="ex-past">
      <div className="flex items-center justify-between gap-3 border-b border-ui-line px-5 py-4">
        <h2 id="ex-past" className="text-base font-semibold text-ui-text">Past attempts</h2>
        {loaded && <span className="text-[13px] text-ui-muted">Your latest {attempts.length}</span>}
      </div>
      {!loaded ? (
        <div className="flex flex-col gap-2 p-5">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <ul>
          {attempts.map((a) => {
            const band = bandOf(a.overallScore)
            return (
              <li
                key={a.id}
                className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t border-ui-line px-5 py-3.5 first:border-t-0 sm:grid-cols-[52px_minmax(0,1fr)_auto_auto]"
              >
                <span className="text-xl font-semibold tabular-nums text-ui-text">
                  {a.overallScore}
                  <span className="text-xs font-medium text-ui-muted">/100</span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-ui-text">{a.courseTitle}</span>
                  <span className="truncate text-[13px] text-ui-muted">
                    {`${MODE_LABEL[a.mode] ?? a.mode} exam`}
                    {a.scenario ? ` · ${a.scenario}` : ''}
                  </span>
                </span>
                <Chip tone={band.tone === 'good' ? 'ok' : 'neutral'} className={band.tone === 'warn' ? 'bg-[var(--sana-warn-bg,#fbefe2)] text-[var(--sana-warn,#87490f)]' : undefined}>
                  {band.label}
                </Chip>
                <span className="hidden text-[13px] tabular-nums text-ui-muted sm:block">
                  {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function SanaExaminer() {
  const [courses, setCourses] = useState<ExaminableCourse[]>([])
  const [coursesLoaded, setCoursesLoaded] = useState(false)
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [attemptsLoaded, setAttemptsLoaded] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ExamineeProfile | null>(null)
  const [starting, setStarting] = useState(false)
  const [session, setSession] = useState<{ course: CourseReference; threadId: string; mode: ExamMode } | null>(null)

  const refreshAttempts = useCallback(() => {
    apiFetch<{ data: AttemptRow[] }>('/api/ai/examiner/attempts?limit=6')
      .then((r) => setAttempts(r.data))
      .catch(() => {})
      .finally(() => setAttemptsLoaded(true))
  }, [])

  useEffect(() => {
    apiFetch<{ data: ExaminableCourse[] }>('/api/ai/examiner/courses')
      .then((r) => setCourses(r.data))
      .catch(() => {})
      .finally(() => setCoursesLoaded(true))
    apiFetch<{ data: ExamineeProfile }>('/api/ai/examiner/profile')
      .then((r) => setProfile(r.data))
      .catch(() => {})
    refreshAttempts()
  }, [refreshAttempts])

  const startExam = useCallback(async (courseId: string, mode: ExamMode) => {
    setStarting(true)
    setStartError(null)
    try {
      const { data } = await apiFetch<{ data: CourseReference }>(`/api/ai/examiner/courses/${courseId}/reference`)
      setSession({ course: data, threadId: makeUuid(), mode })
    } catch (err) {
      console.warn('[examiner] could not prepare the exam', err)
      setStartError('The exam could not be prepared. Please try again.')
    } finally {
      setStarting(false)
    }
  }, [])

  const profileOrDefault = useMemo<ExamineeProfile>(
    () => profile ?? { firstName: 'there', fullName: '', company: null, country: null, role: 'Small business owner' },
    [profile],
  )

  if (session) {
    return (
      <ExamSession
        key={session.threadId}
        course={session.course}
        profile={profileOrDefault}
        mode={session.mode}
        threadId={session.threadId}
        onExit={() => setSession(null)}
        onSaved={refreshAttempts}
      />
    )
  }

  return (
    <StartScreen
      courses={courses}
      coursesLoaded={coursesLoaded}
      attempts={attempts}
      attemptsLoaded={attemptsLoaded}
      profile={profile}
      starting={starting}
      startError={startError}
      onStart={startExam}
    />
  )
}
