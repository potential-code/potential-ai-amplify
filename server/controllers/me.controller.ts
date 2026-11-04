import type { Request, Response, NextFunction } from "express";
import { getStreak } from "../services/streak.service";
import { getLeaderboard, listBadges, pointsEarned, setLeaderboardVisibility, type LeaderboardPeriod } from "../services/achievements.service";
import { learnerNotificationsEnabled, listNotifications, markAllRead, markRead } from "../services/notifications.service";
import { activeBanners } from "../services/announcements.service";

/**
 * GET /api/me/streak
 *
 * The authenticated learner's streak and daily goal: current and longest
 * streak, steps completed today, the daily goal and this week (Monday to
 * Sunday in the learner's timezone).
 */
export async function getMyStreak(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await getStreak(req.user!.userId) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/me/notifications — the latest 30 and the unread count. */
export async function getMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // While learner notifications are off, learners have no bell at all.
    const enabled = req.user!.role !== "sme" || learnerNotificationsEnabled();
    res.json({ data: { ...(await listNotifications(req.user!.userId)), enabled } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/me/notifications/:id/read */
export async function readMyNotification(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !(await markRead(req.user!.userId, req.params.id))) {
      res.status(404).json({ success: false, error: { message: "Notification not found", code: "NOT_FOUND" } });
      return;
    }
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/me/notifications/read-all */
export async function readAllMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: { marked: await markAllRead(req.user!.userId) } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/me/achievements — points (balance and earned) and every badge with progress. */
export async function getMyAchievements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const [points, badges] = await Promise.all([pointsEarned(userId), listBadges(userId)]);
    res.json({ data: { ...points, badges } });
  } catch (err) {
    next(err);
  }
}

const PERIODS: LeaderboardPeriod[] = ["week", "month", "all"];

/** GET /api/me/leaderboard?period=week|month|all — top learners by points earned, and the viewer's place. */
export async function getMyLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const period = PERIODS.includes(req.query.period as LeaderboardPeriod) ? (req.query.period as LeaderboardPeriod) : "month";
    res.json({ data: await getLeaderboard(req.user!.userId, period) });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/me/leaderboard-visibility { show } */
export async function setMyLeaderboardVisibility(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { show } = req.body as { show: boolean };
    await setLeaderboardVisibility(req.user!.userId, show);
    res.json({ data: { show } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/me/announcements — announcement banners for the user's role. */
export async function getMyAnnouncements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await activeBanners(req.user!.role) });
  } catch (err) {
    next(err);
  }
}
