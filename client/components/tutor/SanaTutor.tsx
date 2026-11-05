'use client'

/**
 * Multi Learning — Anna as the tutor: a conversation that is also the LMS.
 * Ported from VX Academy's multi-interactive learning (Nouf) onto the Anna
 * Studio canvas and the smeepTutor LangGraph agent.
 *
 * Who decides what:
 *   - AI Amplify computes where the learner is (the course state). It is sent to
 *     Anna on every run and drives the course rail, so both show the same
 *     truth.
 *   - Anna decides what to say and which card to open, following that state's
 *     NEXT STEP, and answers questions in between.
 *   - Learner actions (open a course, continue, submit the exam) are recorded
 *     through /api/ai/tutor first; the page then refreshes the state and tells
 *     Anna in a message the learner does not see.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { z } from 'zod'
import '@copilotkit/react-ui/v2/styles.css'
import {
  CopilotChat,
  ToolCallStatus,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useFrontendTool,
  UseAgentUpdate,
} from '@copilotkit/react-core/v2'
import { ExternalLink, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RotateCcw } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import { SanaMenu } from '@/components/learning-ui/SanaMenu'
import { ConfirmModal } from '@/components/learner-grow/ConfirmModal'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import {
  SanaAssistantMessage,
  SanaTypingIndicator,
  SanaUserMessage,
} from '@/components/learning-ui/SanaMessages'
import { chatPlaceholderRef } from '@/components/dashboard/chat-components'
import { FolioSkeleton } from '@/components/learning-ui/FolioCard'
import { useSanaRunError, SanaConnectionNotice } from '@/components/learning-ui/SanaRunError'
import '@/components/learning-ui/sana-studio.css'
import { createTutorApi, type CourseState, type LearnerLanguage, type NextStep, type UnitStep } from './api'
import { TutorContext, useTutor, type TutorSession } from './context'
import { LANGUAGES, directionOf, getTutorStrings } from './strings'
import {
  ActionPlanCard,
  CoursesCard,
  NEXT_MARKER,
  QUIZ_RESULT_MARKER,
  SummaryCard,
  TutorQuizCard,
  UnitIntroCard,
  VideoCard,
} from './TutorCards'
import { CourseRail, CourseStrip } from './CourseRail'
import { TutorChatInput } from './TutorChatInput'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'

const AGENT_ID = 'smeepTutor'
const LEARNER_KEY = '__tutor_learner__'
const COURSE_STATE_KEY = '__tutor_course_state__'
const ON_SCREEN_KEY = '__tutor_on_screen__'

/** Ids of driver messages the learner must never see as chat slips. */
const hiddenIds = new Set<string>()

/** Hidden drivers and marker messages never render as learner slips. */
function TutorUserMessage(props: Parameters<typeof SanaUserMessage>[0]) {
  const m = props.message as { id?: string; content?: unknown } | undefined
  const text = typeof m?.content === 'string' ? m.content : ''
  if (m?.id && hiddenIds.has(m.id)) return null
  if (/^\s*\[(next|quiz-result|action-plan|sys)\]/.test(text)) return null
  return <SanaUserMessage {...props} />
}

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      /* private mode: the course simply isn't remembered */
    }
  },
}

// ── Cards as tool renders ───────────────────────────────────────────────────
//
// A card is "the one in hand" (latest) when it is the session's latestCallId:
// the newest show_* call that matches the course state's NEXT STEP, or simply
// the newest one. A card re-opened for review — the video watched again during
// the exam — is reference, not the step. The newest card keeps its action even
// once its step is recorded, so the learner always has a Continue in front of
// them.

function ShowCoursesRender({ toolCallId }: { toolCallId: string }) {
  const { latestCallId } = useTutor()
  return <CoursesCard latest={toolCallId === latestCallId} />
}

function ShowUnitIntroRender({ unitId, toolCallId }: { unitId: string; toolCallId: string }) {
  const { latestCallId } = useTutor()
  return <UnitIntroCard unitId={unitId} latest={toolCallId === latestCallId} />
}

