import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * The admin home's impact view: what AI Amplify has done for small businesses,
 * counted from learning activity rather than sign-ups alone.
 */

export interface ImpactSummary {
  learners: number;
  activeLearners30d: number;
  countries: number;
  lessonsCompleted: number;
  coursesCompleted: number;
  certificates: number;
  mentorSessions: number;
  aiExams: number;
  aiExamAvgScore: number | null;
  journeysStarted: number;
  offersRedeemed: number;
  newLearners30d: number;
}

export interface MonthPoint {
  month: string; // "2026-10"
  [series: string]: number | string;
}

export interface Impact {
  summary: ImpactSummary;
  monthly: MonthPoint[]; // active learners, lessons completed, courses completed, certificates
  journeys: { journey: string; learners: number }[];
  countries: { country: string; learners: number }[];
}

const num = (v: unknown) => Number(v ?? 0);
type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db.execute(q)).rows as Row[];
const one = async (q: ReturnType<typeof sql>): Promise<Row> => (await rows(q))[0] ?? {};

// Countries are stored as names, except early Anna chat sign-ups that stored
// ISO codes ("AE"): fold those into names so a country isn't counted twice.
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export function countryLabel(raw: string): string {
  const v = raw.trim();
  if (/^[A-Za-z]{2}$/.test(v)) {
    try {
      return regionNames.of(v.toUpperCase()) ?? v;
    } catch {
      return v;
    }
  }
  return v;
}

