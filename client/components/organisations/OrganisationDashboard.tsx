'use client'

/**
 * One organisation's learners at a glance: headline numbers, sign-ups by
 * week, learning gain, courses and every learner. Partner contacts see it as
 * their dashboard; admins see it on the organisation's page (with their own
 * actions on each learner).
 */
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Award, BookOpenCheck, GraduationCap, TrendingUp, Users, UserCheck } from 'lucide-react'
import { Avatar, btn, Card, EmptyState, inputClass, ProgressBar, StatCard } from '@/components/kit'
import { AdminChartCard } from '@/components/admin/widgets/AdminChartCard'
import { ColumnChart, SearchInput, TableCard, adminTableClass, fmtDate } from '@/components/admin/ui'
import { LearningGainCard, type LearningGain } from '@/components/admin/LearningGainCard'

export type OrganisationLearner = {
  id: string
  fullName: string
  email: string
  company: string | null
  joinedAt: string
  lastActiveAt: string | null
  coursesStarted: number
  coursesCompleted: number
  certificates: number
  avgProgress: number | null
}

export type OrganisationDashboardData = {
  /** Admin view only: whether existing learners can be added by email (needs learner messages on). */
  canAddLearners?: boolean
  organisation: { id: string; name: string; type: string; joinCode: string; joinLink: string; joinEnabled: boolean }
  kpis: { learners: number; activeLearners: number; learning: number; coursesCompleted: number; certificates: number; avgProgress: number | null }
  joinsByWeek: { week: string; joins: number }[]
  courses: { courseId: string; title: string; enrolled: number; completed: number; avgProgress: number }[]
  learners: OrganisationLearner[]
  learningGain: LearningGain
}

const nf = new Intl.NumberFormat('en-US')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "28 Sep": short enough for 12 columns side by side. */
const weekLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function lastSeen(iso: string | null): string {
  if (!iso) return 'Not yet'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return fmtDate(iso)
}

