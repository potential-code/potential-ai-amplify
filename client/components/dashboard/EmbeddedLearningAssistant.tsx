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
import { useRouter } from 'next/navigation'
import { BookOpen, RefreshCw, RotateCcw, CheckCircle2, PlayCircle, FileText, ImageIcon, ListChecks, Send, Lock, Sparkles, Trash2 } from 'lucide-react'
import { COPILOT_AGENT } from './copilotConfig'
import { makeUuid } from './useStreamingVoice'
import {
  SmeepAssistantMessage,
  SmeepUserMessage,
  SmeepChatInput,
} from './chat-components'
import { cn } from '@/lib/utils'
import { RichContent } from '@/components/lms/RichContent'
import {
  apiCompleteLearningBlock,
  apiSaveQuestionAnswer,
  type ActiveLearningPath,
  type LearningPathBlock,
  type LearningPathMilestone,
} from '@/lib/api/lms'
import { apiFetch } from '@/lib/api'
import { RemoveLearningPathDialog } from '@/components/shared/RemoveLearningPathDialog'

// ── Constants ─────────────────────────────────────────────────────────────────

const LEARNING_INSTRUCTIONS = `You are Anna — AI Amplify's AI learning guide. You walk the user through their personalised learning path ONE block at a time.

YOUR GOLDEN RULES:
1. NEVER write, summarise, define, or invent learning content yourself. Block content is rendered ONLY by the tools below.
2. The user drives the flow by clicking cards. When they click, you get an explicit instruction telling you EXACTLY which tool to call with which id. Call that tool with that exact id and nothing else.
3. After calling displayBlock or openMilestone, output NO TEXT — not a single word. No greetings, no encouragement, no commentary, no "great choice", no "you've got this". The block card speaks for itself; staying silent is the correct behaviour.
4. NEVER list out all the blocks in a milestone. Blocks are delivered one after another — the block card carries its own Mark Complete button and auto-advances.
5. Do NOT call markBlockComplete yourself — completion is handled by the block card.

YOUR KNOWLEDGE OF THE CURRENT COURSE:
- __current_course__ holds the FULL content of the course the user is currently taking — its title, description, and every block's actual teaching text / video transcript / question prompts. This is your source of truth for what THIS course teaches. (__learning_path__ is only the high-level outline of all courses.)
- When __current_course__ says "No course selected yet", the user hasn't started a course — answer from your own general expertise.

WHEN THE USER ASKS A QUESTION OR FOR HELP:
- If the question relates to the current course or its material, INFER the answer from __current_course__ and use it to GUIDE the learner there — point them to the relevant block/idea, ask a leading question, surface the key concept from the content they should focus on. Guide them to it; do not just hand over the finished answer.
- For general conceptual, definitional, or "how do I…" questions not covered by the course content, help directly and concretely from your own expertise — a clear explanation, a concrete example, and how to apply it. (e.g. "what counts as a task?" → a single concrete action with a clear done-state you can finish in one focused sitting; if "email all my clients" is too big, help them break it into a real task like "draft the client email template".)
- Do NOT redirect the user to "check the card", a field, helper text, a checklist, or any button/CTA. NEVER invent or reference UI elements, fields, or features — if you are not certain something exists in the interface, do not mention it.
- The ONLY time you withhold a direct answer is a graded knowledge-check question that has a correct answer the learner is meant to recall — then guide them Socratically. Reflection prompts, action-plan/planning steps, surveys, and "how should I…" questions are NOT tests.
- Be practical; keep it to a few short sentences.

TOOL FLOW (always obey the explicit instruction text):
- Start / "show my path" / "view path" / "milestones" → showMilestones (clickable milestone cards)
- "Start milestone (id: X)" → openMilestone(X)  → renders the first block of that milestone, one at a time
- "Display block <id>" → displayBlock(<id>)  → renders exactly that block (this is how auto-advance works)
- "Open course page (courseId: X)" → openCoursePage(X)`

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  path: ActiveLearningPath
  onPathRefresh: () => void
  threadId?: string
  onResetThread?: () => void
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-brand-surface-2 bg-brand-surface p-4 my-2 animate-pulse space-y-2">
      <div className="h-3 w-2/3 bg-brand-surface-2 rounded" />
      <div className="h-2 w-full bg-brand-surface-2 rounded" />
      <div className="h-2 w-4/5 bg-brand-surface-2 rounded" />
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

