import { apiFetch } from '../api'

export type AnalyticsRange = '7d' | '30d' | '12m'

// ── Overview KPIs ────────────────────────────────────────────────────────────

export interface OverviewKpis {
  totalUsers: number
  activeUsers: number
  newUsers: number
  activeLearners: number
  enrolledLearners: number
  totalCourses: number
  certificatesIssued: number
}

export const fetchOverviewKpis = (range: AnalyticsRange) =>
  apiFetch<{ success: boolean; data: OverviewKpis }>(
    `/api/admin/analytics/kpi-overview?range=${range}`,
  ).then((r) => r.data)

// ── Trend points (shared shape) ───────────────────────────────────────────────

export interface TrendPoint {
  label: string
  count: number
}

// ── User growth ───────────────────────────────────────────────────────────────

export const fetchUserGrowthTrend = (range: AnalyticsRange = '12m') =>
  apiFetch<{ success: boolean; data: TrendPoint[] }>(
    `/api/admin/analytics/user-growth?range=${range}`,
  ).then((r) => r.data)

// ── Course completion ─────────────────────────────────────────────────────────

export interface CourseCompletionPoint {
  courseId: string
  label: string
  totalEnrolled: number
  completed: number
  completionRate: number
}

export const fetchCourseCompletionRates = (range: AnalyticsRange = '12m') =>
  apiFetch<{ success: boolean; data: CourseCompletionPoint[] }>(
    `/api/admin/analytics/course-completion?range=${range}`,
  ).then((r) => r.data)

// ── Course performance table ──────────────────────────────────────────────────

export interface CoursePerformanceRow {
  courseId: string
  title: string
  enrolled: number
  completionRate: number
  certificates: number
}

export const fetchCoursePerformance = () =>
  apiFetch<{ success: boolean; data: CoursePerformanceRow[] }>(
    '/api/admin/analytics/course-performance',
  ).then((r) => r.data)

// ── Stakeholder KPIs ──────────────────────────────────────────────────────────

export interface StakeholderKpis {
  expert: number
  vc: number
  government: number
  corporate: number
  university: number
  incubator: number
  total: number
}

export const fetchStakeholderKpis = () =>
  apiFetch<{ success: boolean; data: StakeholderKpis }>(
    '/api/admin/analytics/stakeholder-kpis',
  ).then((r) => r.data)

// ── Stakeholder trend ─────────────────────────────────────────────────────────

export const fetchStakeholderTrend = (range: AnalyticsRange) =>
  apiFetch<{ success: boolean; data: TrendPoint[] }>(
    `/api/admin/analytics/stakeholder-trend?range=${range}`,
  ).then((r) => r.data)

export interface StakeholderTrendByTypePoint {
  label: string
  expert: number
  vc: number
  government: number
  corporate: number
  university: number
  incubator: number
}

export const fetchStakeholderTrendByType = (range: AnalyticsRange) =>
  apiFetch<{ success: boolean; data: StakeholderTrendByTypePoint[] }>(
    `/api/admin/analytics/stakeholder-trend-by-type?range=${range}`,
  ).then((r) => r.data)

// ── Kept for Overview dashboard (unchanged) ───────────────────────────────────

export interface KpiStats {
  totalUsers: number
  activeCourses: number
  certificatesIssued: number
  activeLearnersThisMonth: number
}

export const fetchAdminKpiStats = () =>
  apiFetch<{ success: boolean; data: KpiStats }>('/api/admin/stats').then(
    (r) => r.data,
  )

export interface CourseEngagementPoint {
  courseId: string
  label: string
  activeLearners: number
}

export const fetchEnrollmentTrend = () =>
  apiFetch<{ success: boolean; data: TrendPoint[] }>(
    '/api/admin/analytics/enrollments',
  ).then((r) => r.data)

export const fetchCourseEngagement = () =>
  apiFetch<{ success: boolean; data: CourseEngagementPoint[] }>(
    '/api/admin/analytics/course-engagement',
  ).then((r) => r.data)

// ── Impact (admin home) ──────────────────────────────────────────────────────

export interface ImpactSummary {
  learners: number
  newLearners30d: number
  activeLearners30d: number
  countries: number
  lessonsCompleted: number
  coursesCompleted: number
  certificates: number
  mentorSessions: number
  journeysStarted: number
  offersRedeemed: number
}

export interface ImpactMonth {
  month: string
  activeLearners: number
  lessonsCompleted: number
  coursesCompleted: number
  certificates: number
}

export interface Impact {
  summary: ImpactSummary
  monthly: ImpactMonth[]
  journeys: { journey: string; learners: number }[]
  countries: { country: string; learners: number }[]
}

export const fetchImpact = () =>
  apiFetch<{ success: boolean; data: Impact }>('/api/admin/analytics/impact').then((r) => r.data)

// ── Analytics page insights (range KPIs vs previous period, charts) ─────────

export interface KpiDelta {
  current: number
  previous: number
}

export interface AnalyticsInsights {
  range: AnalyticsRange
  kpis: {
    newLearners: KpiDelta
    activeLearners: KpiDelta
    lessonsCompleted: KpiDelta
    coursesCompleted: KpiDelta
    certificates: KpiDelta
    mentorSessions: KpiDelta
    offersRedeemed: KpiDelta
    journeysStarted: KpiDelta
  }
  series: {
    bucket: string
    newLearners: number
    activeLearners: number
    lessonsCompleted: number
    sessionsBooked: number
    sessionsCompleted: number
    sessionsCancelled: number
  }[]
  funnel: { step: string; learners: number }[]
  journeyMix: { journey: string; count: number }[]
  weekdays: { day: string; activeLearners: number }[]
  countries: { country: string; learners: number }[]
}

export const fetchAnalyticsInsights = (range: AnalyticsRange) =>
  apiFetch<{ success: boolean; data: AnalyticsInsights }>(`/api/admin/analytics/insights?range=${range}`).then((r) => r.data)
