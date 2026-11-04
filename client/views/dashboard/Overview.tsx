'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Award, BookOpenCheck, Check, ChevronRight, Flame, Mic, Play, Trophy } from 'lucide-react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { LearningPathPanel } from '@/components/both/LearningPathPanel'
import { useCopilotTokenReady, getCopilotHeaders } from '@/components/dashboard/copilotConfig'
import { Avatar, Card, CoverTile, EmptyState, ProgressBar, SectionHeader, Skeleton, btn } from '@/components/kit'
import { getUser } from '@/lib/auth'
import { getMyAiMentors } from '@/lib/dashboardData'
import { fetchLearnerCourses, fetchUserCertificates } from '@/lib/api/lms'
import { cancelSmeSession, getSmeSessions, getMentors, type SmeSession } from '@/lib/api/sme'
import { fetchOffers } from '@/lib/api/offers'
import { fetchMyEvents, type LiveEvent } from '@/lib/api/liveEvents'
import { eventPhaseAt, timeLabel, useNow } from '@/lib/events/eventTime'
import { fetchStreak, type Streak } from '@/lib/api/redesign'
import { useDictation } from '@/components/tutor/useVoice'
import { courseHref, sortByRecent, topicIcon, useCourseSummaries, type CourseListItem, type CourseSummary } from '@/components/learner/courseProgress'
import { cn } from '@/lib/utils'
import { useNarrow } from '@/lib/useNarrow'
import { AnnouncementBanner } from '@/components/dashboard/AnnouncementBanner'