/** The last 12 months as "YYYY-MM", oldest first. */
function last12Months(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function getImpact(): Promise<Impact> {
  const [s, lessons, journeysStarted, countryRows, journeyRow, active, lessonsByMonth, coursesByMonth, certsByMonth] =
    await Promise.all([
      one(sql`
        SELECT
          (SELECT count(*) FROM users WHERE role = 'sme') AS learners,
          (SELECT count(*) FROM users WHERE role = 'sme' AND created_at >= now() - interval '30 days') AS new_learners,
          (SELECT count(DISTINCT user_id) FROM learner_activity_days WHERE day >= current_date - 30) AS active_30d,
          (SELECT count(*) FROM user_course_progress WHERE completed_at IS NOT NULL) AS courses_completed,
          (SELECT count(*) FROM course_certificates) AS certificates,
          (SELECT count(*) FROM mentor_sessions WHERE status <> 'cancelled') AS mentor_sessions,
          (SELECT count(*) FROM examiner_attempts) AS ai_exams,
          (SELECT round(avg(overall_score)) FROM examiner_attempts) AS ai_exam_avg,
          (SELECT count(*) FROM offer_redemptions) AS offers_redeemed
      `),
      one(sql`
        SELECT
          (SELECT count(*) FROM user_learning_block_progress WHERE status = 'completed')
          + (SELECT count(*) FROM cod_user_content_progress WHERE status = 'completed')
          + (SELECT count(*) FROM both_user_item_progress WHERE status = 'completed') AS n
      `),
      one(sql`
        SELECT
          (SELECT count(*) FROM user_learning_path)
          + (SELECT count(*) FROM cod_user_paths)
          + (SELECT count(*) FROM both_user_paths) AS n
      `),
      rows(sql`
        SELECT country, count(*) AS n FROM users
        WHERE role = 'sme' AND coalesce(trim(country), '') <> ''
        GROUP BY country
      `),
      one(sql`
        SELECT
          (SELECT count(DISTINCT user_id) FROM course_enrollments) AS courses,
          (SELECT count(DISTINCT user_id) FROM user_learning_path) AS learning_path,
          (SELECT count(DISTINCT user_id) FROM cod_user_paths) AS content_on_demand,
          (SELECT count(DISTINCT user_id) FROM both_user_paths) AS blended,
          (SELECT count(DISTINCT user_id) FROM examiner_attempts) AS ai_examiner,
          (SELECT count(DISTINCT sme_user_id) FROM mentor_sessions WHERE status <> 'cancelled') AS human_mentors,
          (SELECT count(DISTINCT user_id) FROM offer_redemptions) AS offers
      `),
      rows(sql`
        SELECT to_char(date_trunc('month', day), 'YYYY-MM') AS month, count(DISTINCT user_id) AS n
        FROM learner_activity_days WHERE day >= date_trunc('month', current_date) - interval '11 months'
        GROUP BY 1
      `),
      rows(sql`
        SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month, count(*) AS n FROM (
          SELECT completed_at FROM user_learning_block_progress WHERE status = 'completed'
          UNION ALL SELECT completed_at FROM cod_user_content_progress WHERE status = 'completed'
          UNION ALL SELECT completed_at FROM both_user_item_progress WHERE status = 'completed'
        ) t
        WHERE completed_at >= date_trunc('month', current_date) - interval '11 months'
        GROUP BY 1
      `),
      rows(sql`
        SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month, count(*) AS n
        FROM user_course_progress
        WHERE completed_at >= date_trunc('month', current_date) - interval '11 months'
        GROUP BY 1
      `),
      rows(sql`
        SELECT to_char(date_trunc('month', issued_at), 'YYYY-MM') AS month, count(*) AS n
        FROM course_certificates
        WHERE issued_at >= date_trunc('month', current_date) - interval '11 months'
        GROUP BY 1
      `),
    ]);

  const byCountry = new Map<string, number>();
  for (const r of countryRows) {
    const label = countryLabel(String(r["country"]));
    byCountry.set(label, (byCountry.get(label) ?? 0) + num(r["n"]));
  }
  const countries = [...byCountry.entries()]
    .map(([country, learners]) => ({ country, learners }))
    .sort((a, b) => b.learners - a.learners);

  const index = (list: Row[]) => new Map(list.map((r) => [String(r["month"]), num(r["n"])]));
  const [a, l, c, ce] = [index(active), index(lessonsByMonth), index(coursesByMonth), index(certsByMonth)];
  const monthly = last12Months().map((month) => ({
    month,
    activeLearners: a.get(month) ?? 0,
    lessonsCompleted: l.get(month) ?? 0,
    coursesCompleted: c.get(month) ?? 0,
    certificates: ce.get(month) ?? 0,
  }));

  const journeys = [
    { journey: "Courses", learners: num(journeyRow["courses"]) },
    { journey: "Learning Path", learners: num(journeyRow["learning_path"]) },
    { journey: "Content on Demand", learners: num(journeyRow["content_on_demand"]) },
    { journey: "Blended Learning", learners: num(journeyRow["blended"]) },
    { journey: "AI Examiner", learners: num(journeyRow["ai_examiner"]) },
    { journey: "Human mentors", learners: num(journeyRow["human_mentors"]) },
    { journey: "Partner offers", learners: num(journeyRow["offers"]) },
  ];

  return {
    summary: {
      learners: num(s["learners"]),
      newLearners30d: num(s["new_learners"]),
      activeLearners30d: num(s["active_30d"]),
      countries: countries.length,
      lessonsCompleted: num(lessons["n"]),
      coursesCompleted: num(s["courses_completed"]),
      certificates: num(s["certificates"]),
      mentorSessions: num(s["mentor_sessions"]),
      aiExams: num(s["ai_exams"]),
      aiExamAvgScore: s["ai_exam_avg"] == null ? null : num(s["ai_exam_avg"]),
      journeysStarted: num(journeysStarted["n"]),
      offersRedeemed: num(s["offers_redeemed"]),
    },
    monthly,
    journeys,
    countries: countries.slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Analytics page: range KPIs with change vs the previous period, and charts
// ---------------------------------------------------------------------------

export type InsightRange = "7d" | "30d" | "12m";

export interface KpiDelta {
  current: number;
  previous: number;
}

export interface AnalyticsInsights {
  range: InsightRange;
  kpis: {
    newLearners: KpiDelta;
    activeLearners: KpiDelta;
    lessonsCompleted: KpiDelta;
    coursesCompleted: KpiDelta;
    certificates: KpiDelta;
    mentorSessions: KpiDelta;
    aiExams: KpiDelta;
    offersRedeemed: KpiDelta;
    journeysStarted: KpiDelta;
    aiExamAvgScore: number | null;
  };
  /** One point per day (7d, 30d) or month (12m). */
  series: { bucket: string; newLearners: number; activeLearners: number; lessonsCompleted: number; sessionsBooked: number; sessionsCompleted: number; sessionsCancelled: number }[];
  /** All time, learners only: how far learners get. */
  funnel: { step: string; learners: number }[];
  /** Journeys started in the period. */
  journeyMix: { journey: string; count: number }[];
  aiExamScores: { band: string; attempts: number }[];
  aiExamModes: { mode: string; attempts: number }[];
  weekdays: { day: string; activeLearners: number }[];
  countries: { country: string; learners: number }[];
}

const RANGE_DAYS: Record<InsightRange, number> = { "7d": 7, "30d": 30, "12m": 365 };

function buckets(range: InsightRange, now: Date): string[] {
  const out: string[] = [];
  if (range === "12m") {
    for (let i = 11; i >= 0; i--) {
      const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }
  const days = RANGE_DAYS[range];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function getAnalyticsInsights(range: InsightRange): Promise<AnalyticsInsights> {
  const days = RANGE_DAYS[range];
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const before = new Date(since.getTime() - days * 86_400_000);
  const unit = range === "12m" ? "month" : "day";
  const fmt = range === "12m" ? "YYYY-MM" : "YYYY-MM-DD";

  // One query per window; the same SQL counts the current and the previous period.
  const windowCounts = (from: Date, to: Date) =>
    one(sql`
      SELECT
        (SELECT count(*) FROM users WHERE role = 'sme' AND created_at >= ${from} AND created_at < ${to}) AS new_learners,
        (SELECT count(DISTINCT user_id) FROM learner_activity_days WHERE day >= ${from}::date AND day < ${to}::date) AS active_learners,
        ((SELECT count(*) FROM user_learning_block_progress WHERE status = 'completed' AND completed_at >= ${from} AND completed_at < ${to})
          + (SELECT count(*) FROM cod_user_content_progress WHERE status = 'completed' AND completed_at >= ${from} AND completed_at < ${to})
          + (SELECT count(*) FROM both_user_item_progress WHERE status = 'completed' AND completed_at >= ${from} AND completed_at < ${to})) AS lessons,
        (SELECT count(*) FROM user_course_progress WHERE completed_at >= ${from} AND completed_at < ${to}) AS courses,
        (SELECT count(*) FROM course_certificates WHERE issued_at >= ${from} AND issued_at < ${to}) AS certificates,
        (SELECT count(*) FROM mentor_sessions WHERE status <> 'cancelled' AND booked_at >= ${from} AND booked_at < ${to}) AS sessions,
        (SELECT count(*) FROM examiner_attempts WHERE created_at >= ${from} AND created_at < ${to}) AS exams,
        (SELECT round(avg(overall_score)) FROM examiner_attempts WHERE created_at >= ${from} AND created_at < ${to}) AS exam_avg,
        (SELECT count(*) FROM offer_redemptions WHERE redeemed_at >= ${from} AND redeemed_at < ${to}) AS offers,
        ((SELECT count(*) FROM user_learning_path WHERE generated_at >= ${from} AND generated_at < ${to})
          + (SELECT count(*) FROM cod_user_paths WHERE created_at >= ${from} AND created_at < ${to})
          + (SELECT count(*) FROM both_user_paths WHERE created_at >= ${from} AND created_at < ${to})) AS journeys
    `);

  const [cur, prev, learnerSeries, activeSeries, lessonSeries, sessionSeries, funnel, mix, scores, modes, weekdays, countryRows] =
    await Promise.all([
      windowCounts(since, now),
      windowCounts(before, since),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, created_at), ${fmt}) AS b, count(*) AS n
        FROM users WHERE role = 'sme' AND created_at >= date_trunc(${unit}, ${since}::timestamp) GROUP BY 1`),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, day), ${fmt}) AS b, count(DISTINCT user_id) AS n
        FROM learner_activity_days WHERE day >= date_trunc(${unit}, ${since}::timestamp) GROUP BY 1`),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, completed_at), ${fmt}) AS b, count(*) AS n FROM (
          SELECT completed_at FROM user_learning_block_progress WHERE status = 'completed'
          UNION ALL SELECT completed_at FROM cod_user_content_progress WHERE status = 'completed'
          UNION ALL SELECT completed_at FROM both_user_item_progress WHERE status = 'completed'
        ) t WHERE completed_at >= date_trunc(${unit}, ${since}::timestamp) GROUP BY 1`),
      rows(sql`
        SELECT to_char(date_trunc(${unit}, booked_at), ${fmt}) AS b,
          count(*) FILTER (WHERE status <> 'cancelled') AS booked,
          count(*) FILTER (WHERE status = 'completed') AS completed,
          count(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM mentor_sessions WHERE booked_at >= date_trunc(${unit}, ${since}::timestamp) GROUP BY 1`),
      one(sql`
        WITH learners AS (SELECT id FROM users WHERE role = 'sme')
        SELECT
          (SELECT count(*) FROM learners) AS registered,
          (SELECT count(*) FROM learners l WHERE EXISTS (SELECT 1 FROM course_enrollments e WHERE e.user_id = l.id)
             OR EXISTS (SELECT 1 FROM user_learning_path p WHERE p.user_id = l.id)
             OR EXISTS (SELECT 1 FROM cod_user_paths p WHERE p.user_id = l.id)
             OR EXISTS (SELECT 1 FROM both_user_paths p WHERE p.user_id = l.id)) AS started,
          (SELECT count(*) FROM learners l WHERE EXISTS (SELECT 1 FROM user_learning_block_progress x WHERE x.user_id = l.id AND x.status = 'completed')
             OR EXISTS (SELECT 1 FROM cod_user_content_progress x WHERE x.user_id = l.id AND x.status = 'completed')
             OR EXISTS (SELECT 1 FROM both_user_item_progress x WHERE x.user_id = l.id AND x.status = 'completed')) AS lesson,
          (SELECT count(DISTINCT user_id) FROM user_course_progress WHERE completed_at IS NOT NULL) AS course,
          (SELECT count(DISTINCT user_id) FROM course_certificates) AS certified
      `),
      one(sql`
        SELECT
          (SELECT count(*) FROM course_enrollments WHERE enrolled_at >= ${since}) AS courses,
          (SELECT count(*) FROM user_learning_path WHERE generated_at >= ${since}) AS learning_path,
          (SELECT count(*) FROM cod_user_paths WHERE created_at >= ${since}) AS cod,
          (SELECT count(*) FROM both_user_paths WHERE created_at >= ${since}) AS blended,
          (SELECT count(*) FROM examiner_attempts WHERE created_at >= ${since}) AS exams,
          (SELECT count(*) FROM mentor_sessions WHERE status <> 'cancelled' AND booked_at >= ${since}) AS mentors
      `),
      rows(sql`
        SELECT CASE WHEN overall_score >= 80 THEN '80-100' WHEN overall_score >= 60 THEN '60-79'
                    WHEN overall_score >= 40 THEN '40-59' ELSE '0-39' END AS band, count(*) AS n
        FROM examiner_attempts WHERE created_at >= ${since} GROUP BY 1`),
      rows(sql`SELECT mode, count(*) AS n FROM examiner_attempts WHERE created_at >= ${since} GROUP BY 1`),
      rows(sql`
        SELECT extract(isodow FROM day)::int AS d, count(DISTINCT user_id) AS n
        FROM learner_activity_days WHERE day >= ${since}::date GROUP BY 1`),
      rows(sql`SELECT country, count(*) AS n FROM users WHERE role = 'sme' AND coalesce(trim(country), '') <> '' GROUP BY country`),
    ]);

  const delta = (k: string): KpiDelta => ({ current: num(cur[k]), previous: num(prev[k]) });
  const idx = (list: Row[], key = "n") => new Map(list.map((r) => [String(r["b"]), num(r[key])]));
  const [ln, ac, ls, sb, sc, sx] = [idx(learnerSeries), idx(activeSeries), idx(lessonSeries), idx(sessionSeries, "booked"), idx(sessionSeries, "completed"), idx(sessionSeries, "cancelled")];

  const byCountry = new Map<string, number>();
  for (const r of countryRows) {
    const label = countryLabel(String(r["country"]));
    byCountry.set(label, (byCountry.get(label) ?? 0) + num(r["n"]));
  }

  const scoreMap = new Map(scores.map((r) => [String(r["band"]), num(r["n"])]));
  const dayMap = new Map(weekdays.map((r) => [num(r["d"]), num(r["n"])]));

  return {
    range,
    kpis: {
      newLearners: delta("new_learners"),
      activeLearners: delta("active_learners"),
      lessonsCompleted: delta("lessons"),
      coursesCompleted: delta("courses"),
      certificates: delta("certificates"),
      mentorSessions: delta("sessions"),
      aiExams: delta("exams"),
      offersRedeemed: delta("offers"),
      journeysStarted: delta("journeys"),
      aiExamAvgScore: cur["exam_avg"] == null ? null : num(cur["exam_avg"]),
    },
    series: buckets(range, now).map((b) => ({
      bucket: b,
      newLearners: ln.get(b) ?? 0,
      activeLearners: ac.get(b) ?? 0,
      lessonsCompleted: ls.get(b) ?? 0,
      sessionsBooked: sb.get(b) ?? 0,
      sessionsCompleted: sc.get(b) ?? 0,
      sessionsCancelled: sx.get(b) ?? 0,
    })),
    funnel: [
      { step: "Registered", learners: num(funnel["registered"]) },
      { step: "Started learning", learners: num(funnel["started"]) },
      { step: "Completed a lesson", learners: num(funnel["lesson"]) },
      { step: "Completed a course", learners: num(funnel["course"]) },
      { step: "Earned a certificate", learners: num(funnel["certified"]) },
    ],
    journeyMix: [
      { journey: "Course enrollments", count: num(mix["courses"]) },
      { journey: "Learning Path", count: num(mix["learning_path"]) },
      { journey: "Content on Demand", count: num(mix["cod"]) },
      { journey: "Blended Learning", count: num(mix["blended"]) },
      { journey: "AI Examiner", count: num(mix["exams"]) },
      { journey: "Mentor sessions", count: num(mix["mentors"]) },
    ],
    aiExamScores: ["0-39", "40-59", "60-79", "80-100"].map((band) => ({ band, attempts: scoreMap.get(band) ?? 0 })),
    aiExamModes: modes.map((r) => ({ mode: String(r["mode"]), attempts: num(r["n"]) })).sort((a, b) => b.attempts - a.attempts),
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => ({ day, activeLearners: dayMap.get(i + 1) ?? 0 })),
    countries: [...byCountry.entries()].map(([country, learners]) => ({ country, learners })).sort((a, b) => b.learners - a.learners).slice(0, 10),
  };
}
