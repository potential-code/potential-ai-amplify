'use client'

import { useRef, useCallback, useState, useEffect, type ComponentProps } from 'react'
import { z } from 'zod'
import {
  CopilotChat,
  ToolCallStatus,
  UseAgentUpdate,
  useAgent,
  useAgentContext,
  useCopilotKit,
  useFrontendTool,
} from '@copilotkit/react-core/v2'
import '@copilotkit/react-ui/v2/styles.css'
import './copilot.css'
import '@/components/learning-ui/sana-studio.css'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Check,
  ImageIcon,
  ListChecks,
  MessageSquarePlus,
  PanelRight,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { COPILOT_AGENT } from './copilotConfig'
import { chatPlaceholderRef } from '@/components/dashboard/chat-components'
import { makeUuid } from './useStreamingVoice'
import { SanaAssistantMessage, SanaUserMessage } from '@/components/learning-ui/SanaMessages'
import { SanaChatInput } from '@/components/learning-ui/SanaChatInput'
import { useSanaRunError, SanaConnectionNotice } from '@/components/learning-ui/SanaRunError'
import { useJourneyRail } from '@/components/learning-ui/useJourneyRail'
import { btn } from '@/components/kit'
import {
  HeaderIconButton,
  JourneyBody,
  JourneyCanvas,
  JourneyHeader,
  JourneyIntro,
  JourneyPanel,
  LearnerLine,
  MilestoneStrip,
  SanaLine,
  leadIndent,
  type PanelItem,
} from '@/components/journeys/JourneyKit'
import {
  CardAction,
  CardTag,
  DoneNote,
  FooterNote,
  GateNote,
  JourneyCard,
  JourneyCardSkeleton,
  ThreadNotice,
} from '@/components/journeys/JourneyCard'
import { FileVideo, ReflectionQuestions, YouTubeVideo, isYouTubeUrl, journeyProse } from '@/components/journeys/JourneyMedia'
import { FollowUpChips } from '@/components/journeys/FollowUpChips'
import { cn } from '@/lib/utils'
import { getUser } from '@/lib/auth'
import { RichContent } from '@/components/lms/RichContent'
import {
  apiCompleteLearningBlock,
  type ActiveLearningPath,
  type LearningPathBlock,
  type LearningPathMilestone,
} from '@/lib/api/lms'
import { apiFetch } from '@/lib/api'
import { RemoveLearningPathDialog } from '@/components/shared/RemoveLearningPathDialog'
import { RegeneratePathDialog } from '@/components/shared/RegeneratePathDialog'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'
import { LEARNING_PATH_PROMPT as LEARNING_INSTRUCTIONS } from "../../../shared/anna/prompts";

// ── Constants ─────────────────────────────────────────────────────────────────



// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  path: ActiveLearningPath
  onPathRefresh: () => void
  /** Rebuilds the path (stored answers + progress + latest catalog). */
  onRegenerate?: () => Promise<void> | void
  threadId?: string
  onResetThread?: () => void
}

// ── Block kind ────────────────────────────────────────────────────────────────

// Unit sections are often titled only by their kind ("Read", "Video"); the tag
// already says that, so such titles are not repeated as a heading.
const GENERIC_BLOCK_TITLE = /^(read|read more|video|image|visual|reflection|question|text|action plan)$/i

function blockKind(type: string) {
  if (type === 'video') return { label: 'Video lesson', icon: PlayCircle }
  if (type === 'image') return { label: 'Visual', icon: ImageIcon }
  if (type === 'question') return { label: 'Reflection', icon: ListChecks }
  return { label: 'Reading', icon: BookOpen }
}

// ── Learning block card ─────────────────────────────────────────────────────────
// Self-contained: renders one block's content, then a "Mark complete" button.
// Gating: video blocks stay locked until the video finishes; question blocks
// until the answers are submitted; text/image are immediately completable.
// On completion it persists progress and asks the assistant to render the NEXT
// block (sequential delivery), or wraps up the milestone if it was the last.