export function OrganisationDashboard({
  data,
  learnerAction,
  emptyLearners,
  learnerHref,
}: {
  data: OrganisationDashboardData
  /** Where a learner's full record opens. */
  learnerHref?: (l: OrganisationLearner) => string
  /** Shown at the end of each learner row (admins: remove from organisation). */
  learnerAction?: (l: OrganisationLearner) => ReactNode
  /** What to show when nobody has joined yet (e.g. the sign-up link). */
  emptyLearners?: ReactNode
}) {
  const { kpis } = data
  const [q, setQ] = useState('')
  const learners = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return data.learners
    return data.learners.filter((l) => [l.fullName, l.email, l.company ?? ''].some((v) => v.toLowerCase().includes(needle)))
  }, [data.learners, q])
  const pct = (n: number) => (kpis.learners ? Math.round((n / kpis.learners) * 100) : 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Learners" icon={Users} value={nf.format(kpis.learners)} hint="Joined with your link or added by AI Amplify" />
        <StatCard label="Active, last 30 days" icon={UserCheck} value={nf.format(kpis.activeLearners)} hint={kpis.learners ? `${pct(kpis.activeLearners)}% of learners` : undefined} />
        <StatCard label="Learning" icon={GraduationCap} value={nf.format(kpis.learning)} hint={kpis.avgProgress != null ? `Average progress ${kpis.avgProgress}%` : 'Started at least one course'} />
        <StatCard label="Courses completed" icon={BookOpenCheck} value={nf.format(kpis.coursesCompleted)} />
        <StatCard label="Certificates" icon={Award} value={nf.format(kpis.certificates)} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <AdminChartCard title="New learners" subtitle="Sign-ups each week, last 12 weeks">
          <ColumnChart
            label={`New learners per week: ${data.joinsByWeek.map((w) => `${weekLabel(w.week)} ${w.joins}`).join(', ')}`}
            data={data.joinsByWeek.map((w) => ({ label: weekLabel(w.week), value: w.joins }))}
          />
        </AdminChartCard>
        <LearningGainCard data={data.learningGain} maxCourses={4} />
      </div>

      <TableCard
        header={
          <div className="flex items-center gap-2 border-b border-ui-line px-5 py-4">
            <TrendingUp className="h-[18px] w-[18px] text-ui-muted" strokeWidth={1.75} aria-hidden />
            <h2 className="text-base font-semibold text-ui-text">Courses</h2>
          </div>
        }
      >
        {data.courses.length ? (
          <table className={adminTableClass}>
            <thead>
              <tr>
                <th>Course</th>
                <th className="text-right">Learners</th>
                <th className="text-right">Completed</th>
                <th className="w-[220px]">Average progress</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((c) => (
                <tr key={c.courseId}>
                  <td className="font-medium text-ui-text">{c.title}</td>
                  <td className="text-right tabular-nums">{c.enrolled}</td>
                  <td className="text-right tabular-nums">{c.completed}</td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <ProgressBar value={c.avgProgress} className="flex-1" label={`${c.title} average progress`} />
                      <span className="w-9 text-right text-[13px] tabular-nums text-ui-muted">{c.avgProgress}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={GraduationCap} title="No courses started yet" body="Courses appear here once your learners start one." />
        )}
      </TableCard>

      <TableCard
        header={
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-line px-5 py-4">
            <h2 className="text-base font-semibold text-ui-text">
              Learners <span className="font-normal text-ui-muted">({nf.format(data.learners.length)})</span>
            </h2>
            {data.learners.length > 0 && (
              <SearchInput value={q} onChange={setQ} placeholder="Search name, email or company" className="w-full sm:w-[280px]" />
            )}
          </div>
        }
      >
        {data.learners.length === 0 ? (
          emptyLearners ?? <EmptyState icon={Users} title="No learners yet" body="Learners appear here as soon as they join." />
        ) : learners.length === 0 ? (
          <EmptyState title="No learners match" body="Try another name, email or company." />
        ) : (
          <table className={adminTableClass}>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Company</th>
                <th>Joined</th>
                <th>Last active</th>
                <th className="text-right">Courses</th>
                <th className="text-right">Certificates</th>
                <th className="w-[160px]">Progress</th>
                {learnerAction && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="flex min-w-[200px] items-center gap-2.5">
                      <Avatar name={l.fullName} size={32} />
                      <div className="min-w-0">
                        {learnerHref ? (
                          <Link href={learnerHref(l)} className="block truncate font-medium text-ui-text hover:text-ui-brand-text hover:underline">
                            {l.fullName}
                          </Link>
                        ) : (
                          <p className="truncate font-medium text-ui-text">{l.fullName}</p>
                        )}
                        <p className="truncate text-xs text-ui-muted">{l.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-ui-muted">{l.company || '—'}</td>
                  <td className="whitespace-nowrap text-ui-muted">{fmtDate(l.joinedAt)}</td>
                  <td className="whitespace-nowrap text-ui-muted">{lastSeen(l.lastActiveAt)}</td>
                  <td className="text-right tabular-nums">
                    {l.coursesCompleted}/{l.coursesStarted}
                  </td>
                  <td className="text-right tabular-nums">{l.certificates}</td>
                  <td>
                    {l.avgProgress == null ? (
                      <span className="text-[13px] text-ui-muted">Not started</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={l.avgProgress} className="flex-1" label={`${l.fullName} progress`} />
                        <span className="w-9 text-right text-[13px] tabular-nums text-ui-muted">{l.avgProgress}%</span>
                      </div>
                    )}
                  </td>
                  {learnerAction && <td className="text-right">{learnerAction(l)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <p className="text-xs text-ui-muted">Courses shows completed out of started. Progress is the average across a learner&rsquo;s courses.</p>
    </div>
  )
}

/** The organisation's sign-up link with a copy button. */
export function JoinLinkCard({ link, enabled, className, children }: { link: string; enabled: boolean; className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <Card className={className ? `p-5 ${className}` : 'p-5'}>
      <h2 className="text-base font-semibold text-ui-text">Sign-up link</h2>
      <p className="mt-0.5 text-[13px] text-ui-muted">
        {enabled ? 'Share it with your people. Everyone who signs up with it joins your organisation here. AI Amplify is invite-only, so send each person an invite code with it (or add one to the link: …&code=INVITE).' : 'This link is turned off. New sign-ups can’t use it.'}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={link} aria-label="Sign-up link" onFocus={(e) => e.currentTarget.select()} className={`${inputClass} min-w-0 flex-1 bg-ui-surface-2`} />
        <button
          type="button"
          disabled={!enabled}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            } catch {
              /* the field is selectable as a fallback */
            }
          }}
          className={btn({ className: 'h-10 shrink-0' })}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {children}
    </Card>
  )
}
