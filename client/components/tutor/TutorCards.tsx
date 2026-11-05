'use client'

/**
 * The folio inserts Anna opens in the Multi Learning conversation. Intro,
 * video and quiz cards receive only an ID from Anna and load AI Amplify's own
 * content; the summary is the one card she writes. Ported from the VX Academy
 * tutor cards onto the Anna Studio folio primitives.
 *
 * Each card's next action is the only accent element on screen. Once its step
 * is done (per the course state), the action gives way to a quiet "done" mark,
 * so an old card can never push the learner backwards.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, ArrowRight, Check, CircleCheck, Loader2, RotateCcw } from 'lucide-react'
import { FolioInsert, NextAction, ResultBand, FolioSkeleton } from '@/components/learning-ui/FolioCard'
import { ProgressBar } from '@/components/kit'
import { QuizOption, QuizSegments } from '@/components/learning-ui/QuizBits'
import type { ActionPlan, Quiz, QuizResult, UnitIntro, VideoLesson } from './api'
import { useTutor } from './context'
import { VideoPlayer, youTubeId } from '@/components/media/VideoPlayer'

/**
 * Marks the message a card's Continue button sends. Anna's graph requires a
 * card on that turn: left free, she sometimes replied "let's move on" and
 * opened nothing.
 */
export const NEXT_MARKER = '[next] '
/** Marks the hidden message that carries a graded quiz result. */
export const QUIZ_RESULT_MARKER = '[quiz-result] '
/** Marks the hidden message that carries the learner's saved action plan. */
export const ACTION_PLAN_MARKER = '[action-plan] '

// ── Shared ─────────────────────────────────────────────────────────────────

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    setData(null)
    setError(false)
    load()
      .then((d) => live && setData(d))
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error }
}

function Failed() {
  const { ui, send } = useTutor()
  return (
    <FolioInsert latest={false}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ui-text">{ui.couldNotLoad}</p>
        <button
          type="button"
          className="sana-quiet"
          onClick={() => void send(NEXT_MARKER + 'Continue.', { hidden: true })}
        >
          <RotateCcw className="w-4 h-4" aria-hidden /> {ui.tryAgain}
        </button>
      </div>
    </FolioInsert>
  )
}

/**
 * An introduction or a summary is done once the learner has it in front of
 * them. Recording it on display (not only on the Continue button) keeps the
 * course state true when the learner types "continue" instead.
 */
