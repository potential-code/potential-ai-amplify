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
import { BookOpen, RefreshCw, RotateCcw, CheckCircle2, PlayCircle, FileText, Lock, Sparkles, Trash2 } from 'lucide-react'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import {
  SmeepAssistantMessage,
  SmeepUserMessage,
  SmeepChatInput,
} from '@/components/dashboard/chat-components'
import { cn } from '@/lib/utils'
import { RichContent } from '@/components/lms/RichContent'
import { completeCodContent, type CodPathResponse, type CodMilestone, type CodContentItem } from '@/lib/api/cod'
import { apiFetch } from '@/lib/api'
import { MilestonePretestCard } from './MilestonePretestCard'
import { MilestoneQuizCard } from './MilestoneQuizCard'
import { RemoveLearningPathDialog } from '@/components/shared/RemoveLearningPathDialog'

const COD_DELIVERY_AGENT = 'chatbot'

const COD_DELIVERY_INSTRUCTIONS = `You are Anna — AI Amplify's AI learning guide. You walk the user through their personalised Content-On-Demand (COD) learning path ONE content item at a time.

YOUR GOLDEN RULES:
1. NEVER write, summarise, define, or invent learning content. Content is rendered by the tools below.
2. The user drives the flow by clicking cards. When they click, you get an explicit instruction telling you EXACTLY which tool to call with which id. Call that tool with that exact id and nothing else.
3. After calling any tool, output NO TEXT — not a single word. The card speaks for itself.
4. The content card handles completion and advancing — do NOT call the next tool yourself. Wait for the user's message.
5. When all content in a milestone is complete, call triggerQuiz with the milestoneId.

YOUR KNOWLEDGE OF THE PATH:
- __cod_learning_path__ holds all milestones with their unlock/completion state.
- __current_cod_milestone__ holds the full content list for the active milestone.

TOOL FLOW:
- "show my path" / "milestones" → showCodMilestones
- "Start milestone (id: X)" → openCodMilestone(X)   [only when pretestCompleted=false]
- "Start learning ... (id: X)" → openMilestoneContent(X)   [pretest done, show content]
- "Display content (id: X)" → displayCodContent(X)
- "All content done in milestone X" → triggerQuiz(X)

When the user asks questions about their learning topic, answer concisely from your general expertise.`

// ── YouTube helpers ────────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /embed\/([^?&]+)/]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]!
  }
  return null
}

function YouTubeVideo({ url, onEnded }: { url: string; onEnded: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null)
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded

  useEffect(() => {
    const videoId = extractYouTubeId(url)
    if (!videoId || !hostRef.current) return
    let interval: ReturnType<typeof setInterval> | undefined

    function createPlayer() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT
      if (!YT?.Player || !hostRef.current || playerRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            if (e.data === YT.PlayerState.ENDED) onEndedRef.current()
          },
        },
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) {
      createPlayer()
    } else {
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script')
        tag.id = 'yt-iframe-api'
        tag.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(tag)
      }
      interval = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).YT?.Player) {
          clearInterval(interval)
          createPlayer()
        }
      }, 200)
    }

    return () => {
      if (interval) clearInterval(interval)
      try { playerRef.current?.destroy?.() } catch { /* noop */ }
      playerRef.current = null
    }
  }, [url])

  return (
    <div className="max-w-[580px] w-full mx-auto">
      <div className="aspect-video rounded-lg overflow-hidden bg-black">
        <div ref={hostRef} className="w-full h-full" />
      </div>
    </div>
  )
}

// ── Content card ───────────────────────────────────────────────────────────────

