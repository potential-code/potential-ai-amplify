'use client'

/**
 * The chat inside Anna's course panel: the `smeepCourseHelp` agent on the
 * shared Anna chat (the one AI Insights uses), fed the live page state.
 * Loaded on first open by `CourseSana`.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useAgentContext } from '@copilotkit/react-core/v2'
import { BookOpen, Compass, Lightbulb, MessageCircleQuestion, PanelRight, PictureInPicture2, SquarePen, X } from 'lucide-react'
import { AdminCopilotSession } from '@/components/admin/ai-shared/AdminCopilot'
import { AdminChat, useConversation, type WelcomeScreenProps } from '@/components/admin/ai-shared/AdminChat'
import '@/components/admin/ai-shared/admin-ai.css'
import { SanaAvatar } from '@/components/learning-ui/SanaMessages'
import { getUser } from '@/lib/auth'
import type { LearnerCourseDetail } from '@/lib/api/lms'
import { cn } from '@/lib/utils'
import { buildCourseContext, type SanaStep } from './courseContext'
import { useLiveStep } from './liveStep'
import type { SanaLayout } from './CourseSana'

export const COURSE_HELP_AGENT_ID = 'smeepCourseHelp'
const CONTEXT_KEY = '__course_page__'

export type CourseSanaChatProps = {
  course: LearnerCourseDetail
  step: SanaStep | null
  nextLabel: string | null
  open: boolean
  onClose: () => void
  layout: SanaLayout
}

type Starter = { text: string; icon: typeof BookOpen }

function startersFor(course: LearnerCourseDetail, step: SanaStep | null): Starter[] {
  if (!course.isEnrolled) {
    return [
      { text: 'What will I learn in this course?', icon: BookOpen },
      { text: 'Is this course right for my business?', icon: Compass },
      { text: 'How does this course work?', icon: MessageCircleQuestion },
    ]
  }
  const where = { text: 'Where am I in this course?', icon: Compass }
  if (!step) return [where]
  if (step.kind === 'assessment') {
    return step.assessmentType === 'pre'
      ? [{ text: 'Why is there a pre-test?', icon: MessageCircleQuestion }, where]
      : [
          { text: 'Help me revise the key ideas', icon: Lightbulb },
          { text: 'How does the final exam work?', icon: MessageCircleQuestion },
          where,
        ]
  }
  switch (step.block.type) {
    case 'question':
      return [
        { text: 'Help me think this through', icon: Lightbulb },
        { text: 'Explain the idea behind this', icon: BookOpen },
        where,
      ]
    default:
      return [
        { text: 'Explain this step in simple words', icon: BookOpen },
        { text: 'Give me a real business example', icon: Lightbulb },
        where,
      ]
  }
}

function stepName(course: LearnerCourseDetail, step: SanaStep | null): string | null {
  if (!course.isEnrolled) return null
  if (!step) return null
  if (step.kind === 'assessment') return step.assessmentType === 'pre' ? 'the pre-test' : 'the final exam'
  return `unit ${step.unitNumber}`
}

/** Keeps the agent's view of the page current; renders nothing. */
function CoursePageContext({
  course,
  step,
  nextLabel,
  learnerName,
}: Omit<CourseSanaChatProps, 'open' | 'onClose' | 'layout'> & { learnerName: string | null }) {
  const { exam, simulation } = useLiveStep()
  const value = useMemo(
    () => JSON.stringify(buildCourseContext({ course, step, nextLabel, learnerName, exam, simulation })),
    [course, step, nextLabel, learnerName, exam, simulation],
  )
  useAgentContext({ description: CONTEXT_KEY, value })
  return null
}

