'use client'

import { useRef, useCallback, useState, useEffect, type ReactNode } from 'react'
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
import '@/components/dashboard/copilot.css'
import '@/components/learning-ui/sana-studio.css'
import {
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  GraduationCap,
  ImageIcon,
  ListChecks,
  MessageSquarePlus,
  PanelRight,
  PlayCircle,
  RefreshCw,
  Route,
  Trash2,
} from 'lucide-react'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import {
  chatPlaceholderRef,
} from '@/components/dashboard/chat-components'
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
  PanelNote,
  SanaLine,
  leadIndent,
  type PanelItem,
  type PanelStep,
} from '@/components/journeys/JourneyKit'
import {
  CardAction,
  CardTag,
  DoneNote,
  GateNote,
  JourneyCard,
  JourneyCardSkeleton,
  ThreadNotice,
} from '@/components/journeys/JourneyCard'
import { FileVideo, ReflectionQuestions, YouTubeVideo, isYouTubeUrl, journeyProse } from '@/components/journeys/JourneyMedia'
import { FollowUpChips } from '@/components/journeys/FollowUpChips'
import { AskedForCard, UpNextCard, formatDuration, type ContentRowData } from '@/components/journeys/ContentList'
import { cn } from '@/lib/utils'
import { getUser } from '@/lib/auth'
import { RichContent } from '@/components/lms/RichContent'
import {
  completeBothItem,
  deleteBothPath,
  type BothPathResponse,
  type BothMilestone,
  type BothContentItem,
  saveBothVideoPosition,
} from '@/lib/api/both'
import { BothMilestonePretestCard } from './BothMilestonePretestCard'
import { BothMilestoneQuizCard } from './BothMilestoneQuizCard'
import { RemoveLearningPathDialog } from '@/components/shared/RemoveLearningPathDialog'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'
import { BOTH_DELIVERY_PROMPT as BOTH_DELIVERY_INSTRUCTIONS } from "../../../shared/anna/prompts";



type BothContentItemWithSegment = BothContentItem & {
  startSeconds?: number | null
  endSeconds?: number | null
}

const itemDone = (c: BothContentItem) =>
  (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) === 'completed'

function internalKind(blockType: string | null | undefined) {
  if (blockType === 'video') return { label: 'Video lesson', icon: PlayCircle }
  if (blockType === 'image') return { label: 'Visual', icon: ImageIcon }
  if (blockType === 'question') return { label: 'Reflection', icon: ListChecks }
  return { label: 'Reading', icon: BookOpen }
}

// ── BothContentCard ────────────────────────────────────────────────────────────

