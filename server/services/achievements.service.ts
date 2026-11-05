import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { userBadges, users } from "../db/schema";
import { getStreak } from "./streak.service";
import { notify } from "./notifications.service";

/**
 * Badges and the leaderboard. Badges come from what learners already do
 * (streaks, certificates, scores, sessions); each is stored once with the day
 * it was earned and rings the bell once. The leaderboard ranks learners by
 * points earned (points_events), so spending points on offers never costs a
 * rank, and shows only a first name and initial.
 */

interface Stats {
  activeDays: number;
  longestStreak: number;
  certificates: number;
  bestScore: number;
  bestGain: number;
  sessions: number;
  examiner: number;
}

interface BadgeDef {
  key: string;
  title: string;
  description: string;
  target: number;
  value: (s: Stats) => number;
}

/** In display order. Keys are stored in user_badges: never rename one. */
export const BADGES: BadgeDef[] = [
  { key: "first_step", title: "First step", description: "Complete your first learning step", target: 1, value: (s) => s.activeDays },
  { key: "streak_7", title: "On a roll", description: "Learn 7 days in a row", target: 7, value: (s) => s.longestStreak },
  { key: "course_1", title: "Course complete", description: "Earn your first certificate", target: 1, value: (s) => s.certificates },
  { key: "top_marks", title: "Top marks", description: "Score 100% on a quiz or exam", target: 100, value: (s) => s.bestScore },
  { key: "big_leap", title: "Big leap", description: "Score 20 points more in a final exam than in its pre-test", target: 20, value: (s) => s.bestGain },
  { key: "mentored", title: "Mentored", description: "Complete a session with a mentor", target: 1, value: (s) => s.sessions },
  { key: "examined", title: "Real-world ready", description: "Score 70 or more in the AI Examiner", target: 70, value: (s) => s.examiner },
  { key: "course_3", title: "Lifelong learner", description: "Earn 3 certificates", target: 3, value: (s) => s.certificates },
  { key: "streak_30", title: "Habit formed", description: "Learn 30 days in a row", target: 30, value: (s) => s.longestStreak },
];

export interface BadgeView {
  key: string;
  title: string;
  description: string;
  earnedAt: string | null;
  /** How far along, for badges not yet earned. */
  progress: { current: number; target: number };
}

async function statsFor(userId: string): Promise<Stats> {
  const [row] = (
    await db.execute(sql`
      SELECT
        (SELECT count(*) FROM learner_activity_days WHERE user_id = ${userId} AND steps > 0)::int AS active_days,
        (SELECT count(*) FROM course_certificates WHERE user_id = ${userId})::int AS certificates,
        (SELECT coalesce(max(score), 0) FROM assessment_attempts WHERE user_id = ${userId} AND completed_at IS NOT NULL)::int AS best_score,
        (SELECT count(*) FROM mentor_sessions WHERE sme_user_id = ${userId} AND status = 'completed')::int AS sessions,
        (SELECT coalesce(max(overall_score), 0) FROM examiner_attempts WHERE user_id = ${userId})::int AS examiner,
        (
          WITH a AS (
            SELECT s.course_id, s.assessment_type, aa.score, aa.completed_at
            FROM assessment_attempts aa JOIN assessments s ON s.id = aa.assessment_id
            WHERE aa.user_id = ${userId} AND aa.completed_at IS NOT NULL AND aa.score IS NOT NULL
          ),
          pre AS (SELECT DISTINCT ON (course_id) course_id, score FROM a WHERE assessment_type = 'pre' ORDER BY course_id, completed_at),
          post AS (SELECT course_id, max(score) AS score FROM a WHERE assessment_type = 'post' GROUP BY course_id)
          SELECT coalesce(max(post.score - pre.score), 0) FROM pre JOIN post USING (course_id)
        )::int AS best_gain
    `)
  ).rows as Array<Record<string, number>>;
  const streak = await getStreak(userId);
  return {
    activeDays: row.active_days,
    longestStreak: streak.longestStreak,
    certificates: row.certificates,
    bestScore: row.best_score,
    bestGain: row.best_gain,
    sessions: row.sessions,
    examiner: row.examiner,
  };
}

/**
 * Stores any badge the learner has newly earned and rings the bell for it.
 * Never throws: it runs after progress writes, which it must not break.
 */
export async function checkBadges(userId: string): Promise<void> {
  try {
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    if (u?.role !== "sme") return;
    const stats = await statsFor(userId);
    const earned = BADGES.filter((b) => b.value(stats) >= b.target);
    if (!earned.length) return;
    const added = await db
      .insert(userBadges)
      .values(earned.map((b) => ({ userId, badge: b.key })))
      .onConflictDoNothing()
      .returning({ badge: userBadges.badge });
    for (const { badge } of added) {
      const def = BADGES.find((b) => b.key === badge)!;
      await notify(userId, {
        type: "badge",
        title: `New badge: ${def.title}`,
        body: def.description,
        link: "/dashboard/achievements",
        dedupeKey: `badge:${badge}`,
      });
    }
  } catch (err) {
    console.error("[achievements] could not check badges", err);
  }
}