const SANA_AVATAR = '/images/redesign/anna-avatar-96.png'
/** Ask Anna reads this on arrival and sends it as the first message. */
// CopilotKit v2 runtime (multi-route Express handler: /info, /transcribe,
// /agent/:id/run) for the learning-path panel.
const AI_BACKEND_URL = (process.env.NEXT_PUBLIC_AI_BACKEND_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'
const VOICE_RUNTIME_URL = `${AI_BACKEND_URL}/copilotkit-voice`

export const ASK_SANA_PENDING_KEY = 'smeep.askSana.pending'

function timeGreeting(d = new Date()) {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardOverview() {
  const user = getUser()
  const firstName = (user?.fullName ?? 'there').split(' ')[0]
  const aiMentors = getMyAiMentors()

  const { data: allCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['learner-courses'],
    queryFn: fetchLearnerCourses,
  })
  const courses = allCourses as CourseListItem[]
  const { data: certificates = [] } = useQuery({
    queryKey: ['user-certificates'],
    queryFn: fetchUserCertificates,
  })
  const { data: offersData } = useQuery({ queryKey: ['offers'], queryFn: fetchOffers })
  const { data: liveEvents = [] } = useQuery({
    queryKey: ['live-events', 'mine'],
    queryFn: fetchMyEvents,
  })
  const now = useNow()
  const { data: apiMentors = [] } = useQuery({ queryKey: ['mentors'], queryFn: getMentors })
  const streakQuery = useQuery({ queryKey: ['me-streak'], queryFn: fetchStreak, retry: false })

  const inProgress = useMemo(() => courses.filter((c) => c.isEnrolled && c.progressPercentage < 100), [courses])
  const { byId: summaries, isLoading: summariesLoading } = useCourseSummaries(inProgress.map((c) => c.id))
  const inProgressSorted = useMemo(() => [...inProgress].sort((a, b) => sortByRecent(summaries.get(a.id), summaries.get(b.id))), [inProgress, summaries])
  const current = inProgressSorted[0] ?? null
  const currentSummary = current ? summaries.get(current.id) : undefined
  const explore = useMemo(() => courses.filter((c) => !c.isEnrolled).slice(0, 4), [courses])

  // "Welcome back" only for someone who has been here before; a brand-new
  // account must not be greeted as returning. A previous dashboard visit on
  // this device, or any enrolment, counts as returning.
  const [visitedBefore, setVisitedBefore] = useState(false)
  // Decide once per mount: StrictMode re-runs effects in development, and the
  // second run would read back the flag the first run just wrote.
  const greetingDecided = useRef(false)
  useEffect(() => {
    if (!user?.id || greetingDecided.current) return
    greetingDecided.current = true
    const key = `smeep.dashboardVisited.${user.id}`
    try {
      if (localStorage.getItem(key)) setVisitedBefore(true)
      else localStorage.setItem(key, '1')
    } catch {
      /* private mode: treat as a first visit */
    }
  }, [user?.id])
  const returning = visitedBefore || courses.some((c) => c.isEnrolled)

  const [smeSessions, setSmeSessions] = useState<SmeSession[]>([])
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  useEffect(() => {
    getSmeSessions()
      .then(({ upcoming }) => setSmeSessions(upcoming.slice(0, 2)))
      .catch(() => {})
  }, [])
  async function handleCancelSession(id: string) {
    setCancellingId(id)
    try {
      await cancelSmeSession(id)
      setSmeSessions((prev) => prev.filter((s) => s.id !== id))
      toast.success('Session cancelled')
    } catch {
      toast.error('Could not cancel the session. Please try again.')
    } finally {
      setCancellingId(null)
    }
  }

  const upcomingEvents = useMemo(
    () =>
      now === null
        ? []
        : liveEvents
            .filter((e) => eventPhaseAt(e, now) !== 'ended')
            // What they booked first, then soonest first.
            .sort((a, b) => Number(!!b.booked) - Number(!!a.booked) || a.startsAt.localeCompare(b.startsAt))
            .slice(0, 2),
    [liveEvents, now],
  )

  const subtitle = currentSummary
    ? currentSummary.allUnitsDone
      ? `Every unit of ${currentSummary.title} is done. The final exam is next.`
      : `You're on Unit ${currentSummary.currentUnitNumber} of ${currentSummary.title}. One unit step a day keeps your streak going.`
    : inProgress.length > 0
      ? `You have ${inProgress.length} course${inProgress.length === 1 ? '' : 's'} in progress.`
      : 'Start a course today and build skills that move your business forward.'

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ui-text sm:text-[28px] sm:leading-tight">
            {returning ? timeGreeting() : 'Welcome'}, {firstName}
          </h1>
          <p className="max-w-[70ch] text-[15px] text-ui-muted">{subtitle}</p>
        </header>

        <AnnouncementBanner />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ContinueCard
            loading={coursesLoading || (!!current && summariesLoading && !currentSummary)}
            course={current}
            summary={currentSummary}
            hasCourses={courses.some((c) => c.isEnrolled)}
          />
          <StreakCard
            streak={streakQuery.data}
            loading={streakQuery.isLoading}
            failed={streakQuery.isError}
            points={offersData?.userPoints ?? 0}
            offersCount={offersData?.offers.length ?? 0}
          />
        </div>

        <AskSanaBar />

        <LearningPathSection />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <InProgressCard loading={coursesLoading} courses={inProgressSorted} summaries={summaries} />
          <ComingUpCard
            sessions={smeSessions}
            events={upcomingEvents}
            mentor={apiMentors[0] ?? null}
            cancellingId={cancellingId}
            onCancel={handleCancelSession}
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="@container">
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <h2 className="text-base font-semibold text-ui-text">AI mentors</h2>
              <Link href="/dashboard/ai-mentors" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
                All AI mentors
              </Link>
            </div>
            <p className="px-5 pt-0.5 text-[13px] text-ui-muted">Specialist coaches you can chat with any time.</p>
            <ul className="grid grid-cols-1 gap-2 p-3 @lg:grid-cols-2">
              {aiMentors.map((m) => (
                <li key={m.slug}>
                  <Link
                    href={`/dashboard/ai-mentors/${m.slug}`}
                    className="flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-ui-surface-2"
                  >
                    <Avatar name={m.name} src={m.avatar} size={40} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-ui-text">{m.name}</span>
                      <span className="truncate text-[13px] text-ui-muted">{m.specialty}</span>
                    </span>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ui-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <CertificateCard certificates={certificates} />
        </div>

        <section aria-labelledby="h-explore">
          <SectionHeader
            id="h-explore"
            title="Explore more courses"
            action={
              <Link href="/dashboard/courses" className="text-ui-brand-text hover:underline">
                Browse all {courses.length || ''} courses
              </Link>
            }
          />
          {coursesLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-[14px]" />
              ))}
            </div>
          ) : explore.length === 0 ? (
            <Card>
              <EmptyState icon={BookOpenCheck} title="You're enrolled in every course" body="Pick up where you left off from In progress." />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {explore.map((c) => (
                <Link key={c.id} href={courseHref(c.id)} className="group">
                  <Card interactive className="flex h-full flex-col overflow-hidden">
                    <CoverTile src={c.cover} title={c.title} icon={topicIcon(c.category)} />
                    <span className="flex flex-col gap-1.5 p-3.5">
                      <span className="text-[15px] font-semibold leading-snug text-ui-text" dir="auto">{c.title}</span>
                      <span className="text-[13px] text-ui-muted">{courseFacts(c)}</span>
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

function courseFacts(c: CourseListItem) {
  const parts: string[] = []
  if (typeof c.unitCount === 'number') parts.push(`${c.unitCount} units`)
  else parts.push(c.category ?? c.difficulty)
  if (c.hasFinalExam) parts.push('final exam')
  if (c.enableCertificate) parts.push('certificate')
  return parts.join(', ')
}

// ── Continue learning ────────────────────────────────────────────────────────

function ContinueCard({
  loading,
  course,
  summary,
  hasCourses,
}: {
  loading: boolean
  course: CourseListItem | null
  summary: CourseSummary | undefined
  hasCourses: boolean
}) {
  if (loading) return <Skeleton className="h-[260px] rounded-[14px]" />
  if (!course) {
    return (
      <Card className="flex items-center justify-center shadow-ui">
        <EmptyState
          icon={BookOpenCheck}
          title={hasCourses ? 'All your courses are complete' : 'Start your first course'}
          body={
            hasCourses
              ? 'Well done. Pick a new course or see your certificates.'
              : 'Short, practical courses for running a business. Or let Anna build a Learning Path for you.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/courses" className={btn()}>
                Browse courses
              </Link>
              <Link href={hasCourses ? '/dashboard/certificates' : '#h-path'} className={btn({ variant: 'secondary' })}>
                {hasCourses ? 'My certificates' : 'Build my path'}
              </Link>
            </div>
          }
        />
      </Card>
    )
  }
  const pct = summary?.progress ?? course.progressPercentage
  const unitLine = summary
    ? summary.allUnitsDone
      ? `All ${summary.totalUnits} units done, final exam next`
      : `Unit ${summary.currentUnitNumber} of ${summary.totalUnits}: ${summary.currentUnit?.title ?? ''}`
    : null
  return (
    // Sized by the card's own width, not the window: beside the streak card on a
    // laptop the card is too narrow for the side-by-side cover.
    <div className="@container">
      <section
        aria-labelledby="h-continue"
        className="grid grid-cols-1 h-full overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui @xl:grid-cols-[260px_minmax(0,1fr)]"
      >
        <div className="relative">
          <CoverTile
            src={course.cover}
            title={course.title}
            icon={topicIcon(course.category)}
            className="h-full max-h-[200px] min-h-[180px] @xl:aspect-auto @xl:max-h-none @xl:min-h-[240px]"
          />
          <Link
            href={courseHref(course.id)}
            aria-label={`Resume ${course.title}`}
            className="absolute left-1/2 top-1/2 inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#652d90] shadow-[0_6px_20px_rgba(0,0,0,0.2)] transition-transform hover:scale-105"
          >
            <Play className="ml-0.5 h-[22px] w-[22px] fill-current" aria-hidden />
          </Link>
        </div>
        <div className="flex flex-col gap-3.5 p-5 sm:px-6 sm:py-[22px]">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-ui-muted">Continue learning</span>
            <h2 id="h-continue" className="text-xl font-semibold tracking-[-0.01em] text-ui-text">
              {course.title}
            </h2>
            {unitLine && <p className="text-[15px] text-ui-muted">{unitLine}</p>}
          </div>
          {summary && summary.steps.length > 0 && !summary.allUnitsDone && (
            <ol aria-label="Unit steps" className="flex flex-wrap gap-1.5">
              {summary.steps.map((s) => (
                <li
                  key={s.id}
                  aria-current={s.state === 'current' ? 'step' : undefined}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
                    s.state === 'done' && 'bg-ui-ok-soft text-ui-ok',
                    s.state === 'current' && 'bg-ui-brand text-white',
                    s.state === 'todo' && 'border border-ui-line text-ui-muted',
                  )}
                >
                  {s.state === 'done' && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
                  {s.label}
                  {s.state === 'done' && <span className="sr-only">, done</span>}
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-center gap-3">
            <ProgressBar value={pct} className="flex-1" label={`${course.title} progress`} />
            <span className="text-[13px] font-semibold tabular-nums text-ui-text">{pct}%</span>
          </div>
          <div className="mt-auto flex flex-wrap gap-2.5">
            <Link href={courseHref(course.id)} className={btn()}>
              Resume
            </Link>
            <Link href="/dashboard/anna" className={btn({ variant: 'secondary' })}>
              <img src={SANA_AVATAR} alt="" className="h-[22px] w-[22px] rounded-full object-cover object-top" />
              Ask Anna
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Streak and points ────────────────────────────────────────────────────────

function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function StreakCard({
  streak,
  loading,
  failed,
  points,
  offersCount,
}: {
  streak: Streak | undefined
  loading: boolean
  failed: boolean
  points: number
  offersCount: number
}) {
  const today = isoToday()
  const pointsRow = (
    <div className={cn('flex items-center justify-between gap-3', streak && 'border-t border-ui-line pt-3.5')}>
      <div className="flex flex-col">
        <span className="text-[22px] font-bold tabular-nums tracking-[-0.01em] text-ui-text">{points.toLocaleString()}</span>
        <span className="text-xs text-ui-muted">points to spend on offers{offersCount > 0 ? `, ${offersCount} available` : ''}</span>
      </div>
      <Link href="/dashboard/offers" className={btn({ variant: 'secondary', size: 'sm' })}>
        View offers
      </Link>
    </div>
  )
  if (loading) return <Skeleton className="h-[260px] rounded-[14px]" />
  if (failed || !streak) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold text-ui-text">Your points</h2>
        <p className="text-[13px] leading-relaxed text-ui-muted">Earn points for every unit you finish, then spend them on partner offers.</p>
        <div className="mt-auto">{pointsRow}</div>
      </Card>
    )
  }
  const goalMet = streak.todaySteps >= streak.dailyGoal
  return (
    <Card aria-labelledby="h-streak" className="flex flex-col gap-4 p-5" role="region">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ui-brand-soft text-ui-brand-text">
          <Flame className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex flex-col">
          <h2 id="h-streak" className="text-lg font-semibold text-ui-text">
            {streak.currentStreak > 0 ? `${streak.currentStreak}-day streak` : 'Start a streak today'}
          </h2>
          <span className="text-[13px] text-ui-muted">
            {goalMet ? "Today's goal done. See you tomorrow." : `Daily goal: finish ${streak.dailyGoal} unit step${streak.dailyGoal === 1 ? '' : 's'}`}
          </span>
        </div>
        <Link
          href="/dashboard/achievements"
          aria-label="Badges and leaderboard"
          title="Badges and leaderboard"
          className="ms-auto inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg text-ui-muted transition-colors hover:bg-ui-surface-2 hover:text-ui-brand-text"
        >
          <Trophy className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
      <ol aria-label="This week" className="grid grid-cols-7 gap-1.5 text-center">
        {streak.week.map((d) => {
          const isToday = d.date === today
          const future = d.date > today
          const label = new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'short',
          })
          return (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <span className={cn('text-xs', isToday ? 'font-semibold text-ui-text' : 'text-ui-muted')}>{label}</span>
              {d.done ? (
                <span
                  className={cn(
                    'inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-ui-brand text-white',
                    isToday && 'ring-[3px] ring-ui-brand-soft',
                  )}
                >
                  <Check className="h-[15px] w-[15px]" strokeWidth={2.6} role="img" aria-label={isToday ? 'Done today' : 'Done'} />
                </span>
              ) : (
                <span
                  role={future ? undefined : 'img'}
                  aria-label={future ? undefined : isToday ? 'Not done yet today' : 'Missed'}
                  className={cn('h-[30px] w-[30px] rounded-full border border-ui-line', future && 'border-dashed')}
                />
              )}
            </li>
          )
        })}
      </ol>
      {pointsRow}
    </Card>
  )
}

// ── Ask Anna ─────────────────────────────────────────────────────────────────

function AskSanaBar() {
  const narrow = useNarrow()
  const router = useRouter()
  const [text, setText] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dictation = useDictation('en', (t) => setText(t))

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = text.trim()
    try {
      if (q) sessionStorage.setItem(ASK_SANA_PENDING_KEY, q)
    } catch {
      /* storage blocked: Anna still opens */
    }
    router.push('/dashboard/anna')
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-[14px] border border-ui-line bg-ui-surface py-2.5 pl-3.5 pr-2.5 sm:gap-3">
      <img src={SANA_AVATAR} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover object-top" />
      <label htmlFor="home-ask" className="sr-only">
        Ask Anna
      </label>
      <input
        id="home-ask"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={narrow ? 'Ask Anna anything' : 'Ask Anna anything: a course for my business, a mentor, how to price a service...'}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ui-text outline-none placeholder:text-ui-muted"
      />
      {mounted && dictation.supported && (
        <button
          type="button"
          onClick={dictation.listening ? dictation.stop : dictation.start}
          aria-label={dictation.listening ? 'Stop dictation' : 'Speak to Anna'}
          aria-pressed={dictation.listening}
          className={cn(btn({ variant: 'secondary', size: 'icon' }), dictation.listening && 'border-ui-brand text-ui-brand-text')}
        >
          <Mic className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <button type="submit" className={btn()}>
        Ask
      </button>
    </form>
  )
}

// ── In progress ──────────────────────────────────────────────────────────────

function InProgressCard({ loading, courses, summaries }: { loading: boolean; courses: CourseListItem[]; summaries: Map<string, CourseSummary> }) {
  return (
    <Card aria-labelledby="h-progress" role="region" className="@container">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 id="h-progress" className="text-base font-semibold text-ui-text">
          In progress
        </h2>
        <Link href="/dashboard/courses" className="text-[13px] font-semibold text-ui-brand-text hover:underline">
          All my courses
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3 border-t border-ui-line p-5">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : courses.length === 0 ? (
        <div className="border-t border-ui-line">
          <EmptyState
            icon={BookOpenCheck}
            title="Nothing in progress"
            body="Courses you start show up here with your progress."
            action={
              <Link href="/dashboard/courses" className={btn({ variant: 'secondary', size: 'sm' })}>
                Browse courses
              </Link>
            }
          />
        </div>
      ) : (
        <ul>
          {courses.map((c) => {
            const s = summaries.get(c.id)
            const pct = s?.progress ?? c.progressPercentage
            const line = s
              ? s.allUnitsDone
                ? 'Next: final exam'
                : pct === 0
                  ? `${s.totalUnits} units, not started`
                  : `Next: ${s.currentUnit?.title ?? `Unit ${s.currentUnitNumber}`}`
              : c.difficulty
            return (
              <li key={c.id} className="border-t border-ui-line">
                <Link
                  href={courseHref(c.id)}
                  className="grid grid-cols-[56px_minmax(0,1fr)_44px] items-center gap-3 px-4 py-3 transition-colors hover:bg-ui-bg @md:grid-cols-[64px_minmax(0,1fr)_140px_24px] @md:gap-4 @md:px-5"
                >
                  <CoverTile
                    src={c.cover}
                    title={c.title}
                    icon={topicIcon(c.category)}
                    className="aspect-auto h-10 rounded-lg @md:h-11 [&_svg]:h-5 [&_svg]:w-5"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold text-ui-text" dir="auto">{c.title}</span>
                    <span className="line-clamp-2 text-[13px] text-ui-muted">{line}</span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <ProgressBar value={pct} className="hidden flex-1 @md:block" label={`${c.title} progress`} />
                    <span className="w-full text-right text-[13px] font-semibold tabular-nums text-ui-text @md:w-[34px]">{pct}%</span>
                  </span>
                  <ChevronRight className="hidden h-[18px] w-[18px] text-ui-muted @md:block" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── Coming up ────────────────────────────────────────────────────────────────

function ComingUpCard({
  sessions,
  events,
  mentor,
  cancellingId,
  onCancel,
}: {
  sessions: SmeSession[]
  events: LiveEvent[]
  mentor: {
    id: string
    fullName: string
    expertise: string[] | null
    avatarUrl: string | null
  } | null
  cancellingId: string | null
  onCancel: (id: string) => void
}) {
  const nothing = sessions.length === 0 && events.length === 0
  const now = useNow()
  return (
    <Card aria-labelledby="h-coming" role="region" className="flex flex-col gap-3.5 px-5 py-4">
      <h2 id="h-coming" className="text-base font-semibold text-ui-text">
        Coming up
      </h2>
      {nothing && <p className="text-[13px] text-ui-muted">No mentor sessions booked and no live events scheduled.</p>}
      {sessions.map((s) => (
        <div key={s.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
          <Avatar name={s.mentorUser.fullName} src={s.mentorUser.avatarUrl} size={44} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-semibold text-ui-text">Session with {s.mentorUser.fullName}</span>
            <span className="text-[13px] text-ui-muted">
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }).format(new Date(s.slot.startsAt))}
            </span>
            <span className="mt-1 flex gap-3 text-[13px] font-semibold">
              {s.meetingLink && (
                <a href={s.meetingLink} target="_blank" rel="noreferrer" className="text-ui-brand-text hover:underline">
                  Join
                </a>
              )}
              <button
                type="button"
                disabled={cancellingId === s.id}
                onClick={() => onCancel(s.id)}
                className="text-ui-danger hover:underline disabled:opacity-50"
              >
                {cancellingId === s.id ? 'Cancelling' : 'Cancel'}
              </button>
            </span>
          </div>
        </div>
      ))}
      {events.map((e) => {
        const d = new Date(e.startsAt)
        const open = now !== null && ['opening', 'live'].includes(eventPhaseAt(e, now))
        return (
          <div key={e.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
            <span className="flex h-12 w-11 flex-col items-center justify-center rounded-[10px] border border-ui-line text-[11px] text-ui-muted">
              {d.toLocaleDateString('en-US', { month: 'short' })}
              <strong className="text-base leading-tight text-ui-text">{d.getDate()}</strong>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <Link href="/dashboard/events" className="truncate font-semibold text-ui-text hover:underline">
                {e.title}
              </Link>
              <span className="text-[13px] text-ui-muted">
                {timeLabel(e.startsAt)}, {e.format === 'in_person' ? (e.location ?? 'in person') : 'online'}
                {e.booked && <span className="font-semibold text-ui-ok"> · Booked</span>}
              </span>
              <span className="flex gap-3 text-[13px] font-semibold">
                {e.booked && open && e.meetingLink && (
                  <a href={e.meetingLink} target="_blank" rel="noreferrer" className="text-ui-brand-text hover:underline">
                    Join now
                  </a>
                )}
                <Link href="/dashboard/events" className="text-ui-brand-text hover:underline">
                  {e.booked ? 'View details' : 'Book a place'}
                </Link>
              </span>
            </span>
          </div>
        )
      })}
      {sessions.length === 0 && mentor && (
        <Link href="/dashboard/human-mentors" className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-[10px] hover:bg-ui-surface-2">
          <Avatar name={mentor.fullName} src={mentor.avatarUrl} size={44} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-semibold text-ui-text">Book {mentor.fullName}</span>
            {mentor.expertise && mentor.expertise.length > 0 && (
              <span className="line-clamp-2 text-[13px] text-ui-muted">{mentor.expertise.slice(0, 3).join(', ')}</span>
            )}
          </span>
        </Link>
      )}
      <div className="flex gap-2">
        <Link href="/dashboard/human-mentors" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-9 flex-1')}>
          Find a mentor
        </Link>
        <Link href="/dashboard/events" className={cn(btn({ variant: 'ghost', size: 'sm' }), 'h-9')}>
          All events
        </Link>
      </div>
    </Card>
  )
}

// ── Certificates ─────────────────────────────────────────────────────────────

function CertificateCard({ certificates }: { certificates: { id: string; courseTitle: string; issuedAt: string }[] }) {
  const latest = certificates[0] ?? null
  return (
    <Card aria-labelledby="h-cert" role="region" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="h-cert" className="text-base font-semibold text-ui-text">
          Certificates
        </h2>
        <span className="rounded-full bg-ui-surface-2 px-2 text-xs font-semibold tabular-nums text-ui-muted">{certificates.length}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ui-brand-soft text-ui-brand-text">
          <Award className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        {latest ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-ui-text">{latest.courseTitle}</span>
            <span className="text-[13px] text-ui-muted">
              Latest, issued{' '}
              {new Date(latest.issuedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </span>
        ) : (
          <span className="text-[13px] leading-snug text-ui-muted">Finish a course and pass its final exam to earn your first certificate.</span>
        )}
      </div>
      <Link href="/dashboard/certificates" className={cn(btn({ variant: 'secondary', size: 'sm' }), 'h-9')}>
        {latest ? 'View certificates' : 'How certificates work'}
      </Link>
    </Card>
  )
}

/**
 * AI Amplify's learning path with Anna (the Blended path panel). It stays on
 * the home page: the learning journeys are not in the menu, so this is where
 * learners build and follow their path. Mounted only once the copilot service
 * token is minted (its first request needs auth).
 */
function LearningPathSection() {
  const copilotReady = useCopilotTokenReady()
  return (
    // The panel's own header names it; the id is the target of "Build my path" links.
    <section id="h-path" aria-label="Your learning path" className="scroll-mt-20">
      {copilotReady ? (
        <CopilotKit
          runtimeUrl={VOICE_RUNTIME_URL}
          /* Resolved object, not the function: the core's /info fetch doesn't
             resolve function-form headers (agent runs do). Safe here — this
             subtree only mounts after useCopilotTokenReady(). */
          headers={getCopilotHeaders()}
          /* Multi-route Express handler: not single-endpoint mode. */
          useSingleEndpoint={false}
          enableInspector={false}
          showDevConsole={false}
        >
          <LearningPathPanel embedded />
        </CopilotKit>
      ) : (
        <Skeleton className="h-[min(720px,calc(100dvh-9rem))] min-h-[480px] rounded-[14px]" />
      )}
    </section>
  )
}