function BothContentCard({
  item, position, total, pathId, nextItemId, milestoneId, milestoneTitle, onCompleted, sendMessage,
}: {
  item: BothContentItem
  position: number
  total: number
  pathId: string
  nextItemId: string | null
  milestoneId: string
  milestoneTitle: string
  onCompleted: () => void | Promise<void>
  sendMessage: (text: string) => void
}) {
  const isDone = itemDone(item)

  const [videoEnded, setVideoEnded] = useState(false)
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)

  const done = isDone || justCompleted

  // Determine if this is a video (external youtube or internal video block)
  const isExternalYoutube = item.itemType === 'external' && item.type === 'youtube' && !!item.youtubeVideoId
  const isInternalVideo = item.itemType === 'internal' && item.blockType === 'video' && !!item.videoUrl
  const isInternalYouTube = isInternalVideo && isYouTubeUrl(item.videoUrl)
  const isInternalQuestion = item.itemType === 'internal' && item.blockType === 'question' && (item.questions?.length ?? 0) > 0

  async function doComplete() {
    if (completing || done) return
    setCompleting(true)
    try {
      const itemId = item.itemType === 'internal' ? item.blockId! : item.id
      const videoWatchPct = (isExternalYoutube || isInternalVideo) ? 100 : undefined
      await completeBothItem(itemId, pathId, item.itemType, milestoneId, videoWatchPct)
      setJustCompleted(true)
      // Refresh first: the agent run reads the course-state context, which is stale until this resolves.
      await onCompleted()
      if (nextItemId) {
        sendMessage(`Display content (id: ${nextItemId})`)
      } else {
        sendMessage(`All content done in milestone "${milestoneTitle}" (id: ${milestoneId}). Show the next step.`)
      }
    } catch (err) {
      console.warn('[both-assistant] content completion failed', err)
    } finally {
      setCompleting(false)
    }
  }

  const markComplete = (gated: boolean) => (
    <CardAction gated={gated} busy={completing} onClick={() => void doComplete()}>
      {!completing && <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
      {completing ? 'Marking complete' : 'Mark complete'}
    </CardAction>
  )

  // ── External item rendering ────────────────────────────────────────────────

  if (item.itemType === 'external') {
    const gated = isExternalYoutube && !videoEnded && !done
    const seg = item as BothContentItemWithSegment
    const duration = formatDuration(item.durationSeconds)
    return (
      <>
        <JourneyCard
          latest={!done}
          tag={
            <CardTag icon={item.type === 'youtube' ? PlayCircle : FileText} tone="outline">
              {item.type === 'youtube' ? 'Curated video' : 'Curated article'}
            </CardTag>
          }
          meta={`${duration ? `${duration}, ` : ''}item ${position} of ${total}`}
          title={item.title}
          why={item.rationale ? `Why this: ${item.rationale}` : undefined}
          footer={
            done ? (
              <DoneNote />
            ) : (
              <>
                {gated ? <GateNote>Finish watching to unlock</GateNote> : <span className="flex-1" />}
                {item.type === 'article' && item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(btn({ variant: 'secondary', size: 'md' }), 'h-9 w-full sm:w-auto')}
                  >
                    Read full article
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                {markComplete(gated)}
              </>
            )
          }
        >
          <div className="flex flex-col gap-3">
            {isExternalYoutube && (
              <YouTubeVideo
                url={`https://www.youtube.com/watch?v=${item.youtubeVideoId}`}
                title={item.title}
                onEnded={() => setVideoEnded(true)}
                startSeconds={seg.startSeconds}
                endSeconds={seg.endSeconds}
                resumeAt={item.progress?.videoPositionSec ?? null}
                watchedPct={item.progress?.videoWatchPct ?? null}
                onSavePosition={(positionSec, watchPct) =>
                  void saveBothVideoPosition(item.id, { pathId, itemType: 'external', milestoneId, positionSec, watchPct })
                }
              />
            )}
            {item.type === 'article' && item.articleText && (
              <div className="max-h-[480px] overflow-y-auto rounded-[10px] bg-ui-bg px-3.5 py-3">
                <RichContent content={item.articleText} className={journeyProse} />
              </div>
            )}
            {item.type === 'article' && !item.articleText && item.description && (
              <p className="text-[15px] leading-relaxed text-ui-text">{item.description}</p>
            )}
          </div>
        </JourneyCard>
        {!done && <FollowUpChips onSend={sendMessage} />}
      </>
    )
  }

  // ── Internal block rendering ───────────────────────────────────────────────

  const kind = internalKind(item.blockType)
  const internalGated = (isInternalVideo && !videoEnded) || (isInternalQuestion && !questionsSubmitted)

  return (
    <>
      <JourneyCard
        latest={!done}
        tag={
          <CardTag icon={GraduationCap} tone="solid">
            AI Amplify course block
          </CardTag>
        }
        meta={`${kind.label}, item ${position} of ${total}`}
        title={item.blockType === 'question' ? undefined : item.title}
        why={item.rationale ? `Why this: ${item.rationale}` : undefined}
        footer={
          done ? (
            <DoneNote />
          ) : (
            <>
              {isInternalVideo && !videoEnded ? (
                <GateNote>Finish watching to unlock</GateNote>
              ) : isInternalQuestion && !questionsSubmitted ? (
                <GateNote>Submit your answer to continue</GateNote>
              ) : (
                <span className="flex-1" />
              )}
              {!isInternalQuestion && markComplete(internalGated)}
            </>
          )
        }
      >
        <div className="flex flex-col gap-3">
          {item.blockType === 'text' && item.body && <RichContent content={item.body} className={journeyProse} />}

          {isInternalVideo &&
            (isInternalYouTube ? (
              <YouTubeVideo
                url={item.videoUrl!}
                title={item.title}
                onEnded={() => setVideoEnded(true)}
                resumeAt={item.blockProgress?.videoPositionSec ?? null}
                watchedPct={item.blockProgress?.videoWatchPct ?? null}
                onSavePosition={(positionSec, watchPct) =>
                  void saveBothVideoPosition(item.blockId!, { pathId, itemType: 'internal', milestoneId, positionSec, watchPct })
                }
              />
            ) : (
              <FileVideo src={item.videoUrl!} onEnded={() => setVideoEnded(true)} />
            ))}

          {item.blockType === 'image' && item.imageUrl && (
            <img src={item.imageUrl} alt={item.title} className="max-w-full rounded-[10px]" />
          )}

          {isInternalQuestion && (
            <>
              {item.body && <RichContent content={item.body} className={journeyProse} />}
              <ReflectionQuestions
                questions={item.questions ?? []}
                logTag="both-assistant"
                onSubmitted={() => {
                  setQuestionsSubmitted(true)
                  void doComplete()
                }}
              />
            </>
          )}

          {item.blockType !== 'question' && !item.body && !item.videoUrl && !item.imageUrl && (
            <p className="text-sm text-ui-muted">No content available for this block.</p>
          )}
        </div>
      </JourneyCard>
      {!done && <FollowUpChips onSend={sendMessage} />}
    </>
  )
}

