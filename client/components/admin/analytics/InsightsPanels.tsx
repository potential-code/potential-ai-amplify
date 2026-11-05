'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Tag,
  BadgeCheck,
  BookOpenCheck,
  CalendarCheck,
  GraduationCap,
  Minus,
  Route,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, Skeleton } from '@/components/kit'
import { BarList, chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { RANGE_WORDS } from '@/components/admin/analytics/trend'
import type { AnalyticsInsights, AnalyticsRange, KpiDelta } from '@/lib/api/adminAnalytics'
import { cn } from '@/lib/utils'

const fmt = (n: number) => n.toLocaleString('en-US')

function bucketLabel(bucket: string, range: AnalyticsRange) {
  const d = new Date(range === '12m' ? `${bucket}-01T00:00:00` : `${bucket}T00:00:00`)
  return range === '12m'
    ? d.toLocaleDateString('en-US', { month: 'short' })
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

const PERIOD: Record<AnalyticsRange, string> = { '7d': 'previous 7 days', '30d': 'previous 30 days', '12m': 'previous 12 months' }

// ── Highlight KPIs ───────────────────────────────────────────────────────────

const TONES = {
  brand: 'bg-ui-brand-soft text-ui-brand-text',
  blue: 'bg-[#e8f0f8] text-[#1d4e89] dark:bg-[#1b2836] dark:text-[#8fb8e6]',
  green: 'bg-[#e3f1ec] text-[#1f6f5c] dark:bg-[#16302a] dark:text-[#7fd1b6]',
  amber: 'bg-[#fcf0e2] text-[#8a4513] dark:bg-[#3a2a17] dark:text-[#f0b26b]',
  violet: 'bg-[#efe8f6] text-[#4c1d6e] dark:bg-[#2c2140] dark:text-[#c8a8ee]',
} as const

function Change({ delta, range }: { delta: KpiDelta; range: AnalyticsRange }) {
  const { current, previous } = delta
  if (current === 0 && previous === 0) return <span className="text-xs text-ui-muted">No activity yet</span>
  if (previous === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ui-ok">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        New this period
      </span>
    )
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', pct > 0 ? 'text-ui-ok' : pct < 0 ? 'text-ui-danger' : 'text-ui-muted')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {pct > 0 ? '+' : ''}
      {pct}% <span className="font-normal text-ui-muted">vs {PERIOD[range]}</span>
    </span>
  )
}

export function HighlightKpis({ data, loading, range }: { data?: AnalyticsInsights; loading: boolean; range: AnalyticsRange }) {
  const k = data?.kpis
  const tiles: { icon: LucideIcon; label: string; delta?: KpiDelta; tone: keyof typeof TONES; extra?: ReactNode }[] = [
    { icon: UserPlus, label: 'New learners', delta: k?.newLearners, tone: 'brand' },
    { icon: Sparkles, label: 'Active learners', delta: k?.activeLearners, tone: 'blue' },
    { icon: BookOpenCheck, label: 'Lessons completed', delta: k?.lessonsCompleted, tone: 'amber' },
    { icon: Route, label: 'Journeys started', delta: k?.journeysStarted, tone: 'violet' },
    { icon: GraduationCap, label: 'Courses completed', delta: k?.coursesCompleted, tone: 'green' },
    { icon: Award, label: 'Certificates', delta: k?.certificates, tone: 'brand' },
    { icon: CalendarCheck, label: 'Mentor sessions', delta: k?.mentorSessions, tone: 'blue' },
    { icon: Tag, label: 'Offers redeemed', delta: k?.offersRedeemed, tone: 'green' },
  ]
  return (
    <section aria-label={`Highlights, ${RANGE_WORDS[range]}`} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {tiles.map((t) =>
        loading || !t.delta ? (
          <Skeleton key={t.label} className="h-[118px] rounded-[14px]" />
        ) : (
          <div key={t.label} className="flex flex-col gap-2 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4 shadow-ui">
            <span className="flex items-center gap-2.5">
              <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', TONES[t.tone])}>
                <t.icon className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="text-[13px] font-medium text-ui-muted">{t.label}</span>
            </span>
            <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ui-text tabular-nums">{fmt(t.delta.current)}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Change delta={t.delta} range={range} />
              {t.extra}
            </span>
          </div>
        ),
      )}
    </section>
  )
}

// ── Charts ───────────────────────────────────────────────────────────────────

const axis = { fontSize: 11, fill: chartColors.muted }

export function InsightsCharts({ data, loading, range }: { data?: AnalyticsInsights; loading: boolean; range: AnalyticsRange }) {
  const series = (data?.series ?? []).map((s) => ({ ...s, label: bucketLabel(s.bucket, range) }))
  const exams = data?.aiExamScores ?? []
  const hasExams = exams.some((e) => e.attempts > 0)
  const per = range === '12m' ? 'month' : 'day'
  const hasActivity = series.some((s) => s.activeLearners || s.lessonsCompleted)
  const hasSessions = series.some((s) => s.sessionsBooked || s.sessionsCancelled)
  const mix = (data?.journeyMix ?? []).filter((m) => m.count > 0)
  const mixTotal = mix.reduce((n, m) => n + m.count, 0)
  const funnelTop = data?.funnel[0]?.learners ?? 0

  const sk = (h = 'h-[230px]') => <Skeleton className={h} />

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <AdminChartCard title="Learning activity" subtitle={`Active learners and lessons completed per ${per}, ${RANGE_WORDS[range]}`}>
          {loading ? sk() : !hasActivity ? (
            <EmptyState icon={Sparkles} title="No learning activity in this period" body="This fills in as learners work through lessons." />
          ) : (
            <div className="h-[230px]" role="img" aria-label={`Active learners and lessons completed per ${per}`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ins-lessons" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.series[0]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartColors.series[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ins-active" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.series[1]} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={chartColors.series[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} cursor={{ stroke: chartColors.line }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="lessonsCompleted" name="Lessons completed" stroke={chartColors.series[0]} strokeWidth={2} fill="url(#ins-lessons)" />
                  <Area type="monotone" dataKey="activeLearners" name="Active learners" stroke={chartColors.series[1]} strokeWidth={2} fill="url(#ins-active)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Learner funnel" subtitle="How far learners get, all time">
          {loading ? sk() : (
            <ol className="flex flex-col gap-2.5" aria-label="Learner funnel">
              {(data?.funnel ?? []).map((f, i) => {
                const pct = funnelTop ? Math.round((f.learners / funnelTop) * 100) : 0
                return (
                  <li key={f.step} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="text-ui-text">{f.step}</span>
                      <span className="tabular-nums">
                        <strong className="font-semibold text-ui-text">{fmt(f.learners)}</strong>
                        {i > 0 && <span className="ms-1.5 text-ui-muted">{pct}%</span>}
                      </span>
                    </span>
                    <span className="h-3 overflow-hidden rounded-full bg-ui-surface-2">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(pct, f.learners ? 3 : 0)}%`, background: `color-mix(in srgb, var(--ui-brand) ${100 - i * 14}%, #c9a6e6)` }}
                      />
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </AdminChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AdminChartCard title="Journey mix" subtitle={`What learners started, ${RANGE_WORDS[range]}`} aside={loading ? undefined : fmt(mixTotal)}>
          {loading ? sk() : mix.length === 0 ? (
            <EmptyState icon={Route} title="Nothing started in this period" body="Course enrollments, paths, exams and mentor sessions show here." />
          ) : (
            <div className="grid items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[200px_minmax(0,1fr)]">
              <div className="h-[200px]" role="img" aria-label="Share of each learning journey">
                <div aria-hidden className="h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="count" nameKey="journey" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none" rootTabIndex={-1}>
                      {mix.map((m, i) => <Cell key={m.journey} fill={chartColors.series[i % chartColors.series.length]} />)}
                    </Pie>
                    <Tooltip {...chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                </div>
              </div>
              <ul className="flex flex-col gap-2 text-[13px]">
                {mix.map((m, i) => (
                  <li key={m.journey} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: chartColors.series[i % chartColors.series.length] }} />
                    <span className="min-w-0 flex-1 text-ui-text">{m.journey}</span>
                    <span className="tabular-nums font-semibold text-ui-text">{fmt(m.count)}</span>
                    <span className="w-10 text-right tabular-nums text-ui-muted">{Math.round((m.count / mixTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Mentor sessions" subtitle={`Booked, completed and cancelled per ${per}`}>
          {loading ? sk() : !hasSessions ? (
            <EmptyState icon={CalendarCheck} title="No sessions in this period" body="Bookings with human mentors show here." />
          ) : (
            <div className="h-[230px]" role="img" aria-label={`Mentor sessions per ${per}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sessionsBooked" name="Booked" stackId="s" fill={chartColors.series[0]} />
                  <Bar dataKey="sessionsCompleted" name="Completed" stackId="s" fill={chartColors.series[2]} />
                  <Bar dataKey="sessionsCancelled" name="Cancelled" stackId="s" fill="#c8bfc5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <AdminChartCard
          title="AI Examiner scores"
          subtitle={`Practice exams by score, ${RANGE_WORDS[range]}`}
          aside={loading || data?.kpis.aiExamAvgScore == null ? undefined : `${data.kpis.aiExamAvgScore}`}
        >
          {loading ? sk('h-[200px]') : !hasExams ? (
            <EmptyState icon={BadgeCheck} title="No exams in this period" body="Scores from AI Examiner practice exams show here." />
          ) : (
            <>
              <div className="h-[170px]" role="img" aria-label="AI Examiner attempts by score band">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={exams} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="band" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="attempts" name="Attempts" radius={[4, 4, 0, 0]}>
                      {exams.map((e, i) => <Cell key={e.band} fill={['#d6cde0', '#c9a6e6', '#8b57b8', '#4a2168'][i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-ui-muted">
                {(data?.aiExamModes ?? []).map((m) => (
                  <span key={m.mode} className="rounded-full bg-ui-surface-2 px-2 py-0.5 capitalize">
                    {m.mode} {m.attempts}
                  </span>
                ))}
              </p>
            </>
          )}
        </AdminChartCard>
        <AdminChartCard title="When learners learn" subtitle={`Active learners by weekday, ${RANGE_WORDS[range]}`}>
          {loading ? sk('h-[200px]') : (
            <div className="h-[200px]" role="img" aria-label="Active learners by weekday">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.weekdays ?? []} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="activeLearners" name="Active learners" fill={chartColors.series[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Learners by country" subtitle="All time, top 10">
          {loading ? sk('h-[200px]') : (data?.countries.length ?? 0) === 0 ? (
            <EmptyState icon={Route} title="No countries yet" body="Learners pick their country when they sign up." />
          ) : (
            <BarList data={(data?.countries ?? []).map((c) => ({ label: c.country, value: c.learners }))} />
          )}
        </AdminChartCard>
      </div>
    </>
  )
}
