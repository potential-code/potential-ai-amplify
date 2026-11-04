import { sql } from "drizzle-orm";
import { db } from "../db";
import { sendMail } from "../mail/mailer";
import { logger } from "../config/logger";
import { notify, whenLabel } from "./notifications.service";
import { joinDetails, upcomingBookings } from "./liveEvents.service";
import { reconcileAttendance, reconcileZoom } from "./eventZoom.service";

/**
 * Scheduled reminders, run every few minutes by the API process:
 *  - a session reminder 24 hours and 1 hour before each confirmed mentor
 *    session, to the learner and the mentor;
 *  - a nudge to a learner who started a course but hasn't learned for 7 days
 *    (at most once a week), pointing at the course they touched last;
 *  - an event reminder 24 hours and 1 hour before each live event a learner
 *    booked (moving the event re-arms them);
 *  - Zoom upkeep: meetings and bookings that didn't sync are tried again, and
 *    attendance is read back after Zoom events end.
 *
 * Every reminder carries a dedupe key, so a second run, a retry or a second
 * server instance can't send it twice. In-app always; email copies of session
 * reminders only when REMINDER_EMAILS_ENABLED=true (off until the client
 * agrees what goes out).
 */

const INTERVAL_MS = 15 * 60 * 1000;
const emailEnabled = () => process.env["REMINDER_EMAILS_ENABLED"] === "true";

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Row[];

/** ISO week, e.g. "2026-W40", so a nudge can go at most once a week. */
function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+t - +start) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function sendSessionReminders(now = new Date()): Promise<number> {
  const upcoming = await rows(sql`
    SELECT s.id, s.sme_user_id, s.mentor_user_id, slot.starts_at,
           coalesce(s.meeting_link, m.meeting_link) AS meeting_link,
           sme.full_name AS sme_name, sme.email AS sme_email, sme.timezone AS sme_tz,
           m.full_name AS mentor_name, m.email AS mentor_email, m.timezone AS mentor_tz
    FROM mentor_sessions s
    JOIN mentor_availability_slots slot ON slot.id = s.slot_id
    JOIN users sme ON sme.id = s.sme_user_id
    JOIN users m ON m.id = s.mentor_user_id
    WHERE s.status = 'confirmed'
      AND slot.starts_at > ${now}
      AND slot.starts_at <= ${new Date(+now + 24 * 3_600_000)}
  `);
  let sent = 0;
  for (const r of upcoming) {
    const startsAt = new Date(String(r.starts_at));
    const minutes = (+startsAt - +now) / 60_000;
    const window = minutes <= 60 ? "1h" : "24h";
    const startsIn = window === "1h" ? "within the hour" : "tomorrow";
    const sides = [
      { userId: String(r.sme_user_id), name: r.sme_name, email: r.sme_email, tz: r.sme_tz, other: r.mentor_name, link: "/dashboard/sessions" },
      { userId: String(r.mentor_user_id), name: r.mentor_name, email: r.mentor_email, tz: r.mentor_tz, other: r.sme_name, link: "/mentor/dashboard/sessions" },
    ];
    for (const side of sides) {
      const created = await notify(side.userId, {
        type: "session_reminder",
        title: window === "1h" ? `Your session with ${side.other} starts soon` : `Session tomorrow with ${side.other}`,
        body: whenLabel(startsAt, side.tz as string | null),
        link: side.link,
        dedupeKey: `session:${r.id}:reminder:${window}`,
      });
      sent += created;
      if (created && emailEnabled() && side.email) {
        sendMail({
          to: String(side.email),
          subject: window === "1h" ? "Your session starts soon" : "Your session is tomorrow",
          template: "session-reminder",
          context: {
            name: side.name,
            otherName: side.other,
            startsIn,
            sessionDate: whenLabel(startsAt, side.tz as string | null),
            meetingLink: r.meeting_link ?? null,
          },
        }).catch((err) => logger.error({ err }, "Session reminder email failed"));
      }
    }
  }
  return sent;
}