// ── Journey mapping ────────────────────────────────────────────────────────────
//
// One derivation feeds the journey panel, the phone strip and the in-chat
// milestone list.

function currentBothId(milestones: BothMilestone[], activeMilestoneId?: string | null): string | null {
  // "Now" follows the milestone the learner has open in this session; before
  // anything is opened it falls back to the first unlocked, unfinished one.
  const activeOk =
    activeMilestoneId != null &&
    milestones.some((m) => m.milestoneId === activeMilestoneId && m.unlocked && !m.completed)
  return activeOk ? activeMilestoneId! : (milestones.find((m) => m.unlocked && !m.completed)?.milestoneId ?? null)
}

function sourceSplit(items: BothContentItem[]) {
  const smeep = items.filter((c) => c.itemType === 'internal').length
  return { smeep, curated: items.length - smeep }
}

function buildBothItems(
  milestones: BothMilestone[],
  filterByStyle: (items: BothContentItem[]) => BothContentItem[],
  activeMilestoneId?: string | null,
  checkLabel = 'Pre-test',
): PanelItem[] {
  const currentId = currentBothId(milestones, activeMilestoneId)

  return milestones.map((m, i) => {
    let state: PanelItem['state']
    if (m.completed) state = 'done'
    else if (!m.unlocked) state = 'locked'
    else if (m.milestoneId === currentId) state = 'current'
    else state = 'ready'

    const content = filterByStyle(m.content)
    const doneContent = content.filter(itemDone).length
    const allContentDone = content.length > 0 && doneContent === content.length
    const split = sourceSplit(content)

    let steps: PanelStep[] | undefined
    if (state === 'current') {
      steps = []
      if (m.hasPretest) {
        steps.push({ key: 'pretest', label: checkLabel, state: m.pretestCompleted ? 'done' : 'now' })
      }
      steps.push({
        key: 'content',
        label: 'Content',
        value: content.length > 0 ? `${doneContent} of ${content.length}` : undefined,
        state: !m.pretestCompleted && m.hasPretest ? 'todo' : allContentDone ? 'done' : 'now',
      })
      steps.push({
        key: 'quiz',
        label: 'Quiz',
        value: m.quiz?.passed ? 'Passed' : '70% to pass',
        state: m.quiz?.passed ? 'done' : m.quizAvailable ? 'now' : 'todo',
      })
    }

    const status =
      state === 'done'
        ? m.quiz
          ? `Completed, quiz ${m.quiz.score}/${m.quiz.total}`
          : 'Completed'
        : state === 'locked'
          ? m.hasPretest
            ? `Starts with a ${checkLabel.toLowerCase()}`
            : `Locked until milestone ${i} is done`
          : state === 'current'
            ? m.pretestCompleted || doneContent > 0
              ? 'In progress'
              : 'Up next'
            : 'Ready'

    return {
      id: m.milestoneId,
      title: m.title,
      state,
      status,
      detail: content.length > 0 ? `${split.smeep} AI Amplify, ${split.curated} curated` : undefined,
      steps,
      stripLabel: `${i + 1}. ${m.title}`,
      stripCount: state === 'current' && content.length > 0 && m.pretestCompleted ? `${doneContent} of ${content.length}` : undefined,
    }
  })
}

