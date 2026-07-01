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
import {
  BookOpen,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  PlayCircle,
  FileText,
  ImageIcon,
  ListChecks,
  Send,
  Lock,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { makeUuid } from '@/components/dashboard/useStreamingVoice'
import {
  SmeepAssistantMessage,
  SmeepUserMessage,
  SmeepChatInput,
} from '@/components/dashboard/chat-components'
import { cn } from '@/lib/utils'
import { RichContent } from '@/components/lms/RichContent'
import {
  completeBothItem,
  type BothPathResponse,
  type BothMilestone,
  type BothContentItem,
  type BlockQuestion,
} from '@/lib/api/both'
import { apiSaveQuestionAnswer } from '@/lib/api/lms'
import { apiFetch } from '@/lib/api'
import { BothMilestonePretestCard } from './BothMilestonePretestCard'
import { BothMilestoneQuizCard } from './BothMilestoneQuizCard'
import { RemoveLearningPathDialog } from '@/components/shared/RemoveLearningPathDialog'

const BOTH_DELIVERY_AGENT = 'chatbot'

const BOTH_DELIVERY_INSTRUCTIONS = `You are Sana — SMEEP's AI learning guide. You walk the user through their personalised Learning Path (Both) ONE content item at a time. This path contains a mix of internal SMEEP learning blocks and external YouTube/article content.

YOUR GOLDEN RULES:
1. NEVER write, summarise, define, or invent learning content. Content is rendered by the tools below.
2. The user drives the flow by clicking cards. When they click, you get an explicit instruction telling you EXACTLY which tool to call with which id. Call that tool with that exact id and nothing else.
3. After calling any tool, output NO TEXT — not a single word. The card speaks for itself.
4. The content card handles completion and advancing — do NOT call the next tool yourself. Wait for the user's message.
5. When all content in a milestone is complete, call triggerBothQuiz with the milestoneId.

YOUR KNOWLEDGE OF THE PATH:
- __both_learning_path__ holds all milestones with their unlock/completion state.
- __current_both_milestone__ holds the full content list for the active milestone.

TOOL FLOW:
- "show my path" / "milestones" → showBothMilestones
- "Start milestone (id: X)" → openBothMilestone(X)   [only when pretestCompleted=false]
- "Start learning ... (id: X)" → openBothMilestoneContent(X)   [pretest done, show content]
- "Display content (id: X)" → displayBothContent(X)
- "All content done in milestone X" → triggerBothQuiz(X)

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

// ── Block type icon ───────────────────────────────────────────────────────────

function BlockTypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'video') return <PlayCircle className={cn('w-4 h-4', className)} />
  if (type === 'image') return <ImageIcon className={cn('w-4 h-4', className)} />
  if (type === 'question') return <ListChecks className={cn('w-4 h-4', className)} />
  return <FileText className={cn('w-4 h-4', className)} />
}

// ── Chat question renderer ────────────────────────────────────────────────────

type ChatQuestionBlockProps = {
  item: BothContentItem
  onSubmitted: () => void
}

function ChatQuestionBlock({ item, onSubmitted }: ChatQuestionBlockProps) {
  type Answers = Record<string, number | string>
  const [answers, setAnswers] = useState<Answers>({})
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)

  const questions: BlockQuestion[] = item.questions ?? []

  const allAnswered = questions.every((q) => {
    const ans = answers[q.id]
    if (q.format === 'short-text') return typeof ans === 'string' && ans.trim().length > 0
    return typeof ans === 'number'
  })

  async function handleSubmit() {
    if (!allAnswered || pending || submitted) return
    setPending(true)
    try {
      await Promise.all(
        questions.map((q) => {
          const ans = answers[q.id]
          if (q.format === 'short-text') {
            return apiSaveQuestionAnswer(q.id, { openEndedAnswer: String(ans ?? '') })
          }
          return apiSaveQuestionAnswer(q.id, { selectedAnswer: typeof ans === 'number' ? ans : 0 })
        }),
      )
      setSubmitted(true)
      onSubmitted()
    } catch (err) {
      console.warn('[both-assistant] saving question answer failed', err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="text-xs font-semibold text-brand-text-primary mb-2 leading-relaxed">{q.prompt}</p>

          {q.format === 'short-text' ? (
            <textarea
              value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              disabled={submitted}
              placeholder={q.placeholder ?? 'Write your answer…'}
              rows={3}
              className={cn(
                'w-full rounded-xl border bg-white px-3 py-2 text-xs text-brand-text-primary placeholder:text-brand-text-muted/70 focus:outline-none transition-all resize-none',
                submitted
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-brand-surface-2 focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/10',
              )}
            />
          ) : (
            <div className="grid gap-1.5">
              {(q.format === 'true-false' ? ['True', 'False'] : (q.options ?? [])).map((opt, idx) => {
                const isSelected = answers[q.id] === idx
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => !submitted && setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                    disabled={submitted}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs text-left transition-all',
                      isSelected
                        ? 'border-brand-primary bg-brand-primary/5 text-brand-text-primary shadow-sm'
                        : 'border-brand-surface-2 bg-white text-brand-text-primary hover:border-brand-primary/40',
                      submitted && !isSelected && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center w-4 h-4 rounded-full border-2 transition-colors shrink-0',
                        isSelected ? 'border-brand-primary bg-brand-primary' : 'border-brand-surface-2 bg-white',
                      )}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {submitted ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <p className="text-[11px] font-semibold text-emerald-700">Answers submitted</p>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered || pending}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
          >
            <Send className="w-3 h-3" />
            {pending ? 'Submitting…' : 'Submit answers'}
          </button>
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

// ── BothContentCard ────────────────────────────────────────────────────────────

function BothContentCard({
  item, pathId, nextItemId, milestoneId, milestoneTitle, onCompleted, sendMessage,
}: {
  item: BothContentItem
  pathId: string
  nextItemId: string | null
  milestoneId: string
  milestoneTitle: string
  onCompleted: () => void
  sendMessage: (text: string) => void
}) {
  const isDone = item.itemType === 'external'
    ? item.progress?.status === 'completed'
    : item.blockProgress?.status === 'completed'

  const [videoEnded, setVideoEnded] = useState(false)
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)

  const done = isDone || justCompleted

  // Determine if this is a video (external youtube or internal video block)
  const isExternalYoutube = item.itemType === 'external' && item.type === 'youtube' && !!item.youtubeVideoId
  const isInternalVideo = item.itemType === 'internal' && item.blockType === 'video' && !!item.videoUrl
  const isInternalYouTube = isInternalVideo && !!(item.videoUrl?.includes('youtube.com') || item.videoUrl?.includes('youtu.be'))
  const isInternalQuestion = item.itemType === 'internal' && item.blockType === 'question' && (item.questions?.length ?? 0) > 0

  const canComplete = (() => {
    if (done) return false
    if (isExternalYoutube) return videoEnded
    if (isInternalVideo) return videoEnded
    if (isInternalQuestion) return questionsSubmitted
    return true
  })()

  async function doComplete() {
    if (completing || done) return
    setCompleting(true)
    try {
      const itemId = item.itemType === 'internal' ? item.blockId! : item.id
      const videoWatchPct = (isExternalYoutube || isInternalVideo) ? 100 : undefined
      await completeBothItem(itemId, pathId, item.itemType, milestoneId, videoWatchPct)
      setJustCompleted(true)
      if (nextItemId) {
        sendMessage(`Display content (id: ${nextItemId})`)
      } else {
        sendMessage(`All content done in milestone "${milestoneTitle}" (id: ${milestoneId}). Trigger the quiz.`)
      }
      onCompleted()
    } catch (err) {
      console.warn('[both-assistant] content completion failed', err)
    } finally {
      setCompleting(false)
    }
  }

  // ── External item rendering ────────────────────────────────────────────────

  if (item.itemType === 'external') {
    return (
      <div className="my-2 rounded-xl border border-brand-surface-2 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-surface-2 bg-brand-surface">
          {isExternalYoutube
            ? <PlayCircle className="w-4 h-4 text-brand-text-secondary" />
            : <FileText className="w-4 h-4 text-brand-text-secondary" />}
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
          {isExternalYoutube && (
            <YouTubeVideo
              url={`https://www.youtube.com/watch?v=${item.youtubeVideoId}`}
              onEnded={() => setVideoEnded(true)}
            />
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
            {isExternalYoutube && !videoEnded && (
              <p className="flex items-center gap-1.5 text-[11px] text-brand-text-muted">
                <Lock className="w-3 h-3 shrink-0" /> Finish watching to unlock completion.
              </p>
            )}
            <button
              type="button"
              onClick={() => void doComplete()}
              disabled={completing}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
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

  // ── Internal block rendering ───────────────────────────────────────────────

  return (
    <div className="my-2 rounded-xl border border-brand-surface-2 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-surface-2 bg-brand-surface">
        <BlockTypeIcon type={item.blockType ?? 'text'} className="text-brand-text-secondary" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-brand-text-primary truncate">{item.title}</p>
          <p className="text-[10px] text-brand-text-muted capitalize">{item.blockType ?? 'text'} block</p>
        </div>
        {done && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Done
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {item.blockType === 'text' && item.body && (
          <RichContent content={item.body} className="text-xs" />
        )}

        {isInternalVideo && (
          isInternalYouTube ? (
            <YouTubeVideo url={item.videoUrl!} onEnded={() => setVideoEnded(true)} />
          ) : (
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
              <video
                src={item.videoUrl!}
                controls
                onEnded={() => setVideoEnded(true)}
                className="w-full h-full"
              />
            </div>
          )
        )}

        {item.blockType === 'image' && item.imageUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt={item.title} className="max-w-full rounded-lg" />
          </div>
        )}

        {isInternalQuestion && (
          <div className="rounded-lg bg-brand-surface border border-brand-surface-2 px-3 py-3">
            {item.body && <RichContent content={item.body} className="text-xs mb-3" />}
            <ChatQuestionBlock
              item={item}
              onSubmitted={() => {
                setQuestionsSubmitted(true)
                void doComplete()
              }}
            />
          </div>
        )}

        {item.blockType !== 'question' && !item.body && !item.videoUrl && !item.imageUrl && (
          <p className="text-xs text-brand-text-muted italic">No content available for this block.</p>
        )}

        {item.rationale && (
          <p className="text-[10px] text-brand-text-muted italic">{item.rationale}</p>
        )}
      </div>

      {/* Footer — Mark Complete gate */}
      {!done && (
        <div className="px-4 pb-4 space-y-2">
          {isInternalVideo && !videoEnded && (
            <p className="flex items-center gap-1.5 text-[11px] text-brand-text-muted">
              <Lock className="w-3 h-3 shrink-0" /> Finish watching the video to unlock completion.
            </p>
          )}
          {isInternalQuestion && !questionsSubmitted && (
            <p className="flex items-center gap-1.5 text-[11px] text-brand-text-muted">
              <Lock className="w-3 h-3 shrink-0" /> Submit your answer to unlock completion.
            </p>
          )}
          {!isInternalQuestion && (
            <button
              type="button"
              onClick={() => void doComplete()}
              disabled={completing}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {completing ? 'Marking complete…' : 'Mark Complete'}
            </button>
          )}
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

// ── Milestone grid ─────────────────────────────────────────────────────────────

function BothMilestoneGrid({
  milestones, onStart,
}: {
  milestones: BothMilestone[]
  onStart: (milestoneId: string, title: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {milestones.map((m, idx) => {
        const completedContent = m.content.filter((c) =>
          (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) === 'completed'
        ).length
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
            style={{ borderTop: '3px solid #9f2063' }}
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
                    style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
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
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #9f2063 0%, #7a1a4c 100%)' }}
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
  bothPath: BothPathResponse
  onPathRefresh: () => void
}

export function BothEmbeddedLearningAssistant({ bothPath, onPathRefresh }: Props) {
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

  const { agent } = useAgent({
    agentId: BOTH_DELIVERY_AGENT,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (learningStyle === 'visual') {
        if (c.itemType === 'external') return c.type === 'youtube'
        if (c.itemType === 'internal') return c.blockType === 'video' || c.blockType === 'image'
        return true
      }
      if (learningStyle === 'reading') {
        if (c.itemType === 'external') return c.type === 'article'
        if (c.itemType === 'internal') return c.blockType === 'text'
        return true
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

  useAgentContext({ description: '__system_prompt__', value: BOTH_DELIVERY_INSTRUCTIONS })
  useAgentContext({ description: '__both_learning_path__', value: JSON.stringify(pathSummary) })
  useAgentContext({ description: '__current_both_milestone__', value: currentMilestoneContext ? JSON.stringify(currentMilestoneContext) : 'No milestone selected yet.' })

  // ── Tool: showBothMilestones ────────────────────────────────────────────────

  useFrontendTool({
    name: 'showBothMilestones',
    description: 'Show the user their Both learning path milestone overview. Each card is clickable to start that milestone.',
    parameters: z.object({}),
    render: ({ status }) => {
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const bp = bothPathRef.current
      return (
        <div className="my-2 space-y-2">
          <p className="text-xs font-semibold text-brand-text-secondary mb-1">Your Learning Path · tap a milestone to begin</p>
          <BothMilestoneGrid milestones={bp.milestones} onStart={startMilestone} />
        </div>
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>
      return (
        <BothMilestonePretestCard
          milestoneId={m.milestoneId}
          milestoneTitle={m.title}
          pathId={bp.path.id}
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
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
              sendMessage(`I just passed the quiz for "${m.title}". Show my updated Both learning path.`)
            }}
          />
        )
      }

      const first = filteredContent.find((c) =>
        (c.itemType === 'external' ? c.progress?.status : c.blockProgress?.status) !== 'completed'
      ) ?? filteredContent[0]

      if (!first) {
        return (
          <div className="my-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-brand-text-secondary">
            Preparing your content…{' '}
            <button
              type="button"
              onClick={() => onPathRefresh()}
              className="font-semibold underline"
              style={{ color: '#9f2063' }}
            >
              Refresh
            </button>
          </div>
        )
      }
      const firstIdx = filteredContent.indexOf(first)
      const nextItem = filteredContent[firstIdx + 1] ?? null
      return (
        <BothContentCard
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
      return `Showing content "${first?.title ?? 'n/a'}" in "${m.title}". The content card handles completion and advancing — do nothing else.`
    },
  })

  // ── Tool: displayBothContent ────────────────────────────────────────────────

  useFrontendTool({
    name: 'displayBothContent',
    description: 'Render one specific Both content item (YouTube video, article, or internal learning block).',
    parameters: z.object({ contentId: z.string() }),
    render: ({ status, args }) => {
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const bp = bothPathRef.current
      for (const m of bp.milestones) {
        const item = m.content.find((c) => c.id === args.contentId)
        if (item) {
          const itemIdx = m.content.indexOf(item)
          const nextItem = m.content[itemIdx + 1] ?? null
          return (
            <BothContentCard
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
          return `Showing "${item.title}" (${item.itemType}). The content card handles completion and advancing — do nothing else.`
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === args.milestoneId)
      if (!m) return <></>
      return (
        <BothMilestoneQuizCard
          milestoneId={m.milestoneId}
          milestoneTitle={m.title}
          pathId={bp.path.id}
          onPass={async () => {
            await onPathRefresh()
            sendMessage(`I just passed the quiz for "${m.title}". Show my updated Both learning path.`)
          }}
        />
      )
    },
    handler: async ({ milestoneId }) => {
      const bp = bothPathRef.current
      const m = bp.milestones.find((ms) => ms.milestoneId === milestoneId)
      if (!m) return 'Milestone not found.'
      return `Showing posttest quiz inline for "${m.title}".`
    },
  })

  // ── Delete path ────────────────────────────────────────────────────────────

  const handleDeletePath = async () => {
    setDeleteLoading(true)
    try {
      await apiFetch('/api/lms/both/path', { method: 'DELETE' })
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
            <p className="text-sm font-semibold text-white leading-tight">Learning Path (Both)</p>
            <p className="text-[10px] text-white/60 leading-tight">
              {bothPath.milestones.length} milestone{bothPath.milestones.length !== 1 ? 's' : ''} · Internal + External content
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
            agentId={BOTH_DELIVERY_AGENT}
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
              chatInputPlaceholder: 'Ask Sana about your learning path…',
              welcomeMessageText: "Hi! I'm Sana 👋\nLet's walk through your personalised learning path together.",
            }}
          />

          {showEmptyState && (
            <div className="absolute inset-0 z-10 flex flex-col bg-white overflow-y-auto">
              {noInternalContent && (
                <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[11px] text-amber-700">No SMEEP content matched your goals — showing external resources only.</p>
                </div>
              )}
              <div className="px-5 pt-6 pb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(120deg, #9f2063 0%, #7a1a4c 100%)' }}
                  >
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-base font-black text-brand-text-primary">Hi! I&apos;m Sana 👋</p>
                </div>
                <p className="text-xs text-brand-text-secondary leading-relaxed">
                  Here are your personalised milestones. Click a milestone to start — you&apos;ll answer a quick knowledge-check first, then dive into curated content.
                </p>
              </div>
              <div className="px-5 pb-6">
                <BothMilestoneGrid milestones={bothPath.milestones} onStart={startMilestone} />
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