function CodContentCard({
  item, pathId, nextItemId, milestoneId, milestoneTitle, onCompleted, sendMessage,
}: {
  item: CodContentItem; pathId: string; nextItemId: string | null
  milestoneId: string; milestoneTitle: string; onCompleted: () => void; sendMessage: (text: string) => void
}) {
  const alreadyDone = item.progress?.status === 'completed'
  const [videoEnded, setVideoEnded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const isYoutube = item.type === 'youtube' && !!item.youtubeVideoId

  const done = alreadyDone || justCompleted
  const canComplete = !done

  async function doComplete() {
    if (completing || done) return
    setCompleting(true)
    try {
      await completeCodContent(item.id, pathId, isYoutube ? 100 : undefined)
      setJustCompleted(true)
      if (nextItemId) {
        sendMessage(`Display content (id: ${nextItemId})`)
      } else {
        sendMessage(`All content done in milestone "${milestoneTitle}" (id: ${milestoneId}). Trigger the quiz.`)
      }
      onCompleted()
    } catch (err) {
      console.warn('[cod-assistant] content completion failed', err)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="my-2 rounded-xl border border-brand-surface-2 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-surface-2 bg-brand-surface">
        {isYoutube ? <PlayCircle className="w-4 h-4 text-brand-text-secondary" /> : <FileText className="w-4 h-4 text-brand-text-secondary" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-brand-text-primary truncate">{item.title}</p>
          <p className="text-[10px] text-brand-text-muted capitalize">{item.type === 'youtube' ? 'Video' : 'Article'}</p>
        </div>
        {done && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Done
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        {isYoutube && (
          <YouTubeVideo url={`https://www.youtube.com/watch?v=${item.youtubeVideoId}`} onEnded={() => setVideoEnded(true)} />
        )}
        {item.type === 'article' && item.articleText && (
          <div className="max-h-[480px] overflow-y-auto pr-1">
            <RichContent content={item.articleText} className="text-xs" />
          </div>
        )}
        {item.rationale && (
          <p className="text-[10px] text-brand-text-muted italic">{item.rationale}</p>
        )}
      </div>
      {!done && (
        <div className="px-4 pb-4 space-y-2">
          {isYoutube && !videoEnded && (
            <p className="flex items-center gap-1.5 text-[11px] text-brand-text-muted">
              <Lock className="w-3 h-3 shrink-0" /> Finish watching to unlock completion.
            </p>
          )}
          <button
            type="button"
            onClick={() => void doComplete()}
            disabled={completing}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {completing ? 'Marking complete…' : 'Mark Complete'}
          </button>
        </div>
      )}
      {done && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <p className="text-[11px] font-semibold text-emerald-700">Completed!</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-brand-surface-2 bg-brand-surface p-4 my-2 animate-pulse space-y-2">
      <div className="h-3 w-2/3 bg-brand-surface-2 rounded" />
      <div className="h-2 w-full bg-brand-surface-2 rounded" />
    </div>
  )
}

// ── Milestone grid ─────────────────────────────────────────────────────────────

function CodMilestoneGrid({
  milestones, onStart,
}: {
  milestones: CodMilestone[]
  onStart: (milestoneId: string, title: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {milestones.map((m, idx) => {
        const completedContent = m.content.filter((c) => c.progress?.status === 'completed').length
        const totalContent = m.content.length
        const pretestTotal = m.hasPretest ? 1 : 0
        const pretestDone = m.pretestCompleted ? 1 : 0
        const posttestDone = m.quiz?.passed ? 1 : 0
        const totalItems = totalContent + pretestTotal + 1
        const completedItems = completedContent + pretestDone + posttestDone
        const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
        return (
          <button
            key={m.milestoneId}
            type="button"
            disabled={!m.unlocked}
            onClick={() => m.unlocked && onStart(m.milestoneId, m.title)}
            className={cn(
              'group flex flex-col text-left rounded-xl border border-brand-surface-2 bg-[#fdf5f9] overflow-hidden transition-all',
              m.unlocked ? 'cursor-pointer shadow-sm hover:border-brand-primary/50 hover:shadow-md' : 'cursor-not-allowed opacity-60',
            )}
            style={{ borderTop: '3px solid var(--color-brand-primary)' }}
          >
            <div className="flex flex-col flex-1 px-3.5 pt-3 pb-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-brand-text-primary line-clamp-2 leading-snug">{m.title}</p>
                {m.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : !m.unlocked ? (
                  <Lock className="w-4 h-4 text-brand-text-muted flex-shrink-0 mt-0.5" />
                ) : (
                  <span
                    className="text-[9px] font-bold text-white px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                    style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
                  >
                    {m.pretestCompleted && completedContent > 0 ? 'Continue' : m.pretestCompleted ? 'Start' : 'Knowledge check first'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-brand-text-muted mt-1">Milestone {idx + 1}</p>
              {m.pretestCompleted && totalItems > 0 && (
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-brand-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-brand-text-muted shrink-0">{completedItems}/{totalItems}</span>
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    description: 'Show the user their COD milestone overview. Each card is clickable to start that milestone.',
    parameters: z.object({}),
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const codPath = codPathRef.current
      return (
        <div className="my-2 space-y-2">
          <p className="text-xs font-semibold text-brand-text-secondary mb-1">Your Learning Path · tap a milestone to begin</p>
          <CodMilestoneGrid milestones={codPath.milestones} onStart={startMilestone} />
        </div>
      )
    },
    handler: async () => {
      const codPath = codPathRef.current
      const summary = codPath.milestones.map((m) => `${m.title}: ${m.unlocked ? 'unlocked' : 'locked'}`).join('; ')
      return `COD milestones: ${summary}`
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
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
            await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()) })
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const codPath = codPathRef.current
      const m = codPath.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>

      // All content done + quiz not passed → inline quiz
      const filteredContent = filterByStyle(m.content)
      const allContentDone = filteredContent.length > 0 && filteredContent.every((c) => c.progress?.status === 'completed')
      if (allContentDone && !m.completed) {
        return (
          <MilestoneQuizCard
            milestoneId={m.milestoneId}
            milestoneTitle={m.title}
            pathId={codPath.path.id}
            onPass={async () => {
              await onPathRefresh()
              sendMessage(`I just passed the quiz for "${m.title}". Show my updated COD learning path.`)
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
          <div className="my-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-brand-text-secondary">
            Preparing your content…{' '}
            <button
              type="button"
              onClick={() => onPathRefresh()}
              className="font-semibold underline"
              style={{ color: 'var(--color-brand-primary)' }}
            >
              Refresh
            </button>
          </div>
        )
      }
      const firstIdx = filteredContent.indexOf(first)
      const nextItem = filteredContent[firstIdx + 1] ?? null
      return (
        <CodContentCard
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
      return `Showing content "${first?.title ?? 'n/a'}" in "${m.title}". The content card handles completion and advancing — do nothing else.`
    },
  })

  // ── Tool: displayCodContent ─────────────────────────────────────────────────

  useFrontendTool({
    name: 'displayCodContent',
    description: 'Render one specific COD content item (YouTube video or article).',
    parameters: z.object({ contentId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const codPath = codPathRef.current
      for (const m of codPath.milestones) {
        const item = m.content.find((c) => c.id === args.contentId)
        if (item) {
          const itemIdx = m.content.indexOf(item)
          const nextItem = m.content[itemIdx + 1] ?? null
          return (
            <CodContentCard
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
          return `Showing "${item.title}" (${item.type}). The content card handles completion and advancing — do nothing else.`
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
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
            sendMessage(`I just passed the quiz for "${m.title}". Show my updated COD learning path.`)
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

  return (
    <>
      <div className="smeep-copilot flex flex-col h-full overflow-hidden">
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
          style={{ background: 'linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)' }}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/10">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">Learning Path (COD)</p>
            <p className="text-[10px] text-white/60 leading-tight">
              {codPath.milestones.length} milestone{codPath.milestones.length !== 1 ? 's' : ''} · Guided by Anna
            </p>
          </div>
          <button
            type="button"
            aria-label="New chat"
            onClick={handleResetChat}
            disabled={!hasConversation}
            className="inline-flex items-center justify-center w-8 h-8 cursor-pointer rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Refresh path"
            onClick={onPathRefresh}
            className="inline-flex items-center justify-center w-8 h-8 cursor-pointer rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Delete learning path"
            title="Delete learning path"
            onClick={() => setShowDeleteDialog(true)}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-2 cursor-pointer rounded-full text-white/60 hover:text-white hover:bg-white/15 transition-colors text-[10px] font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete learning path</span>
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden smeep-assistant-chat">
          <CopilotChat
            agentId={COD_DELIVERY_AGENT}
            threadId={threadId}
            messageView={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              assistantMessage: SmeepAssistantMessage as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              userMessage: SmeepUserMessage as any,
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            input={SmeepChatInput as any}
            labels={{
              chatInputPlaceholder: 'Ask Anna about your learning path…',
              welcomeMessageText: "Hi! I'm Anna 👋\nLet's walk through your personalised learning path together.",
            }}
          />

          {showEmptyState && (
            <div className="absolute inset-0 z-10 flex flex-col bg-white overflow-y-auto">
              <div className="px-5 pt-6 pb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
                  >
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-base font-black text-brand-text-primary">Hi! I&apos;m Anna 👋</p>
                </div>
                <p className="text-xs text-brand-text-secondary leading-relaxed">
                  Here are your personalised milestones. Click a milestone to start — you&apos;ll answer a quick knowledge-check first, then dive into curated content.
                </p>
              </div>
              <div className="px-5 pb-6">
                <CodMilestoneGrid milestones={codPath.milestones} onStart={startMilestone} />
              </div>
            </div>
          )}
        </div>
      </div>
      <RemoveLearningPathDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeletePath}
        loading={deleteLoading}
        includeQuestionnaireNote={false}
      />
    </>
  )
}
