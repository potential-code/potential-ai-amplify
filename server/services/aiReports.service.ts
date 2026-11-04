import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { aiReports, users } from "../db/schema";
import { AppError } from "../utils/app-error";
import { notify } from "./notifications.service";

/**
 * AI safety: learners report an AI answer (wrong, harmful, inappropriate…)
 * and admins review the reports. Every admin hears about a new report in the
 * bell. The reported text is stored and shown as plain text, never rendered.
 */

export const REPORT_REASONS = ["wrong", "harmful", "inappropriate", "unhelpful", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ["open", "reviewed", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

const REASON_LABEL: Record<ReportReason, string> = {
  wrong: "Wrong or misleading",
  harmful: "Harmful or unsafe",
  inappropriate: "Inappropriate",
  unhelpful: "Not helpful",
  other: "Something else",
};

/** "mentor:marketing-coach" → "AI mentor (marketing coach)". */
export function surfaceLabel(surface: string): string {
  const named: Record<string, string> = {
    "ask-sana": "Ask Anna",
    "course-help": "Course helper",
    "multi-learning": "Multi Learning tutor",
    examiner: "AI Examiner",
    "learning-path": "Learning Path",
    "learning-path-setup": "Learning Path setup",
    "content-on-demand": "Content on Demand",
    "content-on-demand-setup": "Content on Demand setup",
    blended: "Blended Learning",
    "blended-setup": "Blended Learning setup",
  };
  if (named[surface]) return named[surface]!;
  if (surface.startsWith("mentor:")) return `AI mentor (${surface.slice(7).replace(/-/g, " ")})`;
  return surface;
}

export interface NewReport {
  surface: string;
  reason: ReportReason;
  note?: string | null;
  reply: string;
  question?: string | null;
  page?: string | null;
}

export async function createReport(userId: string, input: NewReport) {
  const [row] = await db
    .insert(aiReports)
    .values({
      userId,
      surface: input.surface,
      reason: input.reason,
      note: input.note?.trim() || null,
      reply: input.reply.slice(0, 12_000),
      question: input.question?.trim().slice(0, 4_000) || null,
      page: input.page?.slice(0, 300) || null,
    })
    .returning({ id: aiReports.id });
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  if (admins.length) {
    // Awaited so the report and its alert land together (notify never throws).
    await notify(
      admins.map((a) => a.id),
      {
        type: "ai_report",
        title: `AI answer reported: ${REASON_LABEL[input.reason]}`,
        body: `${surfaceLabel(input.surface)}. Review it on AI safety.`,
        link: "/admin/ai-safety",
      },
    );
  }
  return { id: row!.id };
}

export async function listReports(status: ReportStatus | "all") {
  const reviewer = sql<string | null>`(SELECT full_name FROM users r WHERE r.id = ${aiReports.reviewedBy})`;
  const rows = await db
    .select({
      report: aiReports,
      reporterName: users.fullName,
      reporterEmail: users.email,
      reviewerName: reviewer,
    })
    .from(aiReports)
    .leftJoin(users, eq(users.id, aiReports.userId))
    .where(status === "all" ? undefined : eq(aiReports.status, status))
    .orderBy(desc(aiReports.createdAt))
    .limit(200);
  const counts = await db.select({ status: aiReports.status, n: sql<number>`count(*)::int` }).from(aiReports).groupBy(aiReports.status);
  return {
    counts: Object.fromEntries(REPORT_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])) as Record<ReportStatus, number>,
    reports: rows.map((r) => ({
      ...r.report,
      createdAt: r.report.createdAt.toISOString(),
      reviewedAt: r.report.reviewedAt?.toISOString() ?? null,
      surfaceLabel: surfaceLabel(r.report.surface),
      reasonLabel: REASON_LABEL[r.report.reason as ReportReason] ?? r.report.reason,
      reporterName: r.reporterName,
      reporterEmail: r.reporterEmail,
      reviewerName: r.reviewerName,
    })),
  };
}

export async function updateReport(adminId: string, id: string, patch: { status?: ReportStatus; adminNote?: string | null }) {
  const set: Partial<typeof aiReports.$inferInsert> = {};
  if (patch.adminNote !== undefined) set.adminNote = patch.adminNote?.trim() || null;
  if (patch.status) {
    set.status = patch.status;
    set.reviewedBy = patch.status === "open" ? null : adminId;
    set.reviewedAt = patch.status === "open" ? null : new Date();
  }
  const rows = await db.update(aiReports).set(set).where(and(eq(aiReports.id, id))).returning({ id: aiReports.id });
  if (!rows.length) throw new AppError("Report not found", 404, "NOT_FOUND");
  return { ok: true };
}