type LearningBlockCardProps = {
  block: LearningPathBlock
  nextBlock: LearningPathBlock | null
  milestone: LearningPathMilestone
  milestoneTitle: string
  onCompleted: () => void
  sendMessage: (text: string) => void
}

function LearningBlockCard({ block, nextBlock, milestone, milestoneTitle, onCompleted, sendMessage }: LearningBlockCardProps) {
  const alreadyDone = block.status === 'completed'
  const [videoEnded, setVideoEnded] = useState(false)
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)

  const isVideo = block.type === 'video' && !!block.videoUrl
  const isYouTube = isVideo && isYouTubeUrl(block.videoUrl)
  const isQuestion = block.type === 'question' && block.questions.length > 0

  const done = alreadyDone || justCompleted

  // Persist completion + advance. `doComplete` skips the gate so it can be
  // triggered directly (e.g. auto-complete the moment a question is answered).
  async function doComplete() {
    if (completing || done) return
    setCompleting(true)
    try {
      await apiCompleteLearningBlock(block.blockId)
      setJustCompleted(true)
      // Sequential delivery: dispatch the advance FIRST, before the path refetch
      // below — onCompleted() triggers a parent setPath that re-renders this tree
      // and updates the agent context, so queuing the advance message first keeps
      // it from getting lost in that churn.
      if (nextBlock) {
        sendMessage(`Display block ${nextBlock.blockId} — "${nextBlock.title}"`)
      } else {
        sendMessage(
          `I just completed the final block of "${milestoneTitle}". Congratulate me in one short sentence, then show my updated learning path.`,
        )
      }
      onCompleted()
    } catch (err) {
      // Surface failures instead of silently stalling (e.g. a 4xx/5xx on
      // completion would otherwise look like "nothing happened" to the user).
      console.warn('[learning-assistant] block completion failed', err)
    } finally {
      setCompleting(false)
    }
  }

  const kind = blockKind(block.type)
  const blocks = orderedBlocks(milestone)
  const position = blocks.findIndex((b) => b.blockId === block.blockId) + 1
  const gated = (isVideo && !videoEnded) || (isQuestion && !questionsSubmitted)

  return (
    <>
      <JourneyCard
        latest={!done}
        tag={<CardTag icon={kind.icon}>{kind.label}</CardTag>}
        meta={position > 0 ? `Block ${position} of ${blocks.length}, ${milestoneTitle}` : milestoneTitle}
        title={block.type === 'question' || GENERIC_BLOCK_TITLE.test(block.title.trim()) ? undefined : block.title}
        why={block.reason ? `Why this block: ${block.reason}` : undefined}
        footer={
          done ? (
            <DoneNote />
          ) : (
            <>
              {isVideo && !videoEnded ? (
                <GateNote>Finish watching to unlock</GateNote>
              ) : isQuestion && !questionsSubmitted ? (
                <GateNote>Submit your answer to continue</GateNote>
              ) : (
                <FooterNote>From your path: {milestoneTitle}</FooterNote>
              )}
              {!isQuestion && (
                <CardAction gated={gated} busy={completing} onClick={() => void doComplete()}>
                  {!completing && <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
                  {completing ? 'Marking complete' : 'Mark complete'}
                </CardAction>
              )}
            </>
          )
        }
      >
        <div className="flex flex-col gap-3">
          {block.type === 'text' && block.body && <RichContent content={block.body} className={journeyProse} />}

          {isVideo &&
            (isYouTube ? (
              <YouTubeVideo url={block.videoUrl!} title={block.title} onEnded={() => setVideoEnded(true)} />
            ) : (
              <FileVideo src={block.videoUrl!} onEnded={() => setVideoEnded(true)} />
            ))}

          {block.type === 'image' && block.imageUrl && (
                        <img src={block.imageUrl} alt={block.title} className="max-w-full rounded-[10px]" />
          )}

          {isQuestion && (
            <>
              {block.body && <RichContent content={block.body} className={journeyProse} />}
              <ReflectionQuestions
                questions={block.questions}
                logTag="learning-assistant"
                onSubmitted={() => {
                  setQuestionsSubmitted(true)
                  // Submitting a question block's answer completes it automatically.
                  void doComplete()
                }}
              />
            </>
          )}

          {/* Fallback for empty non-question blocks */}
          {block.type !== 'question' && !block.body && !block.videoUrl && !block.imageUrl && (
            <p className="text-sm text-ui-muted">No content available for this block.</p>
          )}
        </div>
      </JourneyCard>
      {!done && <FollowUpChips onSend={sendMessage} />}
    </>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Ordered blocks of a milestone. */
function orderedBlocks(m: LearningPathMilestone): LearningPathBlock[] {
  return [...m.blocks].sort((a, b) => a.order - b.order)
}

/** Next block after `blockId` within its milestone, or null if it's the last. */
function nextBlockOf(m: LearningPathMilestone, blockId: string): LearningPathBlock | null {
  const blocks = orderedBlocks(m)
  const idx = blocks.findIndex((b) => b.blockId === blockId)
  if (idx < 0 || idx + 1 >= blocks.length) return null
  return blocks[idx + 1]
}

// Max characters of a single block's content fed to the AI (keeps the
// __current_course__ context from ballooning while preserving the substance).
const MAX_AI_BLOCK_CHARS = 1500

/** Strip HTML tags + collapse whitespace so the AI gets clean prose, not markup. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A block's teaching content as plain text for the AI's course context. */
function blockContentForAi(b: LearningPathBlock): string {
  let raw: string
  if (b.type === 'question') {
    raw = b.questions.map((q) => `Q: ${q.prompt}${q.options?.length ? ` [options: ${q.options.join(', ')}]` : ''}`).join('\n')
  } else if (b.type === 'video') {
    raw = b.transcript ? stripHtml(b.transcript) : stripHtml(b.body ?? '')
  } else {
    raw = stripHtml(b.body ?? '')
  }
  if (!raw) return ''
  return raw.length > MAX_AI_BLOCK_CHARS ? `${raw.slice(0, MAX_AI_BLOCK_CHARS)}…` : raw
}

/** Raw text of a chat message regardless of content shape. */
function messageText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((p: { type?: string; text?: string }) => (p?.type === 'text' ? (p.text ?? '') : ''))
      .join('')
  }
  return ''
}

