'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
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
  Check,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FileStack,
  MessageSquarePlus,
  PanelRight,
  PlayCircle,
  RefreshCw,
  Route,
  Target,
  Trash2,
} from 'lucide-react'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import { chatPlaceholderRef } from '@/components/dashboard/chat-components'
import {
  SanaAssistantMessage,
  SanaUserMessage,
} from '@/components/learning-ui/SanaMessages'
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
import { YouTubeVideo, journeyProse } from '@/components/journeys/JourneyMedia'
import { FollowUpChips } from '@/components/journeys/FollowUpChips'
import {
  AskedForCard,
  MilestoneRecapCard,
  UpNextCard,
  formatDuration,
  type ContentRowData,
} from '@/components/journeys/ContentList'
import { cn } from '@/lib/utils'
import { getUser } from '@/lib/auth'
import { RichContent } from '@/components/lms/RichContent'
import { completeCodContent, saveCodVideoPosition, type CodPathResponse, type CodMilestone, type CodContentItem } from '@/lib/api/cod'
import { apiFetch } from '@/lib/api'
import { MilestonePretestCard } from './MilestonePretestCard'
import { MilestoneQuizCard } from './MilestoneQuizCard'
import { RemoveLearningPathDialog } from '@/components/shared/RemoveLearningPathDialog'
import { SanaReplyActionsProvider } from '@/components/learning-ui/SanaReplyActions'
import { COD_DELIVERY_PROMPT as COD_DELIVERY_INSTRUCTIONS } from "../../../shared/anna/prompts";

const COD_DELIVERY_AGENT = 'chatbot'



// ── Content card ───────────────────────────────────────────────────────────────

function contentMeta(item: CodContentItem): string {
  const parts = [item.type === 'youtube' ? 'Video' : 'Article']
  if (item.channelTitle) parts.push(item.channelTitle)
  const d = formatDuration(item.durationSeconds)
  if (d) parts.push(d)
  return parts.join(', ')
}