/** Runs checkBadges without making the caller wait for it. */
export function checkBadgesSoon(userId: string): void {
  void checkBadges(userId);
}

export async function listBadges(userId: string): Promise<BadgeView[]> {
  await checkBadges(userId);
  const [stats, rows] = await Promise.all([
    statsFor(userId),
    db.select().from(userBadges).where(eq(userBadges.userId, userId)),
  ]);
  const earnedAt = new Map(rows.map((r) => [r.badge, r.earnedAt.toISOString()]));
  return BADGES.map((b) => ({
    key: b.key,
    title: b.title,
    description: b.description,
    earnedAt: earnedAt.get(b.key) ?? null,
    progress: { current: Math.min(b.value(stats), b.target), target: b.target },
  }));
}

export type LeaderboardPeriod = "week" | "month" | "all";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
  points: number;
  badges: number;
  isYou: boolean;
}

export interface Leaderboard {
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  /** The viewer's own place, also when outside the top list. Null with no points in the period. */
  you: { rank: number; points: number } | null;
  /** The viewer chose not to appear: others don't see them; they still see their own row. */
  hidden: boolean;
  /** Learners with points in the period. */
  total: number;
}

/** "Rashid Al Amri" → "Rashid A." */
export function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Learner";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : parts[0]!;
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "L";
}

const SINCE: Record<LeaderboardPeriod, ReturnType<typeof sql>> = {
  week: sql`now() - interval '7 days'`,
  month: sql`now() - interval '30 days'`,
  all: sql`'-infinity'::timestamp`,
};

export async function getLeaderboard(userId: string, period: LeaderboardPeriod, limit = 10): Promise<Leaderboard> {
  const [me] = await db.select({ show: users.showOnLeaderboard }).from(users).where(eq(users.id, userId));
  const hidden = me ? !me.show : false;
  // The viewer is always ranked among the visible learners, so their own place
  // reads the same whether or not they show themselves to others.
  const rows = (
    await db.execute(sql`
      WITH totals AS (
        SELECT e.user_id, sum(e.amount)::int AS points, max(e.created_at) AS last_at
        FROM points_events e
        JOIN users u ON u.id = e.user_id AND u.role = 'sme'
        WHERE e.created_at >= ${SINCE[period]} AND (u.show_on_leaderboard OR u.id = ${userId})
        GROUP BY e.user_id
        HAVING sum(e.amount) > 0
      ),
      ranked AS (
        SELECT t.*, rank() OVER (ORDER BY t.points DESC)::int AS rank,
               row_number() OVER (ORDER BY t.points DESC, t.last_at ASC) AS pos
        FROM totals t
      )
      SELECT r.user_id, r.points, r.rank, r.pos, u.full_name, u.avatar_url,
             (SELECT count(*) FROM user_badges b WHERE b.user_id = r.user_id)::int AS badges,
             (SELECT count(*) FROM ranked)::int AS total
      FROM ranked r JOIN users u ON u.id = r.user_id
      WHERE r.pos <= ${limit} OR r.user_id = ${userId}
      ORDER BY r.pos
    `)
  ).rows as Array<{ user_id: string; points: number; rank: number; pos: number; full_name: string; avatar_url: string | null; badges: number; total: number }>;

  const mine = rows.find((r) => r.user_id === userId);
  const entries = rows
    .filter((r) => Number(r.pos) <= limit)
    .map((r) => ({
      rank: r.rank,
      name: displayName(r.full_name),
      initials: initialsOf(r.full_name),
      avatarUrl: r.avatar_url,
      points: r.points,
      badges: r.badges,
      isYou: r.user_id === userId,
    }));
  return {
    period,
    entries,
    you: mine ? { rank: mine.rank, points: mine.points } : null,
    hidden,
    total: rows[0]?.total ?? 0,
  };
}

export async function setLeaderboardVisibility(userId: string, show: boolean): Promise<void> {
  await db.update(users).set({ showOnLeaderboard: show }).where(eq(users.id, userId));
}

/** Points earned overall (the balance plus what has been spent on offers). */
export async function pointsEarned(userId: string): Promise<{ balance: number; earned: number; showOnLeaderboard: boolean }> {
  const [row] = (
    await db.execute(sql`
      SELECT u.points AS balance, u.show_on_leaderboard AS show,
             coalesce((SELECT sum(amount) FROM points_events WHERE user_id = u.id), 0)::int AS earned
      FROM users u WHERE u.id = ${userId}
    `)
  ).rows as Array<{ balance: number; earned: number; show: boolean }>;
  return { balance: row?.balance ?? 0, earned: row?.earned ?? 0, showOnLeaderboard: row?.show ?? true };
}