function bothRows(items: BothContentItem[], locked: boolean): ContentRowData[] {
  return items.map((c) => {
    const internal = c.itemType === 'internal'
    const kind: ContentRowData['kind'] = internal
      ? c.blockType === 'video'
        ? 'smeep-video'
        : c.blockType === 'image'
          ? 'smeep-image'
          : c.blockType === 'question'
            ? 'smeep-question'
            : 'smeep-text'
      : c.type === 'youtube'
        ? 'video'
        : 'article'
    const duration = formatDuration(c.durationSeconds)
    const meta = internal
      ? `AI Amplify course block, ${internalKind(c.blockType).label.toLowerCase()}`
      : `Curated ${c.type === 'youtube' ? 'video' : 'article'}${duration ? `, ${duration}` : ''}`
    return {
      id: c.id,
      title: c.title,
      kind,
      meta,
      note: locked ? c.rationale : null,
      done: itemDone(c),
      locked: locked && !itemDone(c),
    }
  })
}

const STYLE_LABEL: Record<string, string> = {
  visual: 'videos',
  reading: 'reading',
  mixed: 'mix of videos and reading',
}
const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  bothPath: BothPathResponse
  onPathRefresh: () => void | Promise<void>
  agentId?: string
  systemPrompt?: string | null
  headerBg?: string
  headerTitle?: string
  headerSubtitle?: (milestoneCount: number) => string
  chatPlaceholder?: string
  welcomeMessage?: string
  emptyStateIconBg?: string
  emptyStateGreeting?: string
  emptyStateNoContentNotice?: string
  /** Per-message assistant avatar in the chat bubbles/typing cursor. Undefined keeps the existing AI Amplify avatar. */
  assistantAvatar?: ReactNode
  /** Rich page title; falls back to `headerTitle`. */
  headerTitleNode?: ReactNode
  /** Element before the title in the header bar. */
  headerLeading?: ReactNode
  /** Extra content under the journey panel. */
  panelFooter?: ReactNode
  /** What the guide says first, before the conversation starts. */
  introLine?: ReactNode
}

