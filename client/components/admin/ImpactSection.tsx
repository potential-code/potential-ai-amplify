'use client'

import type { LucideIcon } from 'lucide-react'
import { Award, BookOpenCheck, CalendarCheck, Globe2, GraduationCap, Route, Sparkles, Tag, Users } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, Skeleton } from '@/components/kit'
import { BarList, chartColors, chartTooltipStyle } from '@/components/admin/ui'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { PROGRAM_FACTS } from '@/lib/constants/content'
import type { Impact } from '@/lib/api/adminAnalytics'
import { cn } from '@/lib/utils'

const fmt = (n: number) => n.toLocaleString('en-US')
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })

/** The admin home's impact view: program reach, live platform KPIs and outcome charts. */
export function ImpactSection({ impact, loading }: { impact?: Impact; loading: boolean }) {
  const s = impact?.summary
  const tiles: { icon: LucideIcon; label: string; value: string; hint: string; tone: string }[] = s
    ? [
        { icon: Users, label: 'Learners', value: fmt(s.learners), hint: `+${fmt(s.newLearners30d)} in the last 30 days`, tone: 'brand' },
        { icon: Sparkles, label: 'Active learners', value: fmt(s.activeLearners30d), hint: 'Learned in the last 30 days', tone: 'blue' },
        { icon: Globe2, label: 'Countries', value: fmt(s.countries), hint: 'Where learners are based', tone: 'green' },
        { icon: BookOpenCheck, label: 'Lessons completed', value: fmt(s.lessonsCompleted), hint: 'Across every learning journey', tone: 'amber' },
        { icon: GraduationCap, label: 'Courses completed', value: fmt(s.coursesCompleted), hint: `${fmt(s.journeysStarted)} personal paths started`, tone: 'violet' },
        { icon: Award, label: 'Certificates', value: fmt(s.certificates), hint: 'Earned by passing final exams', tone: 'brand' },
        { icon: CalendarCheck, label: 'Mentor sessions', value: fmt(s.mentorSessions), hint: 'Booked with human experts', tone: 'blue' },
        { icon: Tag, label: 'Offers redeemed', value: fmt(s.offersRedeemed), hint: 'Partner offers claimed with points', tone: 'green' },
      ]
    : []

  const monthly = (impact?.monthly ?? []).map((m) => ({ ...m, label: monthLabel(m.month) }))
  const hasActivity = monthly.some((m) => m.activeLearners > 0 || m.lessonsCompleted > 0)
  const hasOutcomes = monthly.some((m) => m.coursesCompleted > 0 || m.certificates > 0)

  return (
    <section aria-labelledby="h-impact" className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#4a2168,#652d90_55%,#8c50bd)] px-6 py-6 text-white sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-white/[0.07]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[520px] flex-col gap-1.5">
            <h2 id="h-impact" className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/75">
              Impact
            </h2>
            <p className="text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">
              Helping small businesses grow with AI
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {PROGRAM_FACTS.map(({ value, label }) => (
              <div key={label} className="flex flex-col">
                <dt className="order-2 text-[13px] text-white/75">{label}</dt>
                <dd className="order-1 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="On the platform">
        {loading || !s
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[112px] rounded-[14px]" />)
          : tiles.map((t) => <ImpactTile key={t.label} {...t} />)}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AdminChartCard title="Learning activity" subtitle="Active learners and lessons completed per month">
          {loading ? (
            <Skeleton className="h-[220px]" />
          ) : !hasActivity ? (
            <EmptyState icon={Sparkles} title="No learning activity yet" body="This fills in as learners work through lessons." />
          ) : (
            <div className="h-[220px]" role="img" aria-label="Active learners and lessons completed per month, last 12 months">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="impact-lessons" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.series[0]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartColors.series[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="impact-active" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.series[1]} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={chartColors.series[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartColors.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} cursor={{ stroke: chartColors.line }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="lessonsCompleted" name="Lessons completed" stroke={chartColors.series[0]} strokeWidth={2} fill="url(#impact-lessons)" />
                  <Area type="monotone" dataKey="activeLearners" name="Active learners" stroke={chartColors.series[1]} strokeWidth={2} fill="url(#impact-active)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Outcomes" subtitle="Courses completed and certificates earned per month">
          {loading ? (
            <Skeleton className="h-[220px]" />
          ) : !hasOutcomes ? (
            <EmptyState icon={Award} title="No completions yet" body="Completed courses and certificates show here month by month." />
          ) : (
            <div className="h-[220px]" role="img" aria-label="Courses completed and certificates per month, last 12 months">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartColors.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="coursesCompleted" name="Courses completed" fill={chartColors.series[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="certificates" name="Certificates" fill={chartColors.series[2]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Learning journeys" subtitle="Learners who have used each journey">
          {loading ? (
            <Skeleton className="h-56" />
          ) : (
            <BarList data={(impact?.journeys ?? []).map((j) => ({ label: j.journey, value: j.learners }))} />
          )}
        </AdminChartCard>

        <AdminChartCard title="Where learners are" subtitle="Learners by country, top 8">
          {loading ? (
            <Skeleton className="h-56" />
          ) : (impact?.countries.length ?? 0) === 0 ? (
            <EmptyState icon={Route} title="No countries yet" body="Learners pick their country when they sign up." />
          ) : (
            <BarList data={(impact?.countries ?? []).map((c) => ({ label: c.country, value: c.learners }))} />
          )}
        </AdminChartCard>
      </div>
    </section>
  )
}

const TONES: Record<string, string> = {
  brand: 'bg-ui-brand-soft text-ui-brand-text',
  blue: 'bg-[#e8f0f8] text-[#1d4e89]',
  green: 'bg-[#e3f1ec] text-[#1f6f5c]',
  amber: 'bg-[#fcf0e2] text-[#8a4513]',
  violet: 'bg-[#efe8f6] text-[#4c1d6e]',
}

function ImpactTile({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-ui-line bg-ui-surface px-[18px] py-4 shadow-ui">
      <span className="flex items-center gap-2.5">
        <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', TONES[tone])}>
          <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden />
        </span>
        <span className="text-[13px] font-medium text-ui-muted">{label}</span>
      </span>
      <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-ui-text tabular-nums">{value}</span>
      <span className="text-xs text-ui-muted">{hint}</span>
    </div>
  )
}