// User-message renderer for the learning chat. The click/auto-advance prompts we
// send carry block/theme ids the AI needs — but those ids (and the internal
// advance commands) must never be shown to the end user. So: hide the machine
// generated advance/wrap-up prompts entirely, and strip any "(id: …)" from the
// rest before delegating to the shared bubble.
function LearningUserMessage(props: ComponentProps<typeof SanaUserMessage>) {
  const text = messageText(props.message?.content)
  // Machine-generated, not real user utterances — don't render a bubble at all.
  if (/^(Display block |submitBlockQuestion |I just completed the final block|Start milestone |Start learning |Open course page )/i.test(text.trim())) {
    return null
  }
  const cleaned = text.replace(/\s*\(id:\s*[^)]*\)/gi, '').trim()
  if (cleaned === text) return <SanaUserMessage {...props} />
  return <SanaUserMessage {...props} message={{ ...props.message, content: cleaned }} />
}

// ── Journey mapping ─────────────────────────────────────────────────────────────
//
// One derivation feeds the journey panel, the phone strip and the in-chat
// course list. AI Amplify milestones have no locks — everything is open, and
// "current" is the course the learner has open in this session, else the first
// course that isn't finished yet.

function progressOf(m: LearningPathMilestone) {
  const completed = m.blocks.filter((b) => b.status === 'completed').length
  return { completed, total: m.blocks.length, isDone: m.blocks.length > 0 && completed === m.blocks.length }
}