export function BothEmbeddedLearningAssistant({
  bothPath,
  onPathRefresh,
  agentId = 'chatbot',
  systemPrompt = BOTH_DELIVERY_INSTRUCTIONS,
  headerTitle = 'Blended Learning',
  headerSubtitle = (count) => `${count} milestone${count !== 1 ? 's' : ''}, AI Amplify courses plus Content on Demand`,
  chatPlaceholder = 'Ask Anna about your path',
  welcomeMessage = "Hi, I'm Anna. Let's walk through your personalised learning path together.",
  emptyStateNoContentNotice = 'No AI Amplify content matched your goals, so this path uses external resources only.',
  assistantAvatar,
  headerTitleNode,
  headerLeading,
  panelFooter,
  introLine,
}: Props) {
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  const [showEmptyState, setShowEmptyState] = useState(true)
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null)
  const pretestJustCompletedRef = useRef<Set<string>>(new Set())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [threadId, setThreadId] = useState<string>(() => makeUuid())

  // Stale closure fix: every tool reads bothPath from this ref so closures
  // always see the latest path (with freshly-loaded content), not a stale
  // snapshot captured at mount.
  const bothPathRef = useRef(bothPath)
  bothPathRef.current = bothPath

  // The chat input reads this module-level ref since custom `input` renderers don't
  // receive `labels.chatInputPlaceholder`.
  chatPlaceholderRef.current = chatPlaceholder
  useEffect(() => () => { chatPlaceholderRef.current = null }, [])

  // Anna speaks in the studio voice: prose answers, hidden driver messages.
  const AssistantMessage = SanaAssistantMessage
  const UserMessage = SanaUserMessage


  const { agent } = useAgent({
    agentId,
    threadId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
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

  // Visible failure state for runs (backend down / network drop) — retry
  // re-runs the agent; the user's message is already in the local thread.
  const [runFailed, setRunFailed] = useSanaRunError(copilotkit, agent)
  const retryRun = useCallback(() => {
    setRunFailed(false)
    void copilotkit.runAgent({ agent: agentRef.current }).catch(() => setRunFailed(true))
  }, [copilotkit, setRunFailed])

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
          console.warn('[both-assistant] runAgent failed', err)
        }
      })
    },
    [copilotkit],
  )

  const startMilestone = useCallback(
    (milestoneId: string, title: string) => {
      const m = bothPathRef.current.milestones.find((ms) => ms.milestoneId === milestoneId)
      setActiveMilestoneId(milestoneId)
      setShowEmptyState(false)
      if (m?.pretestCompleted) {
        sendMessage(`Start learning "${title}" (id: ${milestoneId}).`)
      } else {
        sendMessage(`Start milestone "${title}" (id: ${milestoneId}).`)
      }
    },
    [sendMessage],
  )

  const handleResetChat = useCallback(() => {
    try { copilotkit.stopAgent?.({ agent: agentRef.current }) } catch { /* noop */ }
    try { agentAny.setMessages?.([]) } catch { /* noop */ }
    setThreadId(makeUuid())
    setShowEmptyState(true)
  }, [agentAny, copilotkit])

  // Both path summary context
  const pathSummary = bothPath.milestones.map((m) => ({
    milestoneId: m.milestoneId,
    title: m.title,
    order: m.order,
    unlocked: m.unlocked,
    pretestCompleted: m.pretestCompleted,
    completed: m.completed,
    contentCount: m.content.length,
    completedContent: m.content.filter((c) =>
      (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) === 'completed'
    ).length,
    quizAvailable: m.quizAvailable,
  }))

  const learningStyle = bothPath.path.discoveryProfile?.learningStyle as string | undefined

  const filterByStyle = (items: BothContentItem[]) =>
    items.filter((c) => {
      // Same rule the server uses for what counts towards completion.
      if (c.itemType === 'external') {
        if (learningStyle === 'visual') return c.type === 'youtube'
        if (learningStyle === 'reading') return c.type === 'article'
        return true
      }
      if (c.itemType === 'internal') {
        if (learningStyle === 'visual') return c.blockType === 'video' || c.blockType === 'image'
        if (learningStyle === 'reading') return c.blockType === 'text'
      }
      return true
    })

  const activeMilestone = activeMilestoneId ? bothPath.milestones.find((m) => m.milestoneId === activeMilestoneId) : undefined
  const currentMilestoneContext = activeMilestone
    ? {
        milestoneId: activeMilestone.milestoneId,
        title: activeMilestone.title,
        content: filterByStyle(activeMilestone.content).map((c) => ({
          id: c.id,
          title: c.title,
          itemType: c.itemType,
          type: c.type ?? c.blockType,
          completed: (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) === 'completed',
        })),
      }
    : null

  // Swaps the description (never skips the hook, to keep hook order stable) so a null systemPrompt never registers a competing __system_prompt__.
  useAgentContext({ description: systemPrompt !== null ? '__system_prompt__' : '__system_prompt_disabled__', value: systemPrompt ?? '' })
  useAgentContext({ description: '__both_learning_path__', value: JSON.stringify(pathSummary) })
  useAgentContext({ description: '__current_both_milestone__', value: currentMilestoneContext ? JSON.stringify(currentMilestoneContext) : 'No milestone selected yet.' })

  // ── Tool: showBothMilestones ────────────────────────────────────────────────

  useFrontendTool({
    name: 'showBothMilestones',
    description: 'Show the user their Blended Learning path milestone overview. Each card is clickable to start that milestone.',
    parameters: z.object({}),
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const bp = bothPathRef.current
      return (
        <JourneyCard
          tag={<CardTag icon={Route}>Your milestones</CardTag>}
          meta="Pick one to begin. A quick pre-test comes first."
        >
          <div className="-mx-2 flex flex-col gap-2 pb-1">
            <JourneyPanel
              count={`${bp.milestones.length} milestone${bp.milestones.length !== 1 ? 's' : ''}`}
              items={buildBothItems(bp.milestones, filterByStyle, null, 'Pre-test')}
              onSelect={(id) => {
                const m = bp.milestones.find((ms) => ms.milestoneId === id)
                if (m) startMilestone(m.milestoneId, m.title)
              }}
            />
          </div>
        </JourneyCard>
      )
    },
    handler: async () => {
      const bp = bothPathRef.current
      const summary = bp.milestones.map((m) => `${m.title}: ${m.unlocked ? 'unlocked' : 'locked'}`).join('; ')
      return `Both milestones: ${summary}`
    },
  })

  // ── Tool: openBothMilestone ─────────────────────────────────────────────────

  useFrontendTool({
    name: 'openBothMilestone',
    description: 'Show the pretest knowledge check inline for a milestone. Only call this when pretestCompleted=false.',
    parameters: z.object({ milestoneId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>
      return (
        <>
          <BothMilestonePretestCard
            label={'Pre-test'}
            milestoneId={m.milestoneId}
            milestoneTitle={m.title}
            pathId={bp.path.id}
            onStalePath={onPathRefresh}
            onComplete={async () => {
              pretestJustCompletedRef.current.add(m.milestoneId)
              setShowEmptyState(false)
              await onPathRefresh()
              // One tick so the refreshed path state lands before the agent
              // call. setTimeout, NOT requestAnimationFrame: rAF never fires in
              // a hidden/background tab, which hung this await forever and
              // silently swallowed the "Start learning" send.
              await new Promise<void>((resolve) => { setTimeout(resolve, 32) })
              sendMessage(`Start learning "${m.title}" (id: ${m.milestoneId}).`)
            }}
          />
        </>
      )
    },
    handler: async ({ milestoneId }) => {
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === milestoneId)
      if (!m) return 'Milestone not found.'
      setActiveMilestoneId(milestoneId)
      return `Showing knowledge check for "${m.title}".`
    },
  })

  // ── Tool: openBothMilestoneContent ──────────────────────────────────────────

  useFrontendTool({
    name: 'openBothMilestoneContent',
    description: 'Show learning content or final quiz inline for a milestone. Only call this when pretestCompleted=true.',
    parameters: z.object({ milestoneId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>

      const filteredContent = filterByStyle(m.content)
      const allContentDone = filteredContent.length > 0 && filteredContent.every((c) =>
        (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) === 'completed'
      )
      if (allContentDone && !m.completed) {
        return (
          <BothMilestoneQuizCard
            milestoneId={m.milestoneId}
            milestoneTitle={m.title}
            pathId={bp.path.id}
            onPass={async () => {
              await onPathRefresh()
              sendMessage(`I just passed the quiz for "${m.title}". Congratulate me in one short sentence, then show my updated learning path.`)
            }}
          />
        )
      }

      const first = filteredContent.find((c) =>
        (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) !== 'completed'
      ) ?? filteredContent[0]

      if (!first) {
        return (
          <ThreadNotice>
            Preparing your content.{' '}
            <button type="button" onClick={() => onPathRefresh()} className="font-semibold text-ui-brand-text underline">
              Refresh
            </button>
          </ThreadNotice>
        )
      }
      const firstIdx = filteredContent.indexOf(first)
      const nextItem = filteredContent[firstIdx + 1] ?? null
      return (
        <BothContentCard
          position={firstIdx + 1}
          total={filteredContent.length}
          item={first}
          pathId={bp.path.id}
          nextItemId={nextItem?.id ?? null}
          milestoneId={m.milestoneId}
          milestoneTitle={m.title}
          onCompleted={onPathRefresh}
          sendMessage={sendMessage}
        />
      )
    },
    handler: async ({ milestoneId }) => {
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === milestoneId)
      if (!m) return 'Milestone not found.'
      setActiveMilestoneId(milestoneId)
      const filteredContent = filterByStyle(m.content)
      const allContentDone = filteredContent.length > 0 && filteredContent.every((c) =>
        (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) === 'completed'
      )
      if (allContentDone && !m.completed) {
        return `All content complete. Showing posttest quiz for "${m.title}".`
      }
      const first = filteredContent.find((c) =>
        (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) !== 'completed'
      ) ?? filteredContent[0]
      return `Showing content "${first?.title ?? 'n/a'}" in "${m.title}". The content card is already on screen — your turn is over. Do NOT call any other tool now; output nothing.`
    },
  })

  // ── Tool: displayBothContent ────────────────────────────────────────────────

  useFrontendTool({
    name: 'displayBothContent',
    description: 'Render one specific Both content item (YouTube video, article, or internal learning block).',
    parameters: z.object({ contentId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const bp = bothPathRef.current
      for (const m of bp.milestones) {
        const item = m.content.find((c) => c.id === args.contentId)
        if (item) {
          const itemIdx = m.content.indexOf(item)
          const nextItem = m.content[itemIdx + 1] ?? null
          return (
            <BothContentCard
              position={itemIdx + 1}
              total={m.content.length}
              item={item}
              pathId={bp.path.id}
              nextItemId={nextItem?.id ?? null}
              milestoneId={m.milestoneId}
              milestoneTitle={m.title}
              onCompleted={onPathRefresh}
              sendMessage={sendMessage}
            />
          )
        }
      }
      return <></>
    },
    handler: async ({ contentId }) => {
      const bp = bothPathRef.current
      for (const m of bp.milestones) {
        const item = m.content.find((c) => c.id === contentId)
        if (item) {
          return `Showing "${item.title}" (${item.itemType}). The content card is already on screen — your turn is over. Do NOT call any other tool now; output nothing.`
        }
      }
      return 'Content item not found.'
    },
  })

  // ── Tool: triggerBothQuiz ───────────────────────────────────────────────────

  useFrontendTool({
    name: 'triggerBothQuiz',
    description: 'Show the posttest quiz inline for a milestone after all content is complete.',
    parameters: z.object({ milestoneId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>
      if (!m.quizAvailable && !m.completed) {
        return (
          <ThreadNotice>Finish the remaining items in &ldquo;{m.title}&rdquo; before the quiz unlocks.</ThreadNotice>
        )
      }
      return (
        <BothMilestoneQuizCard
          milestoneId={m.milestoneId}
          milestoneTitle={m.title}
          pathId={bp.path.id}
          onPass={async () => {
            await onPathRefresh()
            sendMessage(`I just passed the quiz for "${m.title}". Congratulate me in one short sentence, then show my updated learning path.`)
          }}
        />
      )
    },
    handler: async ({ milestoneId }) => {
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === milestoneId)
      if (!m) return 'Milestone not found.'
      if (!m.quizAvailable && !m.completed) {
        return `The quiz for "${m.title}" is not available yet — finish the remaining content first.`
      }
      return `Showing posttest quiz inline for "${m.title}".`
    },
  })

  // ── Delete path ────────────────────────────────────────────────────────────

  const handleDeletePath = async () => {
    setDeleteLoading(true)
    try {
      await deleteBothPath()
      setShowDeleteDialog(false)
      onPathRefresh()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const noInternalContent = bothPath.path.internalBlockCount === 0

  const items = buildBothItems(bothPath.milestones, filterByStyle, activeMilestoneId, 'Pre-test')
  const doneCount = items.filter((m) => m.state === 'done').length
  const milestoneCount = bothPath.milestones.length
  const allItems = bothPath.milestones.flatMap((m) => filterByStyle(m.content))
  const allDone = allItems.filter(itemDone).length
  const split = sourceSplit(allItems)
  const selectFromJourney = useCallback(
    (id: string) => {
      const m = bothPathRef.current.milestones.find((ms) => ms.milestoneId === id)
      if (m) startMilestone(m.milestoneId, m.title)
    },
    [startMilestone],
  )

  const [railOpen, toggleRail] = useJourneyRail()
  const firstName = (getUser()?.fullName ?? '').trim().split(/\s+/)[0]
  const profile = bothPath.path.discoveryProfile
  const currentId = currentBothId(bothPath.milestones, activeMilestoneId)
  const current = bothPath.milestones.find((m) => m.milestoneId === currentId)
  const currentIndex = current ? bothPath.milestones.indexOf(current) : -1
  const currentContent = current ? filterByStyle(current.content) : []
  const currentDone = currentContent.filter(itemDone).length
  const needsCheck = !!current && current.hasPretest && !current.pretestCompleted
  const checkName = 'pre-test'
  const guideAvatar = assistantAvatar

  return (
    <JourneyCanvas>
      <JourneyHeader
        leading={headerLeading}
        title={headerTitleNode ?? headerTitle}
        subtitle={headerSubtitle(milestoneCount)}
        progress={{ done: doneCount, total: milestoneCount }}
        secondaryActions={
          <>
            <HeaderIconButton label="New chat" onClick={handleResetChat} disabled={!hasConversation}>
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            </HeaderIconButton>
            <HeaderIconButton label="Refresh path" onClick={onPathRefresh}>
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

      <MilestoneStrip items={items} onSelect={selectFromJourney} />

      {runFailed && <SanaConnectionNotice onRetry={retryRun} />}

      <JourneyBody
        panelOpen={railOpen}
        panel={
          <JourneyPanel
            count={`${milestoneCount} milestone${milestoneCount !== 1 ? 's' : ''}`}
            progress={
              allItems.length > 0
                ? { value: (allDone / allItems.length) * 100, label: `${allDone} of ${allItems.length} items` }
                : { value: milestoneCount ? (doneCount / milestoneCount) * 100 : 0, label: `${doneCount} of ${milestoneCount} done` }
            }
            items={items}
            onSelect={selectFromJourney}
            footer={
              <>
                <PanelNote title="How each milestone works">
                  A pre-test first, then AI Amplify course blocks mixed with curated videos and articles. Pass the quiz at 70% to unlock the next one.
                </PanelNote>
                {panelFooter}
              </>
            }
          />
        }
      >
        <SanaReplyActionsProvider reportSurface="blended">
        <CopilotChat
          agentId={agentId}
          threadId={threadId}
          messageView={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            assistantMessage: AssistantMessage as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userMessage: UserMessage as any,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={SanaChatInput as any}
          labels={{
            chatInputPlaceholder: chatPlaceholder,
            welcomeMessageText: welcomeMessage,
          }}
        />
        </SanaReplyActionsProvider>

        {showEmptyState && (
          <JourneyIntro footer={<div className="h-[112px] shrink-0" aria-hidden />}>
            {noInternalContent && emptyStateNoContentNotice && (
              <p className={cn('rounded-[10px] border border-ui-line bg-ui-surface px-3.5 py-2.5 text-[13px] text-ui-muted', leadIndent)}>
                {emptyStateNoContentNotice}
              </p>
            )}
            <SanaLine avatar={guideAvatar}>
              {introLine ??
                `${firstName ? `Hi ${firstName}. ` : ''}Your Blended Learning path mixes units from AI Amplify courses with videos and articles I picked from the web for your goal.`}
            </SanaLine>

            {profile && (
              <AskedForCard
                aside={[
                  LEVEL_LABEL[profile.experienceLevel] ?? profile.experienceLevel,
                  STYLE_LABEL[profile.learningStyle] ?? profile.learningStyle,
                  `${milestoneCount} milestones`,
                ].join(', ')}
                goal={profile.goals}
                topics={profile.topics}
                facts={[]}
              >
                {allItems.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-ui-line pt-3">
                    <span className="text-[13px] font-semibold text-ui-text">Your path blends two sources</span>
                    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                      <span className="h-full bg-ui-brand" style={{ width: `${(split.smeep / allItems.length) * 100}%` }} />
                      <span className="h-full flex-1 rounded-e-full border border-ui-line bg-ui-surface" />
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ui-text">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[3px] bg-ui-brand" aria-hidden />
                        <strong className="font-semibold">{split.smeep}</strong> blocks from AI Amplify courses
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-[3px] border border-ui-muted" aria-hidden />
                        <strong className="font-semibold">{split.curated}</strong> curated videos and articles
                      </span>
                    </div>
                  </div>
                )}
              </AskedForCard>
            )}

            {current ? (
              <>
                {(currentDone > 0 || needsCheck) && (
                  <SanaLine avatar={guideAvatar}>
                    {needsCheck
                      ? `Milestone ${currentIndex + 1} is ${current.title}. A short ${checkName} comes first so we can measure how much you improve.`
                      : `Let's pick up ${current.title} where you left off.`}
                  </SanaLine>
                )}
                <LearnerLine onClick={() => startMilestone(current.milestoneId, current.title)}>
                  {currentDone > 0 ? `Continue milestone ${currentIndex + 1}` : `Start milestone ${currentIndex + 1}`}
                </LearnerLine>
                <UpNextCard
                  heading={needsCheck ? `Unlocks after the ${checkName}` : `In ${current.title}`}
                  locked={needsCheck}
                  rows={bothRows(currentContent, needsCheck)}
                />
              </>
            ) : (
              <SanaLine avatar={guideAvatar}>
                Every milestone is complete.{' '}
                To learn something new, delete this path and I'll build a fresh one.
              </SanaLine>
            )}
          </JourneyIntro>
        )}
      </JourneyBody>

      <RemoveLearningPathDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeletePath}
        loading={deleteLoading}
        includeQuestionnaireNote={false}
      />
    </JourneyCanvas>
  )
}