export async function sendCourseNudges(now = new Date()): Promise<number> {
  // Learners with a started, unfinished course and no learning step in 7 days.
  const idle = await rows(sql`
    SELECT DISTINCT ON (p.user_id) p.user_id, p.course_id, p.progress_percentage, c.title
    FROM user_course_progress p
    JOIN users u ON u.id = p.user_id AND u.role = 'sme'
    JOIN courses c ON c.id = p.course_id
    WHERE p.completed_at IS NULL
      AND p.progress_percentage > 0
      AND p.updated_at < ${new Date(+now - 7 * 86_400_000)}
      AND NOT EXISTS (
        SELECT 1 FROM learner_activity_days d
        WHERE d.user_id = p.user_id AND d.day >= (${now}::date - 7)
      )
    ORDER BY p.user_id, p.updated_at DESC
  `);
  const week = isoWeek(now);
  let sent = 0;
  for (const r of idle) {
    sent += await notify(String(r.user_id), {
      type: "course_nudge",
      title: `Pick up ${r.title} where you left off`,
      body: `You're ${r.progress_percentage}% through. A few minutes today keeps it moving.`,
      link: `/dashboard/courses/${r.course_id}`,
      dedupeKey: `nudge:${week}`,
    });
  }
  return sent;
}

export async function sendEventReminders(now = new Date()): Promise<number> {
  const due = await upcomingBookings("24 hours");
  let sent = 0;
  for (const { event, rsvp, email, name, timezone } of due) {
    const minutes = (event.startsAt.getTime() - now.getTime()) / 60_000;
    const window = minutes <= 60 ? "1h" : "24h";
    const startsIn = window === "1h" ? `in ${Math.max(1, Math.round(minutes))} minutes` : "tomorrow";
    const when = whenLabel(event.startsAt, timezone);
    // The start time is in the key, so moving the event re-arms its reminders.
    const created = await notify(rsvp.userId, {
      type: "event_reminder",
      title: window === "1h" ? `Starting soon: ${event.title}` : `Tomorrow: ${event.title}`,
      body: `${when}. ${event.format === "in_person" ? `At ${event.location}.` : "Join from the Events page."}`,
      link: "/dashboard/events",
      dedupeKey: `event:${event.id}:${event.startsAt.getTime()}:reminder:${window}`,
    });
    sent += created;
    if (created && emailEnabled()) {
      void sendMail({
        to: email,
        subject: window === "1h" ? `Starting soon: ${event.title}` : `Tomorrow: ${event.title}`,
        template: "event-reminder",
        context: { name, title: event.title, when, startsIn, ...joinDetails(event, rsvp) },
      }).catch((err) => logger.error({ err }, "Event reminder email failed"));
    }
  }
  return sent;
}

export async function runReminders(now = new Date()): Promise<{ sessions: number; nudges: number; events: number }> {
  const zoomUpkeep = Promise.all([reconcileZoom(), reconcileAttendance()]).catch((err) => {
    logger.error({ err }, "Zoom upkeep failed");
  });
  const [sessions, nudges, events] = await Promise.all([
    sendSessionReminders(now).catch((err) => {
      logger.error({ err }, "Session reminders failed");
      return 0;
    }),
    sendCourseNudges(now).catch((err) => {
      logger.error({ err }, "Course nudges failed");
      return 0;
    }),
    sendEventReminders(now).catch((err) => {
      logger.error({ err }, "Event reminders failed");
      return 0;
    }),
  ]);
  await zoomUpkeep;
  if (sessions || nudges || events) logger.info({ sessions, nudges, events }, "Reminders sent");
  return { sessions, nudges, events };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the reminder timer (the API process only; never in tests). */
export function startReminders(): void {
  if (timer || process.env["REMINDERS_ENABLED"] === "false") return;
  setTimeout(() => void runReminders(), 60_000);
  timer = setInterval(() => void runReminders(), INTERVAL_MS);
  timer.unref?.();
}