function Header({ onClose, layout }: { onClose: () => void; layout: SanaLayout }) {
  const { reset, running, hasMessages } = useConversation(COURSE_HELP_AGENT_ID)
  const iconBtn =
    'inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-text focus-visible:outline-2 focus-visible:outline-ui-brand'
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-ui-line bg-ui-surface py-2 pe-1.5 ps-3.5">
      <span className="relative shrink-0">
        <SanaAvatar size={36} />
        <span aria-hidden className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-ui-surface bg-[#1f9d63]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14.5px] font-semibold tracking-[-0.01em]">Anna</span>
        <span className={cn('truncate text-xs', running ? 'font-medium text-ui-brand-text' : 'text-ui-muted')} aria-live="polite">
          {running ? 'Thinking…' : 'Your course guide'}
        </span>
      </span>
      {hasMessages && (
        <button type="button" onClick={reset} className={iconBtn} aria-label="New chat" title="New chat">
          <SquarePen className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {layout.canDock && (
        <button
          type="button"
          onClick={layout.toggle}
          className={iconBtn}
          aria-label={layout.docked ? 'Float Anna over the page' : 'Dock Anna beside the lesson'}
          title={layout.docked ? 'Float' : 'Dock to the side'}
        >
          {layout.docked ? (
            <PictureInPicture2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          ) : (
            <PanelRight className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          )}
        </button>
      )}
      <button type="button" onClick={onClose} className={iconBtn} aria-label="Close Anna" title="Close">
        <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>
    </header>
  )
}

function makeWelcome(course: LearnerCourseDetail, step: SanaStep | null, learnerName: string | null) {
  const starters = startersFor(course, step)
  const where = stepName(course, step)
  return function CourseSanaWelcome({ input, className }: WelcomeScreenProps) {
    const { send, running } = useConversation(COURSE_HELP_AGENT_ID)
    return (
      <div className={cn('flex h-full min-h-0 flex-1 flex-col', className)}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="ai-welcome">
            <p className="text-[14.5px] font-semibold leading-snug">
              Hi{learnerName ? ` ${learnerName}` : ''}, I&rsquo;m Anna.
            </p>
            <p className="mt-1 text-[13.5px] leading-normal text-ui-muted">
              Ask me anything about {where ? <span className="font-medium text-ui-text">{where}</span> : 'this course'}. I&rsquo;ll
              help you understand it; the answers are yours to find.
            </p>
          </div>
          <ul className="mt-3.5 flex flex-col gap-1.5">
            {starters.map((s, i) => (
              <li key={s.text} className="ai-starter" style={{ animationDelay: `${80 + i * 45}ms` }}>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void send(s.text)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--ui-brand)_28%,transparent)] px-3 py-1.5 text-left text-[13px] font-medium text-ui-brand-text transition-colors hover:bg-ui-brand-soft disabled:opacity-60"
                >
                  <s.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0">{input}</div>
      </div>
    )
  }
}

export default function CourseSanaChat({ open, onClose, layout, ...ctx }: CourseSanaChatProps) {
  // The greeting follows the page ("I can see you're on unit 3…").
  const { course, step } = ctx
  const learnerName = useMemo(() => getUser()?.fullName?.trim().split(/\s+/)[0] || null, [])
  const Welcome = useMemo(() => makeWelcome(course, step, learnerName), [course, step, learnerName])

  // Focus the composer on open, where there's a real keyboard.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !window.matchMedia('(pointer: fine)').matches) return
    const t = window.setTimeout(() => rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }), 60)
    return () => window.clearTimeout(t)
  }, [open])

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <AdminCopilotSession
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-ui-muted" aria-busy="true">
            Connecting to Anna…
          </div>
        }
      >
        <CoursePageContext {...ctx} learnerName={learnerName} />
        <AdminChat
          agentId={COURSE_HELP_AGENT_ID}
          welcomeScreen={Welcome}
          placeholder="Ask Anna about this step"
          reportSurface="course-help"
          header={<Header onClose={onClose} layout={layout} />}
          className="admin-ai course-sana-chat h-full flex-1 bg-ui-surface"
        />
      </AdminCopilotSession>
    </div>
  )
}