function useRecordWhenShown(blockIds: string[] | null, active: boolean, onRecorded?: () => void) {
  const { api, refresh } = useTutor()
  const done = useRef(false)
  const key = blockIds?.join(',') ?? ''
  useEffect(() => {
    if (!active || !blockIds || done.current) return
    done.current = true
    void (async () => {
      try {
        if (blockIds.length) await api.complete(blockIds)
        onRecorded?.()
        await refresh()
      } catch {
        done.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])
}

/** Tell Anna what this card shows while it is the one in hand. */
function useScreen(description: string | null) {
  const { setOnScreen } = useTutor()
  useEffect(() => {
    if (description) setOnScreen(description)
  }, [description, setOnScreen])
}

function DoneMark() {
  const { ui } = useTutor()
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ui-muted">
      <CircleCheck className="w-4 h-4 text-ui-ok" aria-hidden /> {ui.done}
    </span>
  )
}

/** The forward arrow in the reading direction. */
function Forward() {
  const { dir } = useTutor()
  return dir === 'rtl' ? <ArrowLeft className="w-4 h-4" aria-hidden /> : <ArrowRight className="w-4 h-4" aria-hidden />
}

function Backward() {
  const { dir } = useTutor()
  return dir === 'rtl' ? <ArrowRight className="w-4 h-4" aria-hidden /> : <ArrowLeft className="w-4 h-4" aria-hidden />
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[14px] leading-[1.7] text-ui-text space-y-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-[14px] [&_h3]:font-semibold [&_h4]:text-[14px] [&_h4]:font-semibold [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: () => null }}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

// ── Course list ────────────────────────────────────────────────────────────

export function CoursesCard({ latest }: { latest: boolean }) {
  const { ui, state, openCourse, running } = useTutor()
  const [opening, setOpening] = useState<string | null>(null)
  const courses = state?.courses ?? []
  useScreen(latest ? 'The list of the learner’s enrolled courses is open; they pick one with its button.' : null)

  return (
    <FolioInsert title={ui.yourCourses} kind={ui.pickOne} latest={latest}>
      {courses.length === 0 && (
        <p className="text-sm text-ui-text">{ui.noCourses}</p>
      )}
      <div className="space-y-2">
        {courses.map((c) => (
          <button
            key={c.courseId}
            type="button"
            disabled={running || opening !== null}
            onClick={async () => {
              setOpening(c.courseId)
              try {
                await openCourse(c.courseId, c.name)
              } finally {
                setOpening(null)
              }
            }}
            className="w-full text-start rounded-[10px] border border-ui-line bg-ui-surface px-4 py-3 transition-colors hover:bg-ui-surface-2 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-brand"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold text-ui-text">{c.name}</span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold flex-none text-ui-brand-text">
                {opening === c.courseId ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : c.complete ? (
                  ui.review
                ) : c.progress > 0 ? (
                  ui.resume
                ) : (
                  ui.start
                )}
              </span>
            </span>
            <span className="mt-2 flex items-center gap-2.5">
              <ProgressBar value={c.progress} className="flex-1" />
              <span className="text-xs font-medium flex-none tabular-nums text-ui-muted">
                {c.complete ? ui.complete : c.progress > 0 ? `${c.progress}%` : ui.notStarted}
              </span>
            </span>
          </button>
        ))}
      </div>
    </FolioInsert>
  )
}

// ── Unit intro ─────────────────────────────────────────────────────────────

export function UnitIntroCard({ unitId, latest }: { unitId: string; latest: boolean }) {
  const { ui, api, stepFor, refresh, send, markIntroSeen } = useTutor()
  const { data, error } = useLoad<UnitIntro>(() => api.unitIntro(unitId), [unitId])
  const [busy, setBusy] = useState(false)
  useScreen(latest && data ? `The introduction to the unit "${data.title}" is open.` : null)
  const placed = stepFor('intro', unitId)
  const introBlocks = placed?.step.kind === 'intro' && !placed.step.done ? placed.step.blockIds : null
  useRecordWhenShown(introBlocks, latest && Boolean(data), () => markIntroSeen(unitId))

  const onContinue = useCallback(async () => {
    setBusy(true)
    try {
      const blockIds = placed?.step.kind === 'intro' ? placed.step.blockIds : []
      if (blockIds.length) await api.complete(blockIds)
      else markIntroSeen(unitId)
      await refresh()
      await send(NEXT_MARKER + 'Continue.', { hidden: true })
    } finally {
      setBusy(false)
    }
  }, [api, markIntroSeen, placed, refresh, send, unitId])

  if (error) return <Failed />
  if (!data) return <FolioSkeleton />

  return (
    <FolioInsert
      title={data.title}
      kind={placed ? `${ui.introductionKind} · ${ui.unitN(placed.unitOrder)}` : ui.introductionKind}
      latest={latest}
      footer={
        <>
          <span />
          {latest ? (
            <NextAction busy={busy} onClick={onContinue}>
              {ui.continue} <Forward />
            </NextAction>
          ) : (
            <DoneMark />
          )}
        </>
      }
    >
      {data.introduction ? (
        <Markdown>{data.introduction}</Markdown>
      ) : data.description ? (
        <Markdown>{data.description}</Markdown>
      ) : (
        <p className="text-sm text-ui-text">{ui.letsBegin}</p>
      )}
      {data.outcomes.length > 0 && (
        <>
          <p className="mt-4 mb-2 text-[13px] font-semibold text-ui-muted">{ui.whatYoullLearn}</p>
          <ul className="space-y-1.5">
            {data.outcomes.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] text-ui-text">
                <Check className="w-4 h-4 mt-0.5 flex-none text-ui-ok" aria-hidden />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </FolioInsert>
  )
}

// ── Video ──────────────────────────────────────────────────────────────────


export function VideoCard({ learningBlockId, latest }: { learningBlockId: string; latest: boolean }) {
  const { ui, api, stepFor, refresh, send } = useTutor()
  const { data, error } = useLoad<VideoLesson>(() => api.video(learningBlockId), [learningBlockId])
  const [watched, setWatched] = useState(false)
  const [busy, setBusy] = useState(false)
  const placed = stepFor('video', learningBlockId)
  const recorded = placed?.step.done ?? false
  // The video's one question, answered under it before moving on.
  const check = data?.check ?? null
  const [picked, setPicked] = useState<number | null>(null)
  const [verdict, setVerdict] = useState<{ correct: boolean; correctIndex: number } | null>(null)
  const [checking, setChecking] = useState(false)
  const chosen = picked ?? check?.answered ?? null
  const answered = !check || verdict !== null || check.answered !== null
  useScreen(
    latest && data
      ? `The video "${data.title}" is open${recorded || watched ? ' and has been watched' : '; the learner has not finished watching it'}.` +
          (check
            ? answered
              ? ' Its quick check question has been answered.'
              : ` Under it is a quick check question the learner has not answered yet: "${check.text}" Never say or hint which option is correct.`
            : '')
      : null,
  )

  const onPick = useCallback(
    async (index: number) => {
      if (!check || answered || checking) return
      setPicked(index)
      setChecking(true)
      try {
        setVerdict(await api.answerCheck(check.questionId, index))
      } catch {
        setPicked(null)
      } finally {
        setChecking(false)
      }
    },
    [answered, api, check, checking],
  )

  const onEnded = useCallback(async () => {
    setWatched(true)
    try {
      await api.complete([learningBlockId])
      await refresh()
    } catch {
      /* the Continue press retries the save */
    }
  }, [api, learningBlockId, refresh])

  const onContinue = useCallback(async () => {
    setBusy(true)
    try {
      if (!recorded) await api.complete([learningBlockId])
      await refresh()
      await send(NEXT_MARKER + 'Continue.', { hidden: true })
    } finally {
      setBusy(false)
    }
  }, [api, learningBlockId, recorded, refresh, send])

  if (error) return <Failed />
  if (!data) return <FolioSkeleton />
  const id = youTubeId(data.videoUrl)
  const seen = watched || recorded
  // Nothing is locked behind watching: only the video's question must be answered.
  const canContinue = answered

  return (
    <FolioInsert
      title={placed?.unitName ?? data.title}
      kind={[ui.videoKind, placed ? ui.unitN(placed.unitOrder) : ''].filter(Boolean).join(' · ')}
      latest={latest}
      footer={
        <>
          <span className={seen && canContinue ? 'inline-flex items-center gap-1.5 text-[13px] font-medium text-ui-ok' : 'text-[13px] text-ui-muted'}>
            {seen && canContinue && <Check className="w-4 h-4" aria-hidden />}
            {!canContinue ? ui.answerToContinue : seen ? ui.watched : ''}
          </span>
          {latest ? (
            <NextAction gated={!canContinue} busy={busy} onClick={onContinue}>
              {ui.continue} <Forward />
            </NextAction>
          ) : (
            <DoneMark />
          )}
        </>
      }
    >
      {id ? (
        // AI Amplify's own player: no YouTube links or suggestions, and it resumes.
        // Learners may skip ahead; watching to the end also records the step.
        <VideoPlayer url={data.videoUrl} title={data.title} onEnded={onEnded} className="rounded-[10px]" />
      ) : (
        <div className="relative w-full overflow-hidden rounded-[10px] bg-[#17171C]" style={{ aspectRatio: '16 / 9' }}>
          <a
            href={data.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 grid place-items-center text-white underline text-[14px]"
          >
            {data.title}
          </a>
        </div>
      )}
      {check && (
        <div className="mt-4">
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ui-muted">{ui.quickCheck}</p>
          <p className="mb-3 text-[15px] font-semibold text-ui-text">{check.text}</p>
          <div className="space-y-2" aria-busy={checking || undefined}>
            {check.options.map((option, i) => (
              <QuizOption key={i} index={i} selected={chosen === i} onSelect={() => void onPick(i)}>
                {option}
              </QuizOption>
            ))}
          </div>
          {verdict && (
            <p
              className={verdict.correct ? 'mt-2.5 text-[13px] font-medium text-ui-ok' : 'mt-2.5 text-[13px] font-medium'}
              style={verdict.correct ? undefined : { color: 'var(--sana-warn)' }}
              role="status"
            >
              {verdict.correct ? ui.checkRight : ui.checkWrong(check.options[verdict.correctIndex] ?? '')}
            </p>
          )}
        </div>
      )}
    </FolioInsert>
  )
}

// ── Summary ────────────────────────────────────────────────────────────────

export function SummaryCard({
  unitId,
  title,
  content,
  keyPoints,
  latest,
}: {
  unitId: string
  title?: string
  content?: string
  keyPoints?: string[]
  latest: boolean
}) {
  const { ui, api, stepFor, refresh, send } = useTutor()
  const [busy, setBusy] = useState(false)
  const placed = stepFor('reading', unitId)
  const readingBlocks = placed?.step.kind === 'reading' && !placed.step.done ? placed.step.blockIds : null
  useRecordWhenShown(readingBlocks, latest && Boolean(content))
  useScreen(latest && title ? `Anna's summary of the unit ("${title}") is open.` : null)

  const onContinue = useCallback(async () => {
    setBusy(true)
    try {
      if (placed?.step.kind === 'reading') await api.complete(placed.step.blockIds)
      await refresh()
      await send(NEXT_MARKER + 'Continue.', { hidden: true })
    } finally {
      setBusy(false)
    }
  }, [api, placed, refresh, send])

  return (
    <FolioInsert
      title={title ?? '…'}
      kind={placed ? `${ui.readingKind} · ${ui.unitN(placed.unitOrder)}` : ui.readingKind}
      latest={latest}
      footer={
        <>
          <span />
          {latest ? (
            <NextAction gated={!content} busy={busy} onClick={onContinue}>
              {ui.continue} <Forward />
            </NextAction>
          ) : (
            <DoneMark />
          )}
        </>
      }
    >
      {content && <Markdown>{content}</Markdown>}
      {keyPoints && keyPoints.length > 0 && (
        <>
          <p className="mt-4 mb-2 text-[13px] font-semibold text-ui-muted">{ui.keyPoints}</p>
          <ul className="space-y-1.5">
            {keyPoints.map((k, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] text-ui-text">
                <Check className="w-4 h-4 mt-0.5 flex-none text-ui-ok" aria-hidden />
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </FolioInsert>
  )
}

// ── Action plan ────────────────────────────────────────────────────────────

export function ActionPlanCard({ learningBlockId, latest }: { learningBlockId: string; latest: boolean }) {
  const { ui, api, stepFor, refresh, send, running } = useTutor()
  const { data, error } = useLoad<ActionPlan>(() => api.actionPlan(learningBlockId), [learningBlockId])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const placed = stepFor('action-plan', learningBlockId)
  const recorded = placed?.step.done ?? data?.done ?? false
  const saved = recorded || justSaved

  // Pre-fill with whatever the learner saved before (a revisit shows their plan).
  useEffect(() => {
    if (!data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const p of data.prompts) if (next[p.questionId] === undefined && p.answer) next[p.questionId] = p.answer
      return next
    })
  }, [data])

  useScreen(
    latest && data
      ? saved
        ? `The action plan for "${data.title}" has been saved.`
        : `The action plan for "${data.title}" is open. Prompts: ${data.prompts.map((p) => `"${p.prompt}"`).join('; ')}. The learner writes their own plan; help with ideas if asked, never write it for them.`
      : null,
  )

  const submit = useCallback(async () => {
    if (!data) return
    setBusy(true)
    setFailed(null)
    try {
      const answers = data.prompts.map((p) => ({ questionId: p.questionId, text: (drafts[p.questionId] ?? '').trim() }))
      await api.submitActionPlan(learningBlockId, answers)
      setJustSaved(true)
      await refresh()
      // The marker tells Anna's graph this carries the learner's plan, so she
      // reacts to it in a sentence before the next card.
      const quoted = data.prompts
        .map((p) => `${p.prompt} — "${(drafts[p.questionId] ?? '').trim().slice(0, 400)}"`)
        .join('\n')
      await send(`${ACTION_PLAN_MARKER}I wrote my action plan:\n${quoted}`, { hidden: true })
    } catch (e) {
      setFailed(e instanceof Error ? e.message : ui.couldNotLoad)
    } finally {
      setBusy(false)
    }
  }, [api, data, drafts, learningBlockId, refresh, send, ui])

  if (error) return <Failed />
  if (!data) return <FolioSkeleton />

  const allFilled = data.prompts.every((p) => (drafts[p.questionId] ?? '').trim().length > 0)

  return (
    <FolioInsert
      title={data.title}
      kind={placed ? `${ui.actionPlanKind} · ${ui.unitN(placed.unitOrder)}` : ui.actionPlanKind}
      latest={latest}
      footer={
        <>
          <span className={saved ? 'text-[13px] font-medium text-ui-ok' : 'text-[13px] text-ui-muted'}>
            {saved ? ui.planSaved : ui.actionPlanHint}
          </span>
          {saved ? (
            <DoneMark />
          ) : (
            <NextAction gated={!allFilled} busy={busy} onClick={submit}>
              {busy ? ui.savingPlan : ui.savePlan} <Forward />
            </NextAction>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {data.prompts.map((p) => (
          <div key={p.questionId}>
            <label htmlFor={`ap-${learningBlockId}-${p.questionId}`} className="block text-[14px] font-semibold mb-1.5 text-ui-text">
              {p.prompt}
            </label>
            {saved ? (
              <p
                id={`ap-${learningBlockId}-${p.questionId}`}
                className="whitespace-pre-wrap rounded-[10px] border border-ui-line bg-ui-surface-2 px-3.5 py-2.5 text-[14px] leading-relaxed text-ui-text"
              >
                {drafts[p.questionId] ?? p.answer ?? ''}
              </p>
            ) : (
              <textarea
                id={`ap-${learningBlockId}-${p.questionId}`}
                rows={3}
                value={drafts[p.questionId] ?? ''}
                maxLength={4000}
                placeholder={p.placeholder ?? ui.planPlaceholder}
                disabled={busy || running}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.questionId]: e.target.value }))}
                className="w-full resize-y rounded-[10px] border border-ui-line bg-ui-surface px-3.5 py-2.5 text-[14px] leading-relaxed text-ui-text outline-none transition-colors placeholder:text-ui-muted focus:border-ui-brand focus:ring-2 focus:ring-ui-brand/20 disabled:opacity-60"
                style={{ minHeight: 84 }}
              />
            )}
          </div>
        ))}
      </div>
      {failed && (
        <p className="mt-2.5 text-[13px] font-medium" style={{ color: 'var(--sana-warn)' }} role="alert">
          {failed}
        </p>
      )}
    </FolioInsert>
  )
}

// ── Pre-test and final exam ────────────────────────────────────────────────

export function TutorQuizCard({ assessmentId, latest }: { assessmentId: string; latest: boolean }) {
  const { ui, api, refresh, send, running } = useTutor()
  const { data, error } = useLoad<Quiz>(() => api.quiz(assessmentId), [assessmentId])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const shown = data?.questions[index]
  const pre = data?.kind === 'pre'
  const what = pre ? 'pre-test' : 'final exam'
  useScreen(
    latest && data
      ? result
        ? pre
          ? `The pre-test "${data.title}" has been submitted: ${result.correctCount} of ${result.gradedCount} correct (${result.score}%). It has no pass mark; this is the learner's starting point and the lessons are open.`
          : `The final exam "${data.title}" has been submitted: ${result.correctCount} of ${result.gradedCount} correct (${result.score}%), ${result.passed ? 'passed' : 'not passed'}.`
        : shown
          ? `The ${what} "${data.title}" is the learner's current step, at question ${index + 1} of ${data.questions.length}: "${shown.text}" Options: ${shown.options
              .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
              .join('; ')}. The learner has not submitted yet. Never say or hint which option is correct.`
          : null
      : null,
  )

  const submit = useCallback(async () => {
    if (!data) return
    setBusy(true)
    setFailed(null)
    try {
      const r = await api.submitQuiz(
        assessmentId,
        data.questions.map((q) => ({ questionId: q.questionId, selectedIndex: answers[q.questionId] ?? -1 })),
      )
      setResult(r)
      await refresh()
      // The marker tells Anna's graph this is the graded result, so she
      // answers with a sentence about the score before the next card.
      const left = r.maxAttempts > 0 ? Math.max(0, r.maxAttempts - r.attemptsUsed) : -1
      await send(
        QUIZ_RESULT_MARKER +
          (r.kind === 'pre' && r.passed
            ? `AI Amplify recorded my pre-test: ${r.correctCount} of ${r.gradedCount} correct, ${r.score}%. It has no pass mark: this is my starting point, and the lessons are open.`
            : `AI Amplify graded my ${r.kind === 'pre' ? 'pre-test' : 'final exam'}: ${r.correctCount} of ${r.gradedCount} correct, ${r.score}% (pass mark ${r.passingScore}%), ${r.passed ? 'PASSED' : 'NOT passed'}.${!r.passed && left >= 0 ? ` ${left} attempts left.` : ''}`),
        { hidden: true },
      )
    } catch (e) {
      setFailed(e instanceof Error ? e.message : ui.couldNotLoad)
    } finally {
      setBusy(false)
    }
  }, [answers, api, assessmentId, data, refresh, send, ui])

  if (error) return <Failed />
  if (!data) return <FolioSkeleton />

  // An older, unanswered copy of a quiz that has been opened again further
  // down disappears: the copy below is the quiz. (A copy that was submitted
  // keeps its result, e.g. a first attempt before a retake.)
  const locked = data.maxAttempts > 0 && data.attemptsUsed >= data.maxAttempts
  if (!latest && !result && !data.passed && !locked) return null

  const kind = pre ? ui.preTestKind : ui.finalExamKind

  if (result && pre && result.passed) {
    return (
      <FolioInsert title={data.title} kind={kind} latest={latest}>
        <ResultBand tone="good" score={`${result.score}%`}>
          <b>{ui.startingPoint}</b>
          <br />
          {ui.correctOf(result.correctCount, result.gradedCount)} · {ui.lessonsOpen}
        </ResultBand>
      </FolioInsert>
    )
  }

  if (result) {
    const left = result.maxAttempts > 0 ? Math.max(0, result.maxAttempts - result.attemptsUsed) : -1
    return (
      <FolioInsert title={data.title} kind={kind} latest={latest}>
        <ResultBand tone={result.passed ? 'good' : 'warn'} score={`${result.score}%`}>
          <b>{result.passed ? ui.passedTitle : ui.notPassedTitle}</b>
          <br />
          {ui.correctOf(result.correctCount, result.gradedCount)} · {ui.passMark(result.passingScore)}
          {!result.passed && left >= 0 && ` · ${left > 0 ? ui.attemptsLeft(left) : ui.noAttemptsLeft}`}
        </ResultBand>
      </FolioInsert>
    )
  }

  if (data.passed || locked) {
    return (
      <FolioInsert title={data.title} kind={kind} latest={latest}>
        <p className="text-sm text-ui-text">{data.passed ? ui.alreadyPassed : ui.noAttemptsLeft}</p>
      </FolioInsert>
    )
  }

  const q = data.questions[index]
  const total = data.questions.length
  const last = index === total - 1
  const answered = q ? answers[q.questionId] !== undefined : false
  const allAnswered = data.questions.every((x) => answers[x.questionId] !== undefined)

  return (
    <FolioInsert title={data.title} kind={kind} latest={latest}>
      <div className="flex items-center justify-between gap-3 mb-2 text-[13px] text-ui-muted">
        <span>{ui.questionOf(index + 1, total)}</span>
        {data.maxAttempts > 0 && <span>{ui.attemptsLeft(Math.max(0, data.maxAttempts - data.attemptsUsed))}</span>}
      </div>
      <QuizSegments total={total} current={index} />
      <p className="text-[15px] font-semibold text-ui-text mb-3">{q?.text}</p>
      <div className="space-y-2">
        {q?.options.map((option, i) => (
          <QuizOption
            key={i}
            index={i}
            selected={answers[q.questionId] === i}
            onSelect={() => setAnswers((a) => ({ ...a, [q.questionId]: i }))}
          >
            {option}
          </QuizOption>
        ))}
      </div>
      {failed && (
        <p className="mt-2.5 text-[13px] font-medium" style={{ color: 'var(--sana-warn)' }} role="alert">
          {failed}
        </p>
      )}
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <button
          type="button"
          className="sana-quiet disabled:opacity-40"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          <Backward /> {ui.previous}
        </button>
        {last ? (
          <button type="button" className="sana-next" disabled={!allAnswered || busy || running} onClick={submit}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {busy ? ui.submitting : ui.submit}
          </button>
        ) : (
          <button type="button" className="sana-quiet disabled:opacity-40" disabled={!answered} onClick={() => setIndex((i) => i + 1)}>
            {ui.next} <Forward />
          </button>
        )}
      </div>
    </FolioInsert>
  )
}
