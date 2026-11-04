import crypto from "crypto";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { announcements, users, type Announcement } from "../db/schema";
import { sendMail } from "../mail/mailer";
import { logger } from "../config/logger";
import { learnerNotificationsEnabled, notify } from "./notifications.service";

/**
 * Announcements from the AI Amplify team: a dashboard banner, a bell notification
 * and/or an email. Emails only go to people with announcement emails on, and
 * each carries a signed one-click unsubscribe link.
 *
 * Learners get none of the three (banner, bell or email) until the client signs
 * off on learner messages: LEARNER_NOTIFICATIONS_ENABLED=true turns them on.
 * Until then an announcement reaches mentors only.
 */

export type Audience = "learners" | "mentors" | "all";
const ROLES: Record<Audience, string[]> = { learners: ["sme"], mentors: ["mentor"], all: ["sme", "mentor"] };

/** Who an audience reaches right now: learners only once learner messages are on. */
const rolesFor = (audience: Audience): string[] =>
  learnerNotificationsEnabled() ? ROLES[audience] : ROLES[audience].filter((r) => r !== "sme");

export interface NewAnnouncement {
  title: string;
  body: string;
  linkUrl?: string | null;
  linkLabel?: string | null;
  audience: Audience;
  showBanner: boolean;
  /** Days the banner stays up (null: until taken down). */
  bannerDays?: number | null;
  notify: boolean;
  email: boolean;
}

// ── Unsubscribe tokens ───────────────────────────────────────────────────────

function secret(): string {
  const s = process.env["BETTER_AUTH_SECRET"] || process.env["JWT_SECRET"];
  // Never sign with a guessable fallback: anyone could unsubscribe anyone.
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set");
  return s;
}

export function unsubscribeToken(userId: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(`unsubscribe:${userId}`).digest("base64url").slice(0, 32);
  return `${Buffer.from(userId).toString("base64url")}.${mac}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [id64, mac] = String(token).split(".");
  if (!id64 || !mac) return null;
  let userId: string;
  try {
    userId = Buffer.from(id64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = unsubscribeToken(userId).split(".")[1];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? userId : null;
}

export async function setAnnouncementEmails(userId: string, on: boolean): Promise<boolean> {
  const rows = await db.update(users).set({ announcementEmails: on }).where(eq(users.id, userId)).returning({ id: users.id });
  return rows.length > 0;
}

export async function getAnnouncementEmails(userId: string): Promise<boolean> {
  const [u] = await db.select({ on: users.announcementEmails }).from(users).where(eq(users.id, userId));
  return u?.on ?? true;
}

// ── Audience ─────────────────────────────────────────────────────────────────

export async function countAudience(
  audience: Audience,
): Promise<{ people: number; emailable: number; learnersPaused: boolean }> {
  const roles = rolesFor(audience);
  const learnersPaused = ROLES[audience].includes("sme") && !learnerNotificationsEnabled();
  if (!roles.length) return { people: 0, emailable: 0, learnersPaused };
  const [r] = await db
    .select({
      people: sql<number>`count(*)::int`,
      emailable: sql<number>`(count(*) filter (where ${users.announcementEmails}))::int`,
    })
    .from(users)
    .where(inArray(users.role, roles));
  return { people: r?.people ?? 0, emailable: r?.emailable ?? 0, learnersPaused };
}

// ── Create, list, banners ────────────────────────────────────────────────────

const isExternal = (url: string | null | undefined) => !!url && /^https?:\/\//i.test(url);

export async function createAnnouncement(adminId: string, input: NewAnnouncement): Promise<Announcement> {
  const bannerUntil = input.showBanner && input.bannerDays ? new Date(Date.now() + input.bannerDays * 86_400_000) : null;
  const [row] = await db
    .insert(announcements)
    .values({
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl || null,
      linkLabel: input.linkUrl ? input.linkLabel || null : null,
      audience: input.audience,
      showBanner: input.showBanner,
      bannerUntil,
      notified: input.notify,
      emailed: input.email,
      createdBy: adminId,
    })
    .returning();

  const roles = rolesFor(input.audience);
  const people = roles.length
    ? await db
        .select({ id: users.id, role: users.role, fullName: users.fullName, email: users.email, emailsOn: users.announcementEmails })
        .from(users)
        .where(inArray(users.role, roles))
    : [];

  if (input.notify) {
    // Bell: an in-app link goes straight there; otherwise the dashboard (the banner).
    for (const role of ["sme", "mentor"]) {
      const ids = people.filter((p) => p.role === role).map((p) => p.id);
      const home = role === "mentor" ? "/mentor/dashboard" : "/dashboard";
      await notify(ids, {
        type: "announcement",
        title: input.title,
        body: input.body.length > 140 ? `${input.body.slice(0, 137)}…` : input.body,
        link: input.linkUrl && !isExternal(input.linkUrl) ? input.linkUrl : home,
        dedupeKey: `announcement:${row.id}`,
      });
    }
  }

  if (input.email) {
    const recipients = people.filter((p) => p.emailsOn && p.email);
    await db.update(announcements).set({ emailRecipients: recipients.length }).where(eq(announcements.id, row.id));
    row.emailRecipients = recipients.length;
    void sendAnnouncementEmails(row, recipients);
  }
  return row;
}

async function sendAnnouncementEmails(a: Announcement, recipients: { id: string; fullName: string; email: string }[]) {
  const site = process.env["FRONTEND_URL"] ?? "http://localhost:3000";
  const link = a.linkUrl ? (isExternal(a.linkUrl) ? a.linkUrl : `${site}${a.linkUrl}`) : null;
  const paragraphs = a.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let sent = 0;
  // A few at a time: a large audience shouldn't flood the mail provider.
  for (let i = 0; i < recipients.length; i += 5) {
    await Promise.all(
      recipients.slice(i, i + 5).map((r) =>
        sendMail({
          to: r.email,
          subject: a.title,
          template: "announcement",
          context: {
            name: r.fullName.split(/\s+/)[0],
            title: a.title,
            paragraphs,
            link,
            linkLabel: a.linkLabel || "Open AI Amplify",
            unsubscribeUrl: `${site}/unsubscribe?token=${unsubscribeToken(r.id)}`,
          },
        })
          .then(() => void sent++)
          .catch((err) => logger.error({ err, announcement: a.id }, "Announcement email failed")),
      ),
    );
    await new Promise((res) => setTimeout(res, 200));
  }
  logger.info({ announcement: a.id, sent, of: recipients.length }, "Announcement emails sent");
}

export async function listAnnouncements(): Promise<(Announcement & { createdByName: string | null })[]> {
  const rows = await db
    .select({ a: announcements, createdByName: users.fullName })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.createdBy))
    .orderBy(desc(announcements.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r.a, createdByName: r.createdByName }));
}

/** Banners still up for this role. */
export async function activeBanners(role: string): Promise<Announcement[]> {
  const learnersOn = learnerNotificationsEnabled();
  const audiences: Audience[] = role === "mentor" ? ["mentors", "all"] : role === "sme" && learnersOn ? ["learners", "all"] : [];
  if (!audiences.length) return [];
  return db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.showBanner, true),
        isNull(announcements.archivedAt),
        inArray(announcements.audience, audiences),
        or(isNull(announcements.bannerUntil), gt(announcements.bannerUntil, new Date())),
      ),
    )
    .orderBy(desc(announcements.createdAt))
    .limit(3);
}

export async function archiveAnnouncement(id: string): Promise<boolean> {
  const rows = await db.update(announcements).set({ archivedAt: new Date() }).where(eq(announcements.id, id)).returning({ id: announcements.id });
  return rows.length > 0;
}
