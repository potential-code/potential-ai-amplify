import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { notifications, users, type Notification } from "../db/schema";

/**
 * In-app notifications (the bell). Creating one never throws into the caller:
 * a notification is a side effect of a booking or a certificate, and must not
 * break it. A `dedupeKey` makes it fire once per user.
 */

export type NotificationType =
  | "session_booked"
  | "session_cancelled"
  | "session_reminder"
  | "certificate"
  | "event_new"
  | "event_recording"
  | "course_nudge"
  | "badge"
  | "organisation"
  | "announcement"
  | "event_booked"
  | "event_changed"
  | "event_cancelled"
  | "event_reminder"
  | "ai_report";

export interface NewNotification {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}

/**
 * Learners get no new notifications until the client has agreed what goes out
 * (LEARNER_NOTIFICATIONS_ENABLED=true). Mentors and admins always do.
 */
export const learnerNotificationsEnabled = () => process.env["LEARNER_NOTIFICATIONS_ENABLED"] === "true";

/** Notifies one or more users. Returns how many were actually created (duplicates skipped). */
export async function notify(userIds: string | string[], n: NewNotification): Promise<number> {
  let ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (!ids.length) return 0;
  try {
    if (!learnerNotificationsEnabled()) {
      const staff = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), sql`${users.role} <> 'sme'`));
      ids = staff.map((u) => u.id);
      if (!ids.length) return 0;
    }
    const rows = await db
      .insert(notifications)
      .values(ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })))
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    return rows.length;
  } catch (err) {
    console.error("[notifications] could not create", n.type, err);
    return 0;
  }
}

/** Notifies every learner (role sme). */
export async function notifyAllLearners(n: NewNotification): Promise<number> {
  if (!learnerNotificationsEnabled()) return 0;
  try {
    const learners = await db.select({ id: users.id }).from(users).where(eq(users.role, "sme"));
    return notify(learners.map((l) => l.id), n);
  } catch (err) {
    console.error("[notifications] could not list learners", err);
    return 0;
  }
}

export async function listNotifications(userId: string, limit = 30): Promise<{ items: Notification[]; unread: number }> {
  const [items, [{ unread }]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return { items, unread };
}

/** Marks one of the user's own notifications read; false if it isn't theirs. */
export async function markRead(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

/** "Mon 5 Oct, 10:00" in the user's timezone (UAE time when unknown). */
export function whenLabel(d: Date, timezone?: string | null): string {
  const tz = timezone || "Asia/Dubai";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  }
}