function currentMilestoneId(milestones: LearningPathMilestone[], activeThemeId?: string | null): string | null {
  const activeOk = activeThemeId != null && milestones.some((m) => m.themeId === activeThemeId && !progressOf(m).isDone)
  if (activeOk) return activeThemeId!
  return milestones.find((m) => !progressOf(m).isDone)?.themeId ?? null
}

function buildLearningItems(milestones: LearningPathMilestone[], activeThemeId?: string | null): PanelItem[] {
  const currentId = currentMilestoneId(milestones, activeThemeId)
  return milestones.map((m, i) => {
    const { completed, total, isDone } = progressOf(m)
    const title = m.theme?.title ?? 'Course'
    const state: PanelItem['state'] = isDone ? 'done' : m.themeId === currentId ? 'current' : 'ready'
    const short = title.split(/,| and /)[0]!.trim()
    return {
      id: m.themeId,
      title,
      state,
      status: isDone ? 'Completed' : state === 'current' ? (completed > 0 ? 'In progress' : 'Up next') : undefined,
      detail: state === 'current' ? undefined : completed > 0 && !isDone ? `${completed} of ${total} blocks` : `${total} blocks`,
      progress: state === 'current' && total > 0 ? { value: (completed / total) * 100, label: `Blocks ${completed} of ${total}` } : undefined,
      stripLabel: `${i + 1}. ${short}`,
      stripCount: state === 'current' && completed > 0 ? `${completed} of ${total}` : undefined,
    }
  })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Opening turn (before the conversation starts) ────────────────────────────────

function PathSummaryCard({
  path,
  current,
  onUpdate,
}: {
  path: ActiveLearningPath
  current: LearningPathMilestone | undefined
  onUpdate?: () => void
}) {
  const totalBlocks = path.milestones.reduce((n, m) => n + m.blocks.length, 0)
  const doneBlocks = path.milestones.reduce((n, m) => n + progressOf(m).completed, 0)
  const doneCourses = path.milestones.filter((m) => progressOf(m).isDone).length
  const built = formatDate(path.generatedAt)
  const rows: { label: string; value: string; wide?: boolean }[] = [
    { label: 'Up next', value: current?.theme?.title ?? 'Every course is complete' },
    { label: 'Progress', value: `${doneBlocks} of ${totalBlocks} blocks` },
    { label: 'Courses', value: `${path.milestones.length} courses, ${doneCourses} complete` },
    { label: 'Order', value: 'No locks: open any course, in any order' },
  ]
  if (current?.rationale) rows.push({ label: 'Why this course now', value: current.rationale, wide: true })

  return (
    <article aria-labelledby="lp-summary" className={cn('rounded-[14px] border border-ui-line bg-ui-surface px-4 pb-1.5 pt-4 sm:px-[18px]', leadIndent)}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="lp-summary" className="text-base font-semibold text-ui-text">
            Your path
          </h2>
          <span className="text-[13px] text-ui-muted">
            Built from your questionnaire answers{built ? ` on ${built}` : ''}
          </span>
        </div>
        {onUpdate && (
          <button type="button" onClick={onUpdate} className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-[34px]')}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Update path
          </button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className={cn('flex flex-col gap-0.5 border-t border-ui-line py-2.5', r.wide && 'sm:col-span-2')}>
            <dt className="text-xs text-ui-muted">{r.label}</dt>
            <dd className="m-0 text-sm font-medium text-ui-text">{r.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EmbeddedLearningAssistant({ path, onPathRefresh, onRegenerate, threadId, onResetThread }: Props) {
  const router = useRouter()
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  // New-chat empty state: Anna's opening turn on a fresh thread.
  const [showEmptyState, setShowEmptyState] = useState(true)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showRegenDialog, setShowRegenDialog] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  // The course (milestone) the user is currently taking. Its FULL content is fed
  // to the AI as context so it can ground course-related answers.
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null)

  // Stale closure fix: useFrontendTool freezes render/handler closures on
  // registration, so tools would otherwise read the initial `path` prop forever.
  // Every tool reads pathRef.current at call time to get the live value.
  const pathRef = useRef(path)
  pathRef.current = path

  // SanaChatInput reads its placeholder from this shared ref.
  chatPlaceholderRef.current = 'Ask Anna about your path'
  useEffect(() => () => { chatPlaceholderRef.current = null }, [])

  const { agent } = useAgent({
    agentId: COPILOT_AGENT,
    threadId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  })

  // Keep ref in sync for sendMessage closure stability
  agentRef.current = agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentAny = agent as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = agentAny?.messages ?? []
  const hasConversation = messages.some((m) => m?.role === 'user' || m?.role === 'assistant')

  // Reveal the chat as soon as the thread has any history (e.g. returning to the
  // page mid-conversation — the LangGraph checkpoint reloads its messages).
  useEffect(() => {
    if (hasConversation) setShowEmptyState(false)
  }, [hasConversation])

  // Serialized send — same pattern as EmbeddedDashboardAssistant.
  // CRITICAL: read the LIVE agent from agentRef for BOTH addMessage and runAgent.
  // useFrontendTool registers each tool's render closure ONCE, freezing whatever
  // `sendMessage` (and the agent it closed over) existed on first render — when
  // useAgent still returns a provisional, empty agent. If addMessage targeted
  // that frozen agent while runAgent ran the live one, the new message would land
  // on the wrong agent and the live agent would just regenerate a reply to the
  // PREVIOUS user turn. Using agentRef.current for both keeps them consistent and
  // current, so block-card clicks (Display block …) always advance correctly.
  const runChainRef = useRef<Promise<void>>(Promise.resolve())
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
          console.warn('[learning-assistant] runAgent failed', err)
        }
      })
    },
    [copilotkit],
  )

  // Visible failure state for runs (backend down / network drop) — retry
  // re-runs the agent; the user's message is already in the local thread.
  const [runFailed, setRunFailed] = useSanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent: agentRef.current }).catch(() => setRunFailed(true))
  }, [copilotkit, setRunFailed])

  // Begin a course (milestone): leave the empty state and ask the assistant to
  // open it. Shared by the opening turn, the journey panel and the in-chat list.
  const startCourse = useCallback(
    (themeId: string, title: string) => {
      setShowEmptyState(false)
      setActiveThemeId(themeId)
      sendMessage(`Start milestone "${title}" (id: ${themeId}).`)
    },
    [sendMessage],
  )

  // Reset to a fresh conversation: stop any run, clear visible messages, re-show
  // the opening turn, and mint a new backend thread so checkpoint history
  // doesn't bleed into the new chat.
  const handleResetChat = useCallback(() => {
    try {
      copilotkit.stopAgent?.({ agent: agentRef.current })
    } catch {
      /* no active run */
    }
    try {
      agentAny.setMessages?.([])
    } catch {
      /* older agent shape */
    }
    setShowEmptyState(true)
    onResetThread?.()
  }, [agentAny, copilotkit, onResetThread])

  // Path summary context for the AI
  const pathSummary = path.milestones.map((m) => ({
    themeId: m.themeId,
    title: m.theme?.title ?? 'Milestone',
    description: m.theme?.description,
    order: m.order,
    totalBlocks: m.blocks.length,
    completedBlocks: m.blocks.filter((b) => b.status === 'completed').length,
    blocks: orderedBlocks(m).map((b) => ({
      blockId: b.blockId,
      title: b.title,
      type: b.type,
      status: b.status,
      order: b.order,
    })),
  }))

  // Full content of the course the user is currently taking — fed to the AI so it
  // can answer/guide course-related questions from the actual material (not guess).
  const activeMilestone = activeThemeId
    ? path.milestones.find((m) => m.themeId === activeThemeId)
    : undefined
  const currentCourse = activeMilestone
    ? {
        themeId: activeMilestone.themeId,
        title: activeMilestone.theme?.title ?? 'Course',
        description: activeMilestone.theme?.description ?? '',
        blocks: orderedBlocks(activeMilestone).map((b) => ({
          blockId: b.blockId,
          title: b.title,
          type: b.type,
          status: b.status,
          content: blockContentForAi(b),
        })),
      }
    : null

  useAgentContext({ description: '__system_prompt__', value: LEARNING_INSTRUCTIONS })
  useAgentContext({
    description: '__learning_path__',
    value: JSON.stringify(pathSummary),
  })
  useAgentContext({
    description: '__current_course__',
    value: currentCourse ? JSON.stringify(currentCourse) : 'No course selected yet.',
  })

  // Helper: find a block + its milestone across the path. Accepts an explicit
  // path argument so callers inside frozen tool closures can pass pathRef.current.
  const findBlockWithMilestone = useCallback(
    (blockId: string, livePath: ActiveLearningPath): { block: LearningPathBlock; milestone: LearningPathMilestone } | undefined => {
      for (const m of livePath.milestones) {
        const b = m.blocks.find((bl) => bl.blockId === blockId)
        if (b) return { block: b, milestone: m }
      }
      return undefined
    },
    [],
  )

  // ── Tool 1: showMilestones (clickable → start a course) ─────────────────────

  useFrontendTool({
    name: 'showMilestones',
    description: 'Show the user their learning path milestones overview. Each card is clickable to start that course.',
    parameters: z.object({}),
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const livePath = pathRef.current
      return (
        <JourneyCard
          tag={<CardTag icon={BookOpen}>Your courses</CardTag>}
          meta="Pick one and I'll walk you through it block by block"
        >
          <div className="-mx-2 flex flex-col gap-2 pb-1">
            <JourneyPanel
              title="Your journey"
              count={`${livePath.milestones.length} courses`}
              items={buildLearningItems(livePath.milestones)}
              onSelect={(id) => {
                const m = livePath.milestones.find((ms) => ms.themeId === id)
                if (m) startCourse(m.themeId, m.theme?.title ?? 'Milestone')
              }}
            />
          </div>
        </JourneyCard>
      )
    },
    handler: async () => {
      const livePath = pathRef.current
      const summary = livePath.milestones
        .map((m) => {
          const completed = m.blocks.filter((b) => b.status === 'completed').length
          return `${m.theme?.title ?? 'Milestone'}: ${completed}/${m.blocks.length} blocks complete`
        })
        .join('; ')
      return `Learning path milestones (user taps a card to begin): ${summary}`
    },
  })

  // ── Tool 2: openMilestone (start course → first block, one at a time) ────────

  useFrontendTool({
    name: 'openMilestone',
    description:
      'Start a milestone. Renders ONLY its first not-yet-completed block (one block at a time) — never a list of all blocks.',
    parameters: z.object({ themeId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const livePath = pathRef.current
      const milestone = livePath.milestones.find((m) => m.themeId === args.themeId)
      if (!milestone) return <></>
      const blocks = orderedBlocks(milestone)
      const first = blocks.find((b) => b.status !== 'completed') ?? blocks[0]
      if (!first) {
        return <ThreadNotice>This course has no blocks yet.</ThreadNotice>
      }
      return (
        <LearningBlockCard
          block={first}
          nextBlock={nextBlockOf(milestone, first.blockId)}
          milestone={milestone}
          milestoneTitle={milestone.theme?.title ?? 'this course'}
          onCompleted={onPathRefresh}
          sendMessage={sendMessage}
        />
      )
    },
    handler: async ({ themeId }) => {
      const livePath = pathRef.current
      const milestone = livePath.milestones.find((m) => m.themeId === themeId)
      if (!milestone) return 'Milestone not found.'
      setActiveThemeId(themeId) // feed this course's full content to the AI context
      const blocks = orderedBlocks(milestone)
      const first = blocks.find((b) => b.status !== 'completed') ?? blocks[0]
      return `Started "${milestone.theme?.title ?? themeId}". Showing the first block: "${first?.title ?? 'n/a'}". The block card handles completion and advancing.`
    },
  })

  // ── Tool 3: displayBlock (render one specific block) ─────────────────────────

  useFrontendTool({
    name: 'displayBlock',
    description: 'Render exactly one learning block (content + its own Mark Complete button). Used for sequential advance.',
    parameters: z.object({ blockId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const found = findBlockWithMilestone(args.blockId, pathRef.current)
      if (!found) return <></>
      return (
        <LearningBlockCard
          block={found.block}
          nextBlock={nextBlockOf(found.milestone, found.block.blockId)}
          milestone={found.milestone}
          milestoneTitle={found.milestone.theme?.title ?? 'this course'}
          onCompleted={onPathRefresh}
          sendMessage={sendMessage}
        />
      )
    },
    handler: async ({ blockId }) => {
      const found = findBlockWithMilestone(blockId, pathRef.current)
      if (!found) return 'Block not found.'
      setActiveThemeId(found.milestone.themeId) // keep course content context aligned
      return `Showing block "${found.block.title}". The card carries its own Mark Complete button.`
    },
  })

  // ── Tool 4: openCoursePage ───────────────────────────────────────────────────

  useFrontendTool({
    name: 'openCoursePage',
    description: 'Navigate to the full course page for a learning block',
    parameters: z.object({
      courseId: z.string(),
      blockId: z.string().optional(),
    }),
    render: () => <></>,
    handler: async ({ courseId, blockId }) => {
      const url = blockId ? `/dashboard/courses/${courseId}#${blockId}` : `/dashboard/courses/${courseId}`
      router.push(url)
      return 'Navigated to course page.'
    },
  })

  // ── Regenerate path (re-personalization) ──────────────────────────────────

  const handleRegenerate = async () => {
    if (!onRegenerate) return
    setRegenLoading(true)
    try {
      await onRegenerate()
      setShowRegenDialog(false)
    } catch (err) {
      console.error(err)
    } finally {
      setRegenLoading(false)
    }
  }

  // ── Delete path ────────────────────────────────────────────────────────────

  const handleDeletePath = async () => {
    setDeleteLoading(true)
    try {
      await apiFetch('/api/lms/learning/path', { method: 'DELETE' })
      setShowDeleteDialog(false)
      onPathRefresh()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const items = buildLearningItems(path.milestones, activeThemeId)
  const doneCount = items.filter((m) => m.state === 'done').length
  const totalBlocks = path.milestones.reduce((n, m) => n + m.blocks.length, 0)
  const doneBlocks = path.milestones.reduce((n, m) => n + progressOf(m).completed, 0)
  const currentId = currentMilestoneId(path.milestones, activeThemeId)
  const current = path.milestones.find((m) => m.themeId === currentId)
  const currentStarted = current ? progressOf(current).completed > 0 : false
  const selectFromJourney = (id: string) => {
    const m = pathRef.current.milestones.find((ms) => ms.themeId === id)
    if (m) startCourse(m.themeId, m.theme?.title ?? 'Milestone')
  }

  const [railOpen, toggleRail] = useJourneyRail()
  const firstName = (getUser()?.fullName ?? '').trim().split(/\s+/)[0]
  const courseCount = path.milestones.length

  return (
    <JourneyCanvas>
      <JourneyHeader
        title="Learning Path"
        subtitle={`${courseCount} milestone${courseCount !== 1 ? 's' : ''}, guided by Anna`}
        progress={{ done: doneCount, total: courseCount }}
        actions={
          onRegenerate && (
            <button
              type="button"
              title="Rebuild the path with your latest progress and the newest content"
              onClick={() => setShowRegenDialog(true)}
              className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 sm:h-9')}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Update path
            </button>
          )
        }
        secondaryActions={
          <>
            <HeaderIconButton label="New chat" onClick={handleResetChat} disabled={!hasConversation}>
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton label="Refresh learning path" onClick={onPathRefresh}>
              <RefreshCw className="h-4 w-4" aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton label="Delete learning path" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton
              label={railOpen ? 'Hide your journey' : 'Show your journey'}
              aria-pressed={railOpen}
              onClick={toggleRail}
              className="hidden xl:inline-flex"
            >
              <PanelRight className="h-4 w-4" aria-hidden />
            </HeaderIconButton>
          </>
        }
      />

      {/* Stale-path nudge: the platform setup was regenerated after this path
          was built, so its themes/blocks come from an outdated catalog. */}
      {path.stale && onRegenerate && (
        <div className="relative z-[2] mx-4 mt-3 flex shrink-0 flex-wrap items-center gap-3 rounded-[10px] border border-ui-line bg-ui-surface px-3.5 py-2.5 sm:mx-6">
          <Sparkles className="h-4 w-4 shrink-0 text-ui-brand-text" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-ui-text">
            The course catalog has been updated since this path was built. Update it to include the latest content;
            your progress is kept.
          </p>
          <button type="button" onClick={() => setShowRegenDialog(true)} className={btn({ variant: 'primary', size: 'sm' })}>
            Update path
          </button>
        </div>
      )}

      <MilestoneStrip items={items} onSelect={selectFromJourney} />

      {runFailed && <SanaConnectionNotice onRetry={retryRun} />}

      <JourneyBody
        panelOpen={railOpen}
        panel={
          <JourneyPanel
            count={`${courseCount} courses`}
            progress={{ value: totalBlocks ? (doneBlocks / totalBlocks) * 100 : 0, label: `${doneBlocks} of ${totalBlocks} blocks` }}
            note="No locks: open any course, in any order."
            items={items}
            onSelect={selectFromJourney}
          />
        }
      >
        <SanaReplyActionsProvider reportSurface="learning-path">
        <CopilotChat
          agentId={COPILOT_AGENT}
          threadId={threadId}
          messageView={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            assistantMessage: SanaAssistantMessage as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userMessage: LearningUserMessage as any,
          }}
          // The composer stays visible under the opening turn, so the learner
          // can type to Anna straight away (matches the COD/Both canvases).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={SanaChatInput as any}
          labels={{
            chatInputPlaceholder: 'Ask Anna about your path',
            welcomeMessageText: "Hi, I'm Anna. Let's walk through your personalised learning path together.",
          }}
        />
        </SanaReplyActionsProvider>

        {/* New-chat opening turn: Anna's welcome, the path summary and one clear continue action */}
        {showEmptyState && (
          <JourneyIntro footer={<div className="h-[112px] shrink-0" aria-hidden />}>
            <SanaLine>
              {firstName ? `Welcome back, ${firstName}. ` : 'Welcome back. '}
              {current
                ? `Your path has ${courseCount} course${courseCount !== 1 ? 's' : ''}, built from your questionnaire. Pick up where you left off, or open any course in your journey.`
                : 'You have finished every course in your path. Update it to get new courses from the latest catalog.'}
            </SanaLine>
            <PathSummaryCard path={path} current={current} onUpdate={onRegenerate ? () => setShowRegenDialog(true) : undefined} />
            {current && (
              <LearnerLine onClick={() => startCourse(current.themeId, current.theme?.title ?? 'Milestone')}>
                {currentStarted ? 'Continue' : 'Start'} {current.theme?.title ?? 'my next course'}
              </LearnerLine>
            )}
          </JourneyIntro>
        )}
      </JourneyBody>

      <RemoveLearningPathDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeletePath}
        loading={deleteLoading}
        includeQuestionnaireNote={true}
      />
      <RegeneratePathDialog
        open={showRegenDialog}
        onClose={() => setShowRegenDialog(false)}
        onConfirm={handleRegenerate}
        loading={regenLoading}
        stale={path.stale}
      />
    </JourneyCanvas>
  )
}