function CodContentCard({
  item, position, total, pathId, nextItemId, milestoneId, milestoneTitle, onCompleted, sendMessage,
}: {
  item: CodContentItem; position: number; total: number; pathId: string; nextItemId: string | null
  milestoneId: string; milestoneTitle: string; onCompleted: () => void; sendMessage: (text: string) => void
}) {
  const alreadyDone = item.progress?.status === 'completed'
  const [videoEnded, setVideoEnded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const isYoutube = item.type === 'youtube' && !!item.youtubeVideoId

  const done = alreadyDone || justCompleted

  async function doComplete() {
    if (completing || done) return
    setCompleting(true)
    try {
      await completeCodContent(item.id, pathId, isYoutube ? 100 : undefined)
      setJustCompleted(true)
      if (nextItemId) {
        sendMessage(`Display content (id: ${nextItemId})`)
      } else {
        sendMessage(`All content done in milestone "${milestoneTitle}" (id: ${milestoneId}). Show the next step.`)
      }
      onCompleted()
    } catch (err) {
      console.warn('[cod-assistant] content completion failed', err)
    } finally {
      setCompleting(false)
    }
  }

  // Video watch-gate: the action stays quiet until the video ends.
  const gated = isYoutube && !videoEnded && !done

  return (
    <>
      <JourneyCard
        latest={!done}
        tag={
          <CardTag icon={isYoutube ? PlayCircle : FileText} tone="outline">
            {isYoutube ? 'Curated video' : 'Curated article'}
          </CardTag>
        }
        meta={`${item.channelTitle ? `${item.channelTitle}, ` : ''}item ${position} of ${total}`}
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
              <CardAction gated={gated} busy={completing} onClick={() => void doComplete()}>
                {!completing && <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
                {completing ? 'Marking complete' : 'Mark complete'}
              </CardAction>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3">
          {isYoutube && (
            <YouTubeVideo
              url={`https://www.youtube.com/watch?v=${item.youtubeVideoId}`}
              title={item.title}
              onEnded={() => setVideoEnded(true)}
              resumeAt={item.progress?.videoPositionSec ?? null}
              watchedPct={item.progress?.videoWatchPct ?? null}
              onSavePosition={(positionSec, watchPct) => void saveCodVideoPosition(item.id, pathId, positionSec, watchPct)}
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

// ── Journey mapping ────────────────────────────────────────────────────────────
//
// One derivation feeds the journey panel, the phone strip and the in-chat
// milestone list, so every view reads the same path state.

function styleFilterFor(learningStyle: string | undefined) {
  return (items: CodContentItem[]) =>
    items.filter((c) => {
      if (learningStyle === 'visual') return c.type === 'youtube'
      if (learningStyle === 'reading') return c.type === 'article'
      return true
    })
}

function currentCodId(milestones: CodMilestone[], activeMilestoneId?: string | null): string | null {
  // "Now" follows the milestone the learner has open in this session; before
  // anything is opened it falls back to the first unlocked, unfinished one.
  const activeOk =
    activeMilestoneId != null &&
    milestones.some((m) => m.milestoneId === activeMilestoneId && m.unlocked && !m.completed)
  return activeOk ? activeMilestoneId! : (milestones.find((m) => m.unlocked && !m.completed)?.milestoneId ?? null)
}

function buildCodItems(
  milestones: CodMilestone[],
  learningStyle: string | undefined,
  activeMilestoneId?: string | null,
): PanelItem[] {
  const styleFilter = styleFilterFor(learningStyle)
  const currentId = currentCodId(milestones, activeMilestoneId)

  return milestones.map((m, i) => {
    let state: PanelItem['state']
    if (m.completed) state = 'done'
    else if (!m.unlocked) state = 'locked'
    else if (m.milestoneId === currentId) state = 'current'
    else state = 'ready'

    const content = styleFilter(m.content)
    const doneContent = content.filter((c) => c.progress?.status === 'completed').length
    const allContentDone = content.length > 0 && doneContent === content.length

    let steps: PanelStep[] | undefined
    if (state === 'current') {
      steps = []
      if (m.hasPretest) {
        steps.push({ key: 'pretest', label: 'Knowledge check', state: m.pretestCompleted ? 'done' : 'now' })
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
          ? `Locked until milestone ${i} is done`
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
      steps,
      stripLabel: `${i + 1}. ${m.title}`,
      stripCount: state === 'current' && content.length > 0 && m.pretestCompleted ? `${doneContent} of ${content.length}` : undefined,
    }
  })
}

function contentRows(items: CodContentItem[], locked: boolean): ContentRowData[] {
  return items.map((c) => ({
    id: c.id,
    title: c.title,
    kind: c.type === 'youtube' ? 'video' : 'article',
    meta: contentMeta(c),
    note: locked ? (c.rationale ?? c.description) : null,
    done: c.progress?.status === 'completed',
    locked: locked && c.progress?.status !== 'completed',
  }))
}

const STYLE_LABEL: Record<string, string> = {
  visual: 'Videos',
  reading: 'Reading',
  mixed: 'Mix of videos and reading',
}
const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  codPath: CodPathResponse
  onPathRefresh: () => void
}

export function CodEmbeddedLearningAssistant({ codPath, onPathRefresh }: Props) {
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  const [showEmptyState, setShowEmptyState] = useState(true)
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const pretestJustCompletedRef = useRef<Set<string>>(new Set())
  const [threadId, setThreadId] = useState<string>(() => makeUuid())

  // CopilotKit memoizes useFrontendTool render/handler closures ("renders
  // once"), so a closure can freeze a stale `codPath` — notably an empty
  // `content: []` snapshot captured at mount, before the pretest unlocked the
  // milestone's content. Every tool below reads `codPath` from this ref so the
  // closure always sees the latest path (with freshly-loaded content) at call
  // time, instead of the value captured when the closure was created.
  const codPathRef = useRef(codPath)
  codPathRef.current = codPath

  // SanaChatInput reads its placeholder from this shared ref.
  chatPlaceholderRef.current = 'Ask Anna about your path'
  useEffect(() => () => { chatPlaceholderRef.current = null }, [])

  const { agent } = useAgent({
    agentId: COD_DELIVERY_AGENT,
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
          console.warn('[cod-assistant] runAgent failed', err)
        }
      })
    },
    [copilotkit],
  )

  const startMilestone = useCallback(
    (milestoneId: string, title: string) => {
      const m = codPathRef.current.milestones.find((ms) => ms.milestoneId === milestoneId)
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

  // COD path summary context
  const pathSummary = codPath.milestones.map((m) => ({
    milestoneId: m.milestoneId,
    title: m.title,
    order: m.order,
    unlocked: m.unlocked,
    pretestCompleted: m.pretestCompleted,
    completed: m.completed,
    contentCount: m.content.length,
    completedContent: m.content.filter((c) => c.progress?.status === 'completed').length,
    quizAvailable: m.quizAvailable,
  }))

  const learningStyle = codPath.path.discoveryProfile?.learningStyle as string | undefined
  const filterByStyle = (items: CodContentItem[]) =>
    items.filter((c) => {
      if (learningStyle === 'visual') return c.type === 'youtube'
      if (learningStyle === 'reading') return c.type === 'article'
      return true
    })

  const activeMilestone = activeMilestoneId ? codPath.milestones.find((m) => m.milestoneId === activeMilestoneId) : undefined
  const currentMilestoneContext = activeMilestone
    ? { milestoneId: activeMilestone.milestoneId, title: activeMilestone.title, content: filterByStyle(activeMilestone.content).map((c) => ({ id: c.id, title: c.title, type: c.type, url: c.url, completed: c.progress?.status === 'completed' })) }
    : null

  useAgentContext({ description: '__system_prompt__', value: COD_DELIVERY_INSTRUCTIONS })
  useAgentContext({ description: '__cod_learning_path__', value: JSON.stringify(pathSummary) })
  useAgentContext({ description: '__current_cod_milestone__', value: currentMilestoneContext ? JSON.stringify(currentMilestoneContext) : 'No milestone selected yet.' })

  // ── Tool: showCodMilestones ─────────────────────────────────────────────────

  useFrontendTool({
    name: 'showCodMilestones',
    description: 'Show the user their Content on Demand milestone overview. Each card is clickable to start that milestone.',
    parameters: z.object({}),
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const codPath = codPathRef.current
      const learningStyle = codPath.path.discoveryProfile?.learningStyle as string | undefined
      return (
        <JourneyCard
          tag={<CardTag icon={Route}>Your milestones</CardTag>}
          meta="Pick one to begin. A quick knowledge check comes first."
        >
          <div className="-mx-2 flex flex-col gap-2 pb-1">
            <JourneyPanel
              count={`${codPath.milestones.length} milestones`}
              items={buildCodItems(codPath.milestones, learningStyle, activeMilestoneId)}
              onSelect={(id) => {
                const m = codPath.milestones.find((ms) => ms.milestoneId === id)
                if (m) startMilestone(m.milestoneId, m.title)
              }}
            />
          </div>
        </JourneyCard>
      )
    },
    handler: async () => {
      const codPath = codPathRef.current
      const summary = codPath.milestones.map((m) => `${m.title}: ${m.unlocked ? 'unlocked' : 'locked'}`).join('; ')
      return `Content on Demand milestones: ${summary}`
    },
  })

  // ── Tool: openCodMilestone ──────────────────────────────────────────────────
  // Shows the pretest knowledge check inline only. ToolCallRenderer is memoized
  // by CopilotKit (React.memo, renders once), so this card stays frozen with
  // its internal isDone state after the user clicks "Start Learning".

  useFrontendTool({
    name: 'openCodMilestone',
    description: 'Show the pretest knowledge check inline for a milestone. Only call this when pretestCompleted=false.',
    parameters: z.object({ milestoneId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const codPath = codPathRef.current
      const m = codPath.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>
      return (
        <MilestonePretestCard
          milestoneId={m.milestoneId}
          milestoneTitle={m.title}
          pathId={codPath.path.id}
          onComplete={async () => {
            pretestJustCompletedRef.current.add(m.milestoneId)
            setShowEmptyState(false)
            await onPathRefresh()
            // One tick so the refreshed path state (pretestCompleted=true) lands
            // before the agent call. setTimeout, NOT requestAnimationFrame: rAF
            // never fires in a hidden/background tab, which left this await
            // hanging forever and silently swallowed the "Start learning" send.
            await new Promise<void>((resolve) => { setTimeout(resolve, 32) })
            sendMessage(`Start learning "${m.title}" (id: ${m.milestoneId}).`)
          }}
        />
      )
    },
    handler: async ({ milestoneId }) => {
      const codPath = codPathRef.current
      const m = codPath.milestones.find((ms) => ms.milestoneId === milestoneId)
      if (!m) return 'Milestone not found.'
      setActiveMilestoneId(milestoneId)
      return `Showing knowledge check for "${m.title}".`
    },
  })

  // ── Tool: openMilestoneContent ──────────────────────────────────────────────
  // Shows content or posttest quiz inline for a milestone once pretest is done.
  // Separate tool so its ToolCallRenderer is independent of openCodMilestone,
  // avoiding any ref/state timing issues with CopilotKit's memoization.

  useFrontendTool({
    name: 'openMilestoneContent',
    description: 'Show learning content or final quiz inline for a milestone. Only call this when pretestCompleted=true.',
    parameters: z.object({ milestoneId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const codPath = codPathRef.current
      const m = codPath.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>

      const filteredContent = filterByStyle(m.content)
      const allContentDone = filteredContent.length > 0 && filteredContent.every((c) => c.progress?.status === 'completed')

      // All content done + quiz not passed → inline quiz
      if (allContentDone && !m.completed) {
        return (
          <MilestoneQuizCard
            milestoneId={m.milestoneId}
            milestoneTitle={m.title}
            pathId={codPath.path.id}
            onPass={async () => {
              await onPathRefresh()
              sendMessage(`I just passed the quiz for "${m.title}". Congratulate me in one short sentence, then show my updated learning path.`)
            }}
          />
        )
      }

      // Show first incomplete content item
      const first = filteredContent.find((c) => c.progress?.status !== 'completed') ?? filteredContent[0]
      // Defensive fallback: if content hasn't loaded into the path yet, show a
      // recoverable message instead of silently rendering nothing.
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
        <CodContentCard
          position={firstIdx + 1}
          total={filteredContent.length}
          item={first}
          pathId={codPath.path.id}
          nextItemId={nextItem?.id ?? null}
          milestoneId={m.milestoneId}
          milestoneTitle={m.title}
          onCompleted={onPathRefresh}
          sendMessage={sendMessage}
        />
      )
    },
    handler: async ({ milestoneId }) => {
      const codPath = codPathRef.current
      const m = codPath.milestones.find((ms) => ms.milestoneId === milestoneId)
      if (!m) return 'Milestone not found.'
      setActiveMilestoneId(milestoneId)
      const allContentDone = m.content.length > 0 && m.content.every((c) => c.progress?.status === 'completed')
      if (allContentDone && !m.completed) {
        return `All content complete. Showing posttest quiz for "${m.title}".`
      }
      const first = m.content.find((c) => c.progress?.status !== 'completed') ?? m.content[0]
      return `Showing content "${first?.title ?? 'n/a'}" in "${m.title}". The content card is already on screen — your turn is over. Do NOT call any other tool now; output nothing.`
    },
  })

  // ── Tool: displayCodContent ─────────────────────────────────────────────────

  useFrontendTool({
    name: 'displayCodContent',
    description: 'Render one specific Content on Demand item (YouTube video or article).',
    parameters: z.object({ contentId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const codPath = codPathRef.current
      for (const m of codPath.milestones) {
        const item = m.content.find((c) => c.id === args.contentId)
        if (item) {
          const itemIdx = m.content.indexOf(item)
          const nextItem = m.content[itemIdx + 1] ?? null
          return (
            <CodContentCard
              position={itemIdx + 1}
              total={m.content.length}
              item={item}
              pathId={codPath.path.id}
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
      const codPath = codPathRef.current
      for (const m of codPath.milestones) {
        const item = m.content.find((c) => c.id === contentId)
        if (item) {
          return `Showing "${item.title}" (${item.type}). The content card is already on screen — your turn is over. Do NOT call any other tool now; output nothing.`
        }
      }
      return 'Content item not found.'
    },
  })

  // ── Tool: triggerQuiz ───────────────────────────────────────────────────────

  useFrontendTool({
    name: 'triggerQuiz',
    description: 'Show the posttest quiz inline for a milestone after all content is complete.',
    parameters: z.object({ milestoneId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <JourneyCardSkeleton />
      const codPath = codPathRef.current
      const m = codPath.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>
      return (
        <MilestoneQuizCard
          milestoneId={m.milestoneId}
          milestoneTitle={m.title}
          pathId={codPath.path.id}
          onPass={async () => {
            await onPathRefresh()
            sendMessage(`I just passed the quiz for "${m.title}". Congratulate me in one short sentence, then show my updated learning path.`)
          }}
        />
      )
    },
    handler: async ({ milestoneId }) => {
      const codPath = codPathRef.current
      const m = codPath.milestones.find((ms) => ms.milestoneId === milestoneId)
      if (!m) return 'Milestone not found.'
      return `Showing posttest quiz inline for "${m.title}".`
    },
  })

  // ── Delete path ────────────────────────────────────────────────────────────

  const handleDeletePath = async () => {
    setDeleteLoading(true)
    try {
      await apiFetch('/api/lms/cod/path', { method: 'DELETE' })
      setShowDeleteDialog(false)
      onPathRefresh()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const items = buildCodItems(codPath.milestones, learningStyle, activeMilestoneId)
  const doneCount = items.filter((m) => m.state === 'done').length
  const milestoneCount = codPath.milestones.length
  const pathPct = milestoneCount ? (doneCount / milestoneCount) * 100 : 0
  const selectFromJourney = useCallback(
    (id: string) => {
      const m = codPathRef.current.milestones.find((ms) => ms.milestoneId === id)
      if (m) startMilestone(m.milestoneId, m.title)
    },
    [startMilestone],
  )

  const [railOpen, toggleRail] = useJourneyRail()
  const firstName = (getUser()?.fullName ?? '').trim().split(/\s+/)[0]
  const profile = codPath.path.discoveryProfile
  const currentId = currentCodId(codPath.milestones, activeMilestoneId)
  const current = codPath.milestones.find((m) => m.milestoneId === currentId)
  const currentIndex = current ? codPath.milestones.indexOf(current) : -1
  const lastDone = [...codPath.milestones].reverse().find((m) => m.completed)
  const lastDoneIndex = lastDone ? codPath.milestones.indexOf(lastDone) : -1
  const currentContent = current ? filterByStyle(current.content) : []
  const currentDone = currentContent.filter((c) => c.progress?.status === 'completed').length
  const needsCheck = !!current && current.hasPretest && !current.pretestCompleted

  return (
    <JourneyCanvas>
      <JourneyHeader
        title="Content on Demand"
        subtitle={`${milestoneCount} milestone${milestoneCount !== 1 ? 's' : ''} of curated videos and articles, guided by Anna`}
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
            progress={{ value: pathPct, label: `${Math.round(pathPct)}%` }}
            items={items}
            onSelect={selectFromJourney}
            footer={
              <PanelNote title="How each milestone works">
                A knowledge check, then the videos and articles Anna picked for you, and a quiz you pass at 70% to unlock
                the next milestone.
              </PanelNote>
            }
          />
        }
      >
        <SanaReplyActionsProvider reportSurface="content-on-demand">
        <CopilotChat
          agentId={COD_DELIVERY_AGENT}
          threadId={threadId}
          messageView={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            assistantMessage: SanaAssistantMessage as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userMessage: SanaUserMessage as any,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={SanaChatInput as any}
          labels={{
            chatInputPlaceholder: 'Ask Anna about your path',
            welcomeMessageText: "Hi, I'm Anna. Let's walk through your personalised learning path together.",
          }}
        />
        </SanaReplyActionsProvider>

        {showEmptyState && (
          <JourneyIntro footer={<div className="h-[112px] shrink-0" aria-hidden />}>
            <SanaLine>
              {firstName ? `Hi ${firstName}. ` : 'Hi. '}I picked videos and articles that match your goal and grouped them
              into {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}.
            </SanaLine>

            {profile && (
              <AskedForCard
                aside="From your chat with Anna"
                goal={profile.goals}
                topics={profile.topics}
                facts={[
                  { label: 'Experience', value: LEVEL_LABEL[profile.experienceLevel] ?? profile.experienceLevel },
                  { label: 'Learns best with', value: STYLE_LABEL[profile.learningStyle] ?? profile.learningStyle },
                  { label: 'Path length', value: `${milestoneCount} milestones` },
                ]}
              />
            )}

            {lastDone && (
              <MilestoneRecapCard
                index={lastDoneIndex + 1}
                title={lastDone.title}
                stats={[
                  ...(lastDone.hasPretest ? [{ icon: Target, label: 'Knowledge check', value: 'Done' }] : []),
                  {
                    icon: FileStack,
                    label: 'Content',
                    value: `${filterByStyle(lastDone.content).filter((c) => c.progress?.status === 'completed').length} of ${filterByStyle(lastDone.content).length}`,
                  },
                  ...(lastDone.quiz ? [{ icon: ClipboardCheck, label: 'Quiz', value: `${lastDone.quiz.score}/${lastDone.quiz.total}, passed` }] : []),
                ]}
                rows={contentRows(filterByStyle(lastDone.content), false)}
              />
            )}

            {current ? (
              <>
                <SanaLine>
                  {lastDone ? `That's ${lastDone.title} done, well earned. ` : ''}
                  {needsCheck
                    ? `Next is ${current.title}. A quick knowledge check comes first so we can measure how much you improve.`
                    : currentDone > 0
                      ? `Let's pick up ${current.title} where you left off.`
                      : `Next is ${current.title}. Your content is ready.`}
                </SanaLine>
                <LearnerLine onClick={() => startMilestone(current.milestoneId, current.title)}>
                  {needsCheck ? `Start the knowledge check for milestone ${currentIndex + 1}` : `${currentDone > 0 ? 'Continue' : 'Start'} ${current.title}`}
                </LearnerLine>
                <UpNextCard
                  heading={needsCheck ? 'Unlocks after the knowledge check' : `In ${current.title}`}
                  locked={needsCheck}
                  rows={contentRows(currentContent, needsCheck)}
                />
              </>
            ) : (
              <SanaLine>Every milestone is complete. To learn something new, delete this path and I'll build a fresh one.</SanaLine>
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