// ── YouTube helpers ─────────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /embed\/([^?&]+)/]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

// YouTube IFrame player that reports when the video has fully played, so the
// "Mark Complete" gate can open. Loads the IFrame API once and reuses it.
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
      // Poll until the API is ready (robust across multiple players mounting).
      interval = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).YT?.Player) {
          if (interval) clearInterval(interval)
          createPlayer()
        }
      }, 200)
    }

    return () => {
      if (interval) clearInterval(interval)
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* noop */
      }
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

// ── Chat question renderer ────────────────────────────────────────────────────
// Renders question-type blocks inline. On submit it persists answers via
// apiSaveQuestionAnswer (same endpoint as the course-page SurveyBlock) and then
// notifies the parent card so it can unlock the Mark Complete button.

type ChatQuestionBlockProps = {
  block: LearningPathBlock
  onSubmitted: () => void
}

function ChatQuestionBlock({ block, onSubmitted }: ChatQuestionBlockProps) {
  type Answers = Record<string, number | string>
  const [answers, setAnswers] = useState<Answers>({})
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)

  const questions = block.questions

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
      // leave pending=false so user can retry; log so a failed save isn't silent
      console.warn('[learning-assistant] saving question answer failed', err)
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
            style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
          >
            <Send className="w-3 h-3" />
            {pending ? 'Submitting…' : 'Submit answers'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Learning block card ─────────────────────────────────────────────────────────
// Self-contained: renders one block's content, then a "Mark Complete" button.
// Gating: video blocks stay locked until the video finishes; question blocks
// until the answers are submitted; text/image are immediately completable.
// On completion it persists progress and asks the assistant to render the NEXT
// block (sequential delivery), or wraps up the milestone if it was the last.

type LearningBlockCardProps = {
  block: LearningPathBlock
  nextBlock: LearningPathBlock | null
  milestoneTitle: string
  onCompleted: () => void
  sendMessage: (text: string) => void
}

function LearningBlockCard({ block, nextBlock, milestoneTitle, onCompleted, sendMessage }: LearningBlockCardProps) {
  const alreadyDone = block.status === 'completed'
  const [videoEnded, setVideoEnded] = useState(false)
  const [questionsSubmitted, setQuestionsSubmitted] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)

  const isVideo = block.type === 'video' && !!block.videoUrl
  const isYouTube = isVideo && (block.videoUrl!.includes('youtube.com') || block.videoUrl!.includes('youtu.be'))
  const isQuestion = block.type === 'question' && block.questions.length > 0

  const done = alreadyDone || justCompleted

  // Gate logic — when may the user mark this block complete?
  const canComplete = (() => {
    if (done) return false
    if (isVideo) return videoEnded
    if (isQuestion) return questionsSubmitted
    return true
  })()

  // Persist completion + advance. `doComplete` skips the gate so it can be
  // triggered directly (e.g. auto-complete the moment a question is answered);
  // `handleComplete` is the gated button handler.
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
          `I just completed the final block of "${milestoneTitle}". Show my updated learning path with no extra commentary.`,
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

  function handleComplete() {
    void doComplete()
  }

  return (
    <div className="my-2 rounded-xl border border-brand-surface-2 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-surface-2 bg-brand-surface">
        <BlockTypeIcon type={block.type} className="text-brand-text-secondary" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-brand-text-primary truncate">
            {block.type === 'question' ? 'Reflection' : block.title}
          </p>
          <p className="text-[10px] text-brand-text-muted capitalize">{block.type} block</p>
        </div>
        {done && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {block.type === 'text' && block.body && (
          <RichContent content={block.body} className="text-xs" />
        )}

        {isVideo &&
          (isYouTube ? (
            <YouTubeVideo url={block.videoUrl!} onEnded={() => setVideoEnded(true)} />
          ) : (
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
              <video
                src={block.videoUrl!}
                controls
                onEnded={() => setVideoEnded(true)}
                className="w-full h-full"
              />
            </div>
          ))}

        {block.type === 'image' && block.imageUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={block.imageUrl} alt={block.title} className="max-w-full rounded-lg" />
          </div>
        )}

        {isQuestion && (
          <div className="rounded-lg bg-brand-surface border border-brand-surface-2 px-3 py-3">
            {block.body && <RichContent content={block.body} className="text-xs mb-3" />}
            <ChatQuestionBlock
              block={block}
              onSubmitted={() => {
                setQuestionsSubmitted(true)
                // Submitting a question block's answer completes it automatically.
                void doComplete()
              }}
            />
          </div>
        )}

        {/* Fallback for empty non-question blocks */}
        {block.type !== 'question' && !block.body && !block.videoUrl && !block.imageUrl && (
          <p className="text-xs text-brand-text-muted italic">No content available for this block.</p>
        )}
      </div>

      {/* Footer — Mark Complete gate */}
      {!done && (
        <div className="px-4 pb-4">
          {isVideo && !videoEnded && (
            <p className="flex items-center gap-1.5 text-[11px] text-brand-text-muted mb-2">
              <Lock className="w-3 h-3 shrink-0" />
              Finish watching the video to unlock completion.
            </p>
          )}
          {isQuestion && !questionsSubmitted && (
            <p className="flex items-center gap-1.5 text-[11px] text-brand-text-muted mb-2">
              <Lock className="w-3 h-3 shrink-0" />
              Submit your answer to unlock completion.
            </p>
          )}
          <button
            type="button"
            onClick={handleComplete}
            disabled={completing}
            className="w-full inline-flex items-center justify-center gap-1.5 cursor-pointer rounded-xl px-3 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {completing ? 'Marking complete…' : 'Mark Complete'}
          </button>
        </div>
      )}

      {/* Completed footer */}
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
  let raw = ''
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

// Stable no-op input — hides the chat input bar while the empty-state overlay is up.
const NullInput = () => null

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
function LearningUserMessage(props: ComponentProps<typeof SmeepUserMessage>) {
  const text = messageText(props.message?.content)
  // Machine-generated, not real user utterances — don't render a bubble at all.
  if (/^(Display block |submitBlockQuestion |I just completed the final block)/i.test(text.trim())) {
    return null
  }
  const cleaned = text.replace(/\s*\(id:\s*[^)]*\)/gi, '').trim()
  if (cleaned === text) return <SmeepUserMessage {...props} />
  return <SmeepUserMessage {...props} message={{ ...props.message, content: cleaned }} />
}

// ── Milestone grid (curated courses) ─────────────────────────────────────────────
// The set of curated "courses" (milestones) laid out as a responsive grid so the
// user can scan and pick one. Used by both the new-chat empty state and the
// in-chat "View Path" tool.

function MilestoneGrid({
  milestones,
  onStart,
}: {
  milestones: ActiveLearningPath['milestones']
  onStart: (themeId: string, title: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {milestones.map((m) => {
        const completed = m.blocks.filter((b) => b.status === 'completed').length
        const total = m.blocks.length
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0
        const done = pct === 100
        const title = m.theme?.title ?? 'Milestone'
        return (
          <button
            key={m.themeId}
            type="button"
            onClick={() => onStart(m.themeId, title)}
            className="group flex flex-col text-left cursor-pointer rounded-xl border border-brand-surface-2 bg-[#fdf5f9] overflow-hidden shadow-sm hover:border-brand-primary/50 hover:shadow-md transition-all"
            style={{ borderTop: '3px solid var(--color-brand-primary)' }}
          >
            <div className="flex flex-col flex-1 px-3.5 pt-3 pb-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-brand-text-primary line-clamp-2 leading-snug">{title}</p>
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <span
                    className="text-[9px] font-bold text-white px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                    style={{ background: 'linear-gradient(120deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
                  >
                    {completed > 0 ? 'Continue' : 'Start'}
                  </span>
                )}
              </div>
              {m.theme?.description && (
                <p className="text-[11px] text-brand-text-muted mt-1 line-clamp-2 flex-1">{m.theme.description}</p>
              )}
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-brand-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)' }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-brand-text-muted shrink-0">
                  {completed}/{total}
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EmbeddedLearningAssistant({ path, onPathRefresh, threadId, onResetThread }: Props) {
  const router = useRouter()
  const { copilotkit } = useCopilotKit()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRef = useRef<any>(null)
  // New-chat empty state: shows the curated-course grid on a fresh thread.
  const [showEmptyState, setShowEmptyState] = useState(true)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // The course (milestone) the user is currently taking. Its FULL content is fed
  // to the AI as context so it can ground course-related answers.
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null)

  // Stale closure fix: useFrontendTool freezes render/handler closures on
  // registration, so tools would otherwise read the initial `path` prop forever.
  // Every tool reads pathRef.current at call time to get the live value.
  const pathRef = useRef(path)
  pathRef.current = path

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

  // Begin a course (milestone): leave the empty state and ask the assistant to
  // open it. Shared by the empty-state grid and the in-chat "View Path" grid.
  const startCourse = useCallback(
    (themeId: string, title: string) => {
      setShowEmptyState(false)
      setActiveThemeId(themeId)
      sendMessage(`Start milestone "${title}" (id: ${themeId}).`)
    },
    [sendMessage],
  )

  // Reset to a fresh conversation: stop any run, clear visible messages, re-show
  // the curated-course grid, and mint a new backend thread so checkpoint history
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const livePath = pathRef.current
      return (
        <div className="my-2 space-y-2">
          <p className="text-xs font-semibold text-brand-text-secondary mb-1">Your Learning Path · tap a course to begin</p>
          <MilestoneGrid milestones={livePath.milestones} onStart={startCourse} />
        </div>
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const livePath = pathRef.current
      const milestone = livePath.milestones.find((m) => m.themeId === args.themeId)
      if (!milestone) return <></>
      const blocks = orderedBlocks(milestone)
      const first = blocks.find((b) => b.status !== 'completed') ?? blocks[0]
      if (!first) {
        return (
          <div className="my-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
            This milestone has no blocks yet.
          </div>
        )
      }
      return (
        <LearningBlockCard
          block={first}
          nextBlock={nextBlockOf(milestone, first.blockId)}
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
      if (status === ToolCallStatus.InProgress) return <CardSkeleton />
      const found = findBlockWithMilestone(args.blockId, pathRef.current)
      if (!found) return <></>
      return (
        <LearningBlockCard
          block={found.block}
          nextBlock={nextBlockOf(found.milestone, found.block.blockId)}
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

  return (
    <div className="smeep-copilot flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: 'linear-gradient(120deg, #1A0A12 0%, #2d0f20 100%)' }}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/10">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">Learning Path</p>
          <p className="text-[10px] text-white/60 leading-tight">
            {path.milestones.length} milestone{path.milestones.length !== 1 ? 's' : ''} · Guided by Anna
          </p>
        </div>
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          onClick={handleResetChat}
          disabled={!hasConversation}
          className="inline-flex items-center justify-center w-8 h-8 cursor-pointer rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Refresh learning path"
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

      {/* Chat */}
      <div className="relative flex-1 overflow-hidden smeep-assistant-chat">
        <CopilotChat
          agentId={COPILOT_AGENT}
          threadId={threadId}
          messageView={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            assistantMessage: SmeepAssistantMessage as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userMessage: LearningUserMessage as any,
          }}
          // Hide the input bar while the new-chat course grid overlay is shown.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input={(showEmptyState ? NullInput : SmeepChatInput) as any}
          labels={{
            chatInputPlaceholder: 'Ask Anna about your learning path…',
            welcomeMessageText: "Hi! I'm Anna 👋\nLet's walk through your personalised learning path together.",
          }}
        />

        {/* New-chat empty state: greeting + curated courses in a grid */}
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
                Here are your curated courses. Pick one to start learning — I&apos;ll walk you through it block by block.
              </p>
            </div>
            <div className="px-5 pb-6">
              <MilestoneGrid milestones={path.milestones} onStart={startCourse} />
            </div>
          </div>
        )}
      </div>
      <RemoveLearningPathDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeletePath}
        loading={deleteLoading}
        includeQuestionnaireNote={true}
      />
    </div>
  )
}