function ShowVideoRender({ learningBlockId, toolCallId }: { learningBlockId: string; toolCallId: string }) {
  const { latestCallId } = useTutor()
  return <VideoCard learningBlockId={learningBlockId} latest={toolCallId === latestCallId} />
}

function ShowSummaryRender({
  unitId,
  title,
  content,
  keyPoints,
  toolCallId,
}: {
  unitId: string
  title?: string
  content?: string
  keyPoints?: string[]
  toolCallId: string
}) {
  const { latestCallId } = useTutor()
  return (
    <SummaryCard unitId={unitId} title={title} content={content} keyPoints={keyPoints} latest={toolCallId === latestCallId} />
  )
}

function ShowActionPlanRender({ learningBlockId, toolCallId }: { learningBlockId: string; toolCallId: string }) {
  const { latestCallId } = useTutor()
  return <ActionPlanCard learningBlockId={learningBlockId} latest={toolCallId === latestCallId} />
}

function ShowQuizRender({ assessmentId, toolCallId }: { assessmentId: string; toolCallId: string }) {
  const { latestCallId } = useTutor()
  return <TutorQuizCard assessmentId={assessmentId} latest={toolCallId === latestCallId} />
}

// ── Tools Anna can call ────────────────────────────────────────────────────

function TutorTools({ openCourseSilently }: { openCourseSilently: (courseId: string) => Promise<CourseState | null> }) {
  const { api } = useTutor()

  useFrontendTool({
    name: 'show_courses',
    description:
      "Show the learner's enrolled courses as a card. The learner picks a course on the card; you will then receive their choice as a message.",
    parameters: z.object({}),
    followUp: false,
    render: ({ toolCallId }) => <ShowCoursesRender toolCallId={toolCallId} />,
    handler: async () => 'The course list is on screen. Wait for the learner to choose.',
  })

  useFrontendTool({
    name: 'start_course',
    description:
      'Open a course by courseId when the learner asks for one in words. The page docks the course rail and returns the course state.',
    parameters: z.object({ courseId: z.string().describe('A courseId from the course state.') }),
    handler: async ({ courseId }) => {
      const state = await openCourseSilently(String(courseId))
      return state?.active
        ? `Opened course ${courseId}.\n${state.text}`
        : `ERROR: course ${courseId} is not one of the learner's courses. Show the learner's courses instead.`
    },
  })

  useFrontendTool({
    name: 'load_unit',
    description: "Fetch a unit's teaching material (English source text) to summarise it or answer questions about it.",
    parameters: z.object({ unitId: z.string() }),
    handler: async ({ unitId }) => {
      try {
        return JSON.stringify(await api.unitMaterial(String(unitId)))
      } catch {
        return `ERROR: unit ${unitId} could not be loaded. Tell the learner briefly and offer to try again.`
      }
    },
  })

  useFrontendTool({
    name: 'show_unit_intro',
    description: "Show a unit's introduction and learning outcomes. The page supplies the content.",
    parameters: z.object({ unitId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.unitId ? (
        <FolioSkeleton />
      ) : (
        <ShowUnitIntroRender unitId={String(args.unitId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_video',
    description: 'Show a video lesson by learningBlockId. The page supplies the video and its title.',
    parameters: z.object({ learningBlockId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.learningBlockId ? (
        <FolioSkeleton />
      ) : (
        <ShowVideoRender learningBlockId={String(args.learningBlockId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_summary',
    description:
      "Show your summary of a unit, written from its loaded material in the learner's language: a title, two or three short paragraphs of content, and three to five key points.",
    parameters: z.object({
      unitId: z.string(),
      title: z.string(),
      content: z.string(),
      keyPoints: z.array(z.string()),
    }),
    followUp: false,
    render: ({ args, toolCallId }) =>
      !args?.unitId ? (
        <FolioSkeleton />
      ) : (
        <ShowSummaryRender
          unitId={String(args.unitId)}
          title={typeof args.title === 'string' ? args.title : undefined}
          content={typeof args.content === 'string' ? args.content : undefined}
          keyPoints={Array.isArray(args.keyPoints) ? args.keyPoints.map(String) : undefined}
          toolCallId={toolCallId}
        />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_action_plan',
    description:
      "Show a unit's action plan by learningBlockId: the card where the learner writes their own plan against the unit's real prompts. The page supplies the prompts and sends you the saved plan as a message.",
    parameters: z.object({ learningBlockId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.learningBlockId ? (
        <FolioSkeleton />
      ) : (
        <ShowActionPlanRender learningBlockId={String(args.learningBlockId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  useFrontendTool({
    name: 'show_quiz',
    description:
      "Show the course's pre-test or final exam by assessmentId (NEXT STEP says which). The page supplies the questions, grades the answers with AI Amplify, and sends you the result as a message.",
    parameters: z.object({ assessmentId: z.string() }),
    followUp: false,
    render: ({ status, args, toolCallId }) =>
      status === ToolCallStatus.InProgress || !args?.assessmentId ? (
        <FolioSkeleton />
      ) : (
        <ShowQuizRender assessmentId={String(args.assessmentId)} toolCallId={toolCallId} />
      ),
    handler: async () => 'shown',
  })

  return null
}

// ── The session ────────────────────────────────────────────────────────────

function Session({
  firstName,
  userKey,
  lang,
  onLanguageChange,
  standalone,
}: {
  firstName: string
  userKey: string
  lang: LearnerLanguage
  onLanguageChange: (lang: LearnerLanguage) => void
  standalone: boolean
}) {
  const { copilotkit } = useCopilotKit()
  const [threadId] = useState(() => makeUuid())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  const { agent } = useAgent({
    agentId: AGENT_ID,
    threadId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  })
  agentRef.current = agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const running: boolean = Boolean((agent as any)?.isRunning)

  const ui = getTutorStrings(lang)
  const dir = directionOf(lang)
  const api = useMemo(() => createTutorApi(lang), [lang])
  const courseKey = `tutor.activeCourse.${userKey}`

  const [state, setState] = useState<CourseState | null>(null)
  // "Learn with Anna" on a course page links here with ?course=<id>: open that
  // course; otherwise pick up the one the learner had open last time.
  const linkedCourse = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('course') : null
  const activeRef = useRef<string | null>(linkedCourse ?? storage.get(courseKey))
  const introSeen = useRef<Set<string>>(new Set())
  const [onScreen, setOnScreen] = useState('')

  // The course rail can be tucked away for a full-width conversation.
  const [railOpen, setRailOpenState] = useState(() => storage.get('tutor.railOpen') !== '0')
  const toggleRail = useCallback(() => {
    setRailOpenState((open) => {
      storage.set('tutor.railOpen', open ? '0' : null)
      return !open
    })
  }, [])

  const [runFailed, setRunFailed] = useSanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent: agentRef.current }).catch(() => setRunFailed(true))
  }, [copilotkit, setRunFailed])

  // The state Anna sees is committed synchronously (flushSync), so the
  // readable below is registered before the next run starts.
  const refreshFor = useCallback(
    async (courseId: string | null): Promise<CourseState | null> => {
      try {
        const next = await api.state({ courseId, introSeen: [...introSeen.current] })
        flushSync(() => setState(next))
        return next
      } catch {
        return null
      }
    },
    [api],
  )
  const refresh = useCallback(() => refreshFor(activeRef.current), [refreshFor])

  const openCourseSilently = useCallback(
    async (courseId: string) => {
      const next = await refreshFor(courseId)
      if (!next?.active) return null
      activeRef.current = courseId
      storage.set(courseKey, courseId)
      return next
    },
    [courseKey, refreshFor],
  )

  const runChainRef = useRef<Promise<void>>(Promise.resolve())
  const send = useCallback(
    async (text: string, opts?: { hidden?: boolean }) => {
      if (!text.trim()) return
      setRunFailed(false)
      await (runChainRef.current = runChainRef.current.then(async () => {
        const liveAgent = agentRef.current
        try {
          const id = makeUuid()
          if (opts?.hidden) hiddenIds.add(id)
          liveAgent.addMessage({ id, role: 'user', content: text })
          await copilotkit.runAgent({ agent: liveAgent })
        } catch (err) {
          console.warn('[tutor] runAgent failed', err)
        }
      }))
    },
    [copilotkit, setRunFailed],
  )

  const openCourse = useCallback(
    async (courseId: string, name: string) => {
      const next = await openCourseSilently(courseId)
      if (next) await send(ui.openCourseMessage(name))
    },
    [openCourseSilently, send, ui],
  )

  const markIntroSeen = useCallback((unitId: string) => {
    introSeen.current.add(unitId)
  }, [])

  const stepFor = useCallback<TutorSession['stepFor']>(
    (kind, id) => {
      for (const unit of state?.active?.units ?? []) {
        for (const step of unit.steps) {
          if (step.kind !== kind) continue
          const match =
            step.kind === 'video' || step.kind === 'action-plan' ? step.blockId === id : step.unitId === id
          if (match) return { step: step as UnitStep, unitOrder: unit.order, unitName: unit.name }
        }
      }
      return null
    },
    [state],
  )

  // The shared composer reads its placeholder from this module-level ref.
  useEffect(() => {
    chatPlaceholderRef.current = ui.placeholder
    return () => {
      chatPlaceholderRef.current = null
    }
  }, [ui])

  // The "card in hand": the newest show_* call that matches NEXT STEP, else
  // simply the newest. Only this card carries the lesson's action; a card
  // re-opened for review (the video during the exam) stays reference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = (agent as any)?.messages ?? []
  const { latestCallId, latestCardNow } = useMemo(() => {
    const next = state?.next
    // A show_* call as the NextStep it puts on screen (null while streaming).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepOf = (name: string, args: Record<string, any> | null): NextStep | null => {
      if (!args) return null
      switch (name) {
        case 'show_courses':
          return { action: 'show_courses', reason: 'no_active_course' }
        case 'show_unit_intro':
          return args.unitId ? { action: 'show_unit_intro', unitId: String(args.unitId) } : null
        case 'show_video':
          return args.learningBlockId
            ? { action: 'show_video', unitId: '', learningBlockId: String(args.learningBlockId) }
            : null
        case 'show_summary':
          return args.unitId ? { action: 'show_summary', unitId: String(args.unitId) } : null
        case 'show_action_plan':
          return args.learningBlockId
            ? { action: 'show_action_plan', unitId: '', learningBlockId: String(args.learningBlockId) }
            : null
        case 'show_quiz':
          return args.assessmentId ? { action: 'show_quiz', assessmentId: String(args.assessmentId), retake: false } : null
        default:
          return null
      }
    }
    const matchesNext = (card: NextStep | null): boolean => {
      if (!next || !card) return false
      switch (card.action) {
        case 'show_courses':
          return next.action === 'show_courses'
        case 'show_unit_intro':
          return next.action === 'show_unit_intro' && card.unitId === next.unitId
        case 'show_video':
          return next.action === 'show_video' && card.learningBlockId === next.learningBlockId
        case 'show_summary':
          return next.action === 'show_summary' && card.unitId === next.unitId
        case 'show_action_plan':
          return next.action === 'show_action_plan' && card.learningBlockId === next.learningBlockId
        case 'show_quiz':
          return next.action === 'show_quiz' && card.assessmentId === next.assessmentId
      }
    }
    let newest: { id: string; card: NextStep | null } | null = null
    let matching: { id: string; card: NextStep | null } | null = null
    for (const m of messages) {
      if (m.role !== 'assistant') continue
      for (const call of m.toolCalls ?? []) {
        const name: string = call.function?.name ?? ''
        if (!name.startsWith('show_')) continue
        let args: Record<string, unknown> | null = null
        try {
          args = JSON.parse(call.function?.arguments || '{}')
        } catch {
          /* still streaming */
        }
        const card = stepOf(name, args)
        newest = { id: call.id, card }
        if (matchesNext(card)) matching = { id: call.id, card }
      }
    }
    const latest = matching ?? newest
    return { latestCallId: latest?.id ?? null, latestCardNow: latest?.card ?? null }
  }, [messages, state])

  // The rail's NOW marker follows the card in hand: recording-on-display can
  // advance the state's NEXT STEP before the learner presses Continue, and the
  // rail must not point past what is on screen.
  const now: NextStep | null = latestCardNow ?? state?.next ?? null

  // Readables: who the learner is and where they are.
  useAgentContext({ description: LEARNER_KEY, value: JSON.stringify({ language: lang, firstName }) })
  useAgentContext({ description: COURSE_STATE_KEY, value: state?.text ?? 'MISSING' })
  useAgentContext({
    description: ON_SCREEN_KEY,
    value: onScreen ? `${onScreen} It is in the conversation on the learner's screen.` : 'No lesson card is open.',
  })

  // Kick the conversation off exactly once — after the tools above are
  // registered (declaration order) and the runtime is actually connected:
  // anything sent to a placeholder agent before then is silently lost. Polling
  // (not an effect dep) because runtimeConnectionStatus isn't reactive. The
  // latch is set only when the send fires, so StrictMode's throwaway mount
  // doesn't eat it.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    const timer = window.setInterval(() => {
      if (startedRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = copilotkit as any
      if (core.runtimeConnectionStatus !== 'connected' || !core.getAgent(AGENT_ID)) return
      startedRef.current = true
      window.clearInterval(timer)
      void (async () => {
        let latest = await refreshFor(activeRef.current)
        if (activeRef.current && !latest?.active) {
          // The remembered (or linked) course is not one of the learner's courses.
          activeRef.current = null
          storage.set(courseKey, null)
          latest = await refreshFor(null)
        } else if (activeRef.current) {
          storage.set(courseKey, activeRef.current)
        }
        // Drop ?course= so a reload continues wherever the learner has moved on to.
        if (linkedCourse) window.history.replaceState(null, '', window.location.pathname)
        // A learner with no course open starts straight in the featured one.
        const featured = !activeRef.current && latest?.featuredCourseId ? await openCourseSilently(latest.featuredCourseId) : null
        await send(
          featured
            ? "[sys] I've just arrived and my course is open. Greet me by name, then start it."
            : activeRef.current
              ? "[sys] I'm back — let's continue my course. Greet me by name first."
              : "[sys] I've just arrived. Greet me by name and show me where to start.",
          { hidden: true },
        )
      })()
    }, 150)
    return () => window.clearInterval(timer)
  }, [copilotkit, courseKey, linkedCourse, openCourseSilently, refreshFor, send])

  // Start over: clear this course's progress, then reload into a fresh
  // conversation that picks the course up from its first step.
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const resetCourse = useCallback(async () => {
    const courseId = state?.active?.courseId
    if (!courseId) return
    setResetting(true)
    try {
      await api.resetCourse(courseId)
      window.location.reload()
    } catch {
      setResetting(false)
      setConfirmReset(false)
    }
  }, [api, state?.active?.courseId])

  const session: TutorSession = {
    ui,
    lang,
    dir,
    api,
    state,
    running,
    latestCallId,
    now,
    refresh,
    openCourse,
    send,
    markIntroSeen,
    stepFor,
    setOnScreen,
  }

  return (
    <TutorContext.Provider value={session}>
      <TutorTools openCourseSilently={openCourseSilently} />
      <div
        className="sana-studio smeep-copilot sana-studio--wide relative flex flex-col flex-1 min-h-0 overflow-hidden bg-ui-bg"
        lang={lang}
        dir={dir}
      >
        {runFailed && <SanaConnectionNotice onRetry={retryRun} />}

        <header className="relative z-[3] flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-ui-line bg-ui-surface px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 flex-1 basis-[220px] flex-col">
            <h1 className="truncate text-lg font-semibold leading-tight text-ui-text">{ui.pageTitle}</h1>
            <p className="truncate text-[13px] text-ui-muted">{ui.pageSubtitle}</p>
          </div>
          {/* On phones the course picker sits on its own row under the title;
              from sm up the wrapper dissolves into the header row. */}
          <div className="flex min-w-0 items-center gap-2 sm:contents">
            <SanaMenu
              align="start"
              className="min-w-0 max-w-[260px]"
              label={state?.active ? state.active.name : ui.chooseCourse}
              ariaLabel={`${ui.coursesButton}: ${state?.active ? state.active.name : ui.chooseCourse}`}
              disabled={running || !state}
              items={(state?.courses ?? []).map((c) => ({
                key: c.courseId,
                label: c.name,
                hint: c.complete ? ui.complete : c.progress > 0 ? `${c.progress}%` : ui.notStarted,
                selected: c.courseId === state?.active?.courseId,
                onSelect: () => {
                  if (c.courseId !== state?.active?.courseId) void openCourse(c.courseId, c.name)
                },
              }))}
              footer={[
                {
                  key: 'all',
                  label: ui.showAllCourses,
                  onSelect: () => void send('[sys] Show me my courses.', { hidden: true }),
                },
              ]}
            />
          </div>
          <div
            className="order-last flex w-full gap-0.5 overflow-x-auto rounded-[10px] bg-ui-surface-2 p-[3px] sm:order-none sm:w-auto"
            role="group"
            aria-label={ui.language}
          >
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                lang={l.code}
                dir={l.dir}
                aria-pressed={l.code === lang}
                onClick={() => onLanguageChange(l.code)}
                className={
                  'h-8 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-brand sm:flex-none ' +
                  (l.code === lang
                    ? 'bg-ui-surface text-ui-text shadow-[0_1px_2px_rgba(23,23,28,0.08)]'
                    : 'text-ui-muted hover:text-ui-text')
                }
              >
                {l.label}
              </button>
            ))}
          </div>
          {!standalone && (
            <a
              href="/dashboard/multi-learning/app"
              target="_blank"
              rel="noopener"
              aria-label={ui.openAppView}
              title={ui.openAppView}
              className={cn(btn({ variant: 'secondary', size: 'md' }), 'hidden h-9 w-9 px-0 sm:order-1 sm:inline-flex')}
            >
              <ExternalLink className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </a>
          )}
          {state?.active && (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={running}
              aria-label={ui.resetProgress}
              title={ui.resetProgress}
              className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 w-9 px-0 sm:order-1')}
            >
              <RotateCcw className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </button>
          )}
          {state?.active && (
            <button
              type="button"
              onClick={toggleRail}
              aria-pressed={railOpen}
              aria-label={railOpen ? ui.hideRail : ui.showRail}
              title={railOpen ? ui.hideRail : ui.showRail}
              className={cn(
                btn({ variant: 'secondary', size: 'md' }),
                'hidden h-9 w-9 px-0 sm:order-1 lg:inline-flex',
                railOpen && 'bg-ui-surface-2',
              )}
            >
              {dir === 'rtl' ? (
                railOpen ? <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden /> : <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              ) : railOpen ? (
                <PanelRightClose className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              ) : (
                <PanelRightOpen className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              )}
            </button>
          )}
        </header>

        <CourseStrip />

        <div className="relative z-[1] flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 overflow-hidden smeep-assistant-chat">
            <SanaReplyActionsProvider lang={lang} reportSurface="multi-learning">
            <CopilotChat
              agentId={AGENT_ID}
              threadId={threadId}
              messageView={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                assistantMessage: SanaAssistantMessage as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                userMessage: TutorUserMessage as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                cursor: SanaTypingIndicator as any,
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input={TutorChatInput as any}
              labels={{ chatInputPlaceholder: ui.placeholder }}
            />
            </SanaReplyActionsProvider>
          </div>
          {railOpen && <CourseRail />}
        </div>
      </div>
      {confirmReset && (
        <ConfirmModal
          title={ui.resetTitle}
          message={ui.resetBody}
          confirmLabel={ui.resetProgress}
          cancelLabel={ui.cancel}
          busy={resetting}
          onConfirm={() => void resetCourse()}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </TutorContext.Provider>
  )
}

// ── Entry point ────────────────────────────────────────────────────────────

export function SanaTutor({
  firstName,
  userKey,
  lang,
  onLanguageChange,
  standalone = false,
}: {
  firstName: string
  userKey: string
  lang: LearnerLanguage
  onLanguageChange: (lang: LearnerLanguage) => void
  /** The app view: no dashboard around it, so no "open app view" button either. */
  standalone?: boolean
}) {
  return <Session firstName={firstName} userKey={userKey} lang={lang} onLanguageChange={onLanguageChange} standalone={standalone} />
}
