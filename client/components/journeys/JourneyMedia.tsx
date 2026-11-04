'use client'

/**
 * Media and reflection pieces shared by the journey content cards: a YouTube
 * player that reports when the video (or a segment of it) has been watched,
 * and the inline reflection/question block that saves answers.
 */

import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { btn } from '@/components/kit'
import { cn } from '@/lib/utils'
import { apiSaveQuestionAnswer } from '@/lib/api/lms'
import { QuizChoice } from './JourneyCard'
import { VideoPlayer } from '@/components/media/VideoPlayer'

/** RichContent overrides so lesson text reads at body size on the ui tokens (dark mode safe). */
export const journeyProse =
  'prose-sm max-w-none text-[15px] leading-relaxed text-ui-text prose-p:text-[15px] prose-li:text-[15px] prose-headings:text-ui-text prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-[15px] prose-h4:text-[15px] prose-h5:text-[15px] prose-h6:text-[15px] prose-p:text-ui-text prose-strong:text-ui-text prose-em:text-ui-muted prose-ul:text-ui-text prose-ol:text-ui-text prose-li:text-ui-text prose-li:marker:text-ui-muted prose-a:text-ui-brand-text prose-blockquote:border-ui-line prose-blockquote:text-ui-muted prose-code:bg-ui-surface-2 prose-code:text-ui-text'

export function extractYouTubeId(url: string): string | null {
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /embed\/([^?&]+)/]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]!
  }
  return null
}

export function isYouTubeUrl(url: string | null | undefined): boolean {
  return !!url && (url.includes('youtube.com') || url.includes('youtu.be'))
}

/**
 * A journey video in AI Amplify's player (no YouTube links or suggestions, resumes
 * where the learner stopped). `onEnded` fires once the video, or the assigned
 * segment, has been watched; learners can't skip past what they've watched.
 */
export function YouTubeVideo({
  url,
  onEnded,
  startSeconds,
  endSeconds,
  title = 'Video',
  resumeAt,
  watchedPct,
  onSavePosition,
}: {
  url: string
  onEnded: () => void
  startSeconds?: number | null
  endSeconds?: number | null
  title?: string
  /** Saved on the server: where to resume, and how much was watched. */
  resumeAt?: number | null
  watchedPct?: number | null
  onSavePosition?: (positionSec: number, watchPct: number) => void
}) {
  return (
    <VideoPlayer
      url={url}
      title={title}
      gated
      startSeconds={startSeconds}
      endSeconds={endSeconds}
      onEnded={onEnded}
      resumeAt={resumeAt}
      watchedPct={watchedPct}
      onSavePosition={onSavePosition}
      className="rounded-[10px]"
    />
  )
}

/** Plain HTML5 video with the same "watched to the end" signal. */
export function FileVideo({ src, onEnded }: { src: string; onEnded: () => void }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-[10px] bg-black">
      <video src={src} controls onEnded={onEnded} className="h-full w-full" />
    </div>
  )
}

// ── Reflection / question block ────────────────────────────────────────────────

export interface ReflectionQuestion {
  id: string
  prompt: string
  format: string
  options?: string[] | null
  placeholder?: string | null
}

/**
 * Renders a block's questions inline. On submit it persists every answer via
 * the course-page question endpoint, then calls `onSubmitted` so the parent
 * card can complete the block.
 */
export function ReflectionQuestions({
  questions,
  onSubmitted,
  logTag,
}: {
  questions: ReflectionQuestion[]
  onSubmitted: () => void
  logTag: string
}) {
  type Answers = Record<string, number | string>
  const [answers, setAnswers] = useState<Answers>({})
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const allAnswered = questions.every((q) => {
    const ans = answers[q.id]
    if (q.format === 'short-text') return typeof ans === 'string' && ans.trim().length > 0
    return typeof ans === 'number'
  })

  async function handleSubmit() {
    if (!allAnswered || pending || submitted) return
    setPending(true)
    setFailed(false)
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
      // Leave the form editable so the learner can retry; log so a failed save isn't silent.
      setFailed(true)
      console.warn(`[${logTag}] saving question answer failed`, err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-semibold leading-snug text-ui-text">{q.prompt}</legend>
          {q.format === 'short-text' ? (
            <textarea
              maxLength={10_000}
              value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              disabled={submitted}
              placeholder={q.placeholder ?? 'Write your answer'}
              rows={3}
              aria-label={q.prompt}
              className={cn(
                'w-full resize-none rounded-[10px] border bg-ui-surface px-3 py-2.5 text-sm text-ui-text placeholder:text-ui-muted focus:border-ui-brand focus:outline-none focus:ring-2 focus:ring-ui-brand/20',
                submitted ? 'border-ui-ok/40' : 'border-ui-line',
              )}
            />
          ) : (
            <div role="radiogroup" aria-label={q.prompt} className="flex flex-col gap-2">
              {(q.format === 'true-false' ? ['True', 'False'] : (q.options ?? [])).map((opt, idx) => (
                <QuizChoice
                  key={idx}
                  selected={answers[q.id] === idx}
                  disabled={submitted}
                  onSelect={() => !submitted && setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                >
                  {opt}
                </QuizChoice>
              ))}
            </div>
          )}
        </fieldset>
      ))}

      {submitted ? (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ui-ok">
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Answers submitted
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {failed && <span className="text-[13px] text-ui-danger">That did not save. Try again.</span>}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!allAnswered || pending}
            className={cn(btn({ variant: 'primary', size: 'md' }), 'h-9')}
          >
            <Send className="h-4 w-4" aria-hidden />
            {pending ? 'Submitting' : 'Submit answers'}
          </button>
        </div>
      )}
    </div>
  )
}
