import { randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { aiTurns, organisations, partnerInvites, users, type Organisation } from "../db/schema";
import { AppError } from "../utils/app-error";
import { sendMail } from "../mail/mailer";
import { getLearningGain, type LearningGain } from "./admin.learningGain.service";
import { learnerNotificationsEnabled, notify } from "./notifications.service";

/**
 * Partner organisations: their learners (joined with the organisation's
 * sign-up code, or added by an admin), their partner contacts (role
 * 'partner', invited by email like mentors), and the read-only dashboard both
 * admins and partner contacts see.
 */

export const ORGANISATION_TYPES = ["government", "university", "corporate", "incubator", "investor", "other"] as const;
export type OrganisationType = (typeof ORGANISATION_TYPES)[number];

const INVITE_DAYS = 7;
// No 0/O, 1/I/L: codes are read aloud and typed from slides.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const frontend = () => (process.env["FRONTEND_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
export const joinLink = (code: string) => `${frontend()}/sign-up?org=${code}`;

// ── Organisations ────────────────────────────────────────────────────────────

export interface OrganisationRow {
  id: string;
  name: string;
  type: string;
  joinCode: string;
  joinLink: string;
  joinEnabled: boolean;
  createdAt: string;
  learners: number;
  activeLearners: number;
  partners: number;
}

export async function listOrganisations(): Promise<OrganisationRow[]> {
  const rows = (
    await db.execute(sql`
      SELECT o.id, o.name, o.type, o.join_code, o.join_enabled, o.created_at,
        (SELECT count(*) FROM users u WHERE u.organisation_id = o.id AND u.role = 'sme')::int AS learners,
        (SELECT count(*) FROM users u WHERE u.organisation_id = o.id AND u.role = 'sme'
           AND u.last_active_at > now() - interval '30 days')::int AS active_learners,
        (SELECT count(*) FROM users u WHERE u.organisation_id = o.id AND u.role = 'partner')::int AS partners
      FROM organisations o
      WHERE o.archived_at IS NULL
      ORDER BY o.name
    `)
  ).rows as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    type: String(r.type),
    joinCode: String(r.join_code),
    joinLink: joinLink(String(r.join_code)),
    joinEnabled: Boolean(r.join_enabled),
    createdAt: new Date(String(r.created_at)).toISOString(),
    learners: Number(r.learners),
    activeLearners: Number(r.active_learners),
    partners: Number(r.partners),
  }));
}

async function insertWithFreshCode(values: { name: string; type: string; createdBy: string }): Promise<Organisation> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db
      .insert(organisations)
      .values({ ...values, joinCode: newJoinCode() })
      .onConflictDoNothing({ target: organisations.joinCode })
      .returning();
    if (row) return row;
  }
  throw new AppError("Couldn't create a sign-up code. Try again.", 500, "CODE_COLLISION");
}

export async function createOrganisation(adminId: string, input: { name: string; type: OrganisationType }): Promise<Organisation> {
  return insertWithFreshCode({ name: input.name.trim(), type: input.type, createdBy: adminId });
}

export async function getOrganisation(id: string): Promise<Organisation> {
  const [org] = await db.select().from(organisations).where(and(eq(organisations.id, id), isNull(organisations.archivedAt)));
  if (!org) throw new AppError("Organisation not found", 404, "NOT_FOUND");
  return org;
}

export async function updateOrganisation(
  id: string,
  patch: { name?: string; type?: OrganisationType; joinEnabled?: boolean },
): Promise<Organisation> {
  await getOrganisation(id);
  const [row] = await db
    .update(organisations)
    .set({ ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) })
    .where(eq(organisations.id, id))
    .returning();
  return row!;
}

/** A new sign-up code; the old link stops working. */
export async function regenerateJoinCode(id: string): Promise<Organisation> {
  await getOrganisation(id);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db.update(organisations).set({ joinCode: newJoinCode() }).where(eq(organisations.id, id)).returning();
      return row!;
    } catch {
      // unique clash: try another code
    }
  }
  throw new AppError("Couldn't create a sign-up code. Try again.", 500, "CODE_COLLISION");
}

/**
 * Archives the organisation: its sign-up link stops, its learners leave it
 * (their accounts and progress stay), and its partner contacts lose access.
 */
export async function archiveOrganisation(id: string): Promise<void> {
  await getOrganisation(id);
  await db.transaction(async (tx) => {
    await tx.update(organisations).set({ archivedAt: new Date(), joinEnabled: false }).where(eq(organisations.id, id));
    await tx.delete(users).where(and(eq(users.organisationId, id), eq(users.role, "partner")));
    // Chats were saved only for this organisation to read.
    await tx.delete(aiTurns).where(inArray(aiTurns.userId, tx.select({ id: users.id }).from(users).where(eq(users.organisationId, id))));
    await tx.update(users).set({ organisationId: null }).where(eq(users.organisationId, id));
    await tx.delete(partnerInvites).where(eq(partnerInvites.organisationId, id));
  });
}

// ── Joining ──────────────────────────────────────────────────────────────────

/** The organisation a sign-up code joins, or null when the code doesn't work (unknown, off or archived). */
export async function findJoinable(code: string): Promise<Organisation | null> {
  const c = normaliseCode(code);
  if (c.length < 4) return null;
  const [org] = await db
    .select()
    .from(organisations)
    .where(and(eq(organisations.joinCode, c), eq(organisations.joinEnabled, true), isNull(organisations.archivedAt)));
  return org ?? null;
}

export interface AddLearnersResult {
  added: string[];
  moved: string[];
  already: string[];
  notFound: string[];
  notLearners: string[];
}

/**
 * Puts existing learners into the organisation by email. Each one added is
 * told in the bell that the organisation can now see their course progress,
 * and that they can leave from their profile.
 *
 * Until learner messages are switched on (LEARNER_NOTIFICATIONS_ENABLED), that
 * notice can't reach them, so nobody is added this way: an organisation would
 * see a learner's record and chats without the learner being told. Learners
 * can still join with the sign-up link, which tells them first.
 */
export async function addLearnersByEmail(organisationId: string, emails: string[]): Promise<AddLearnersResult> {
  if (!learnerNotificationsEnabled()) {
    throw new AppError(
      "Learners can't be told they've been added while learner messages are off. Share the organisation's sign-up link instead.",
      409,
      "LEARNERS_NOT_TOLD",
    );
  }
  const org = await getOrganisation(organisationId);
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const result: AddLearnersResult = { added: [], moved: [], already: [], notFound: [], notLearners: [] };
  if (!wanted.length) return result;
  const found = await db
    .select({ id: users.id, email: users.email, role: users.role, organisationId: users.organisationId })
    .from(users)
    .where(inArray(sql`lower(${users.email})`, wanted));
  const byEmail = new Map(found.map((u) => [u.email.toLowerCase(), u]));
  const toAdd: string[] = [];
  for (const email of wanted) {
    const u = byEmail.get(email);
    if (!u) result.notFound.push(email);
    else if (u.role !== "sme") result.notLearners.push(email);
    else if (u.organisationId === organisationId) result.already.push(email);
    else {
      (u.organisationId ? result.moved : result.added).push(email);
      toAdd.push(u.id);
    }
  }
  if (toAdd.length) {
    // Anyone moving from another organisation: that organisation's saved chats go.
    await db.delete(aiTurns).where(inArray(aiTurns.userId, toAdd));
    await db.update(users).set({ organisationId }).where(inArray(users.id, toAdd));
    await notify(toAdd, {
      type: "organisation",
      title: `You're now part of ${org.name} on AI Amplify`,
      body: `${org.name} can see your learning record (courses, exams, certificates, events, mentor sessions) and your chats with Anna and the AI mentors from now on. You can leave from your profile.`,
      link: "/dashboard/profile",
    });
  }
  return result;
}

export async function removeLearner(organisationId: string, userId: string): Promise<void> {
  const rows = await db
    .update(users)
    .set({ organisationId: null })
    .where(and(eq(users.id, userId), eq(users.organisationId, organisationId), eq(users.role, "sme")))
    .returning({ id: users.id });
  if (!rows.length) throw new AppError("That learner isn't in this organisation", 404, "NOT_FOUND");
  await db.delete(aiTurns).where(eq(aiTurns.userId, userId));
}

/** The learner's own organisation (for their profile), or null. */
export async function myOrganisation(userId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: organisations.id, name: organisations.name })
    .from(users)
    .innerJoin(organisations, eq(organisations.id, users.organisationId))
    .where(and(eq(users.id, userId), eq(users.role, "sme"), isNull(organisations.archivedAt)));
  return row ?? null;
}

export async function leaveOrganisation(userId: string): Promise<void> {
  await db.update(users).set({ organisationId: null }).where(and(eq(users.id, userId), eq(users.role, "sme")));
  // Saved only for the organisation to read; nothing is kept once she leaves.
  await db.delete(aiTurns).where(eq(aiTurns.userId, userId));
}

// ── Partner contacts ─────────────────────────────────────────────────────────

export interface PartnerContact {
  id: string;
  fullName: string;
  email: string;
  status: "active" | "invited";
  /** Active: last time they used AI Amplify. Invited: when the invite was sent. */
  at: string | null;
  /** Invited only: the setup link, for an admin to send themselves. */
  setupLink?: string;
  expiresAt?: string;
}

export async function listPartners(organisationId: string): Promise<PartnerContact[]> {
  const [active, invited] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName, email: users.email, lastActiveAt: users.lastActiveAt })
      .from(users)
      .where(and(eq(users.organisationId, organisationId), eq(users.role, "partner")))
      .orderBy(users.fullName),
    db
      .select()
      .from(partnerInvites)
      .where(and(eq(partnerInvites.organisationId, organisationId), isNull(partnerInvites.usedAt), sql`${partnerInvites.expiresAt} > now()`))
      .orderBy(desc(partnerInvites.createdAt)),
  ]);
  return [
    ...active.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, status: "active" as const, at: u.lastActiveAt?.toISOString() ?? null })),
    ...invited.map((i) => ({
      id: i.id,
      fullName: i.fullName,
      email: i.email,
      status: "invited" as const,
      at: i.createdAt.toISOString(),
      setupLink: `${frontend()}/partner/setup?token=${i.token}`,
      expiresAt: i.expiresAt.toISOString(),
    })),
  ];
}

/**
 * Invites a partner contact: a setup link valid for 7 days, emailed to them
 * and returned so an admin can also send it themselves.
 */
export async function invitePartner(
  organisationId: string,
  adminId: string,
  input: { fullName: string; email: string },
): Promise<PartnerContact> {
  const org = await getOrganisation(organisationId);
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email));
  if (existing) throw new AppError("That email already has a AI Amplify account. Use a different email for the partner login.", 409, "EMAIL_IN_USE");

  // A fresh invite replaces any pending one for the same email.
  await db.delete(partnerInvites).where(and(eq(partnerInvites.organisationId, organisationId), eq(sql`lower(${partnerInvites.email})`, email), isNull(partnerInvites.usedAt)));
  const token = randomBytes(32).toString("hex");
  const [invite] = await db
    .insert(partnerInvites)
    .values({
      organisationId,
      fullName: input.fullName.trim(),
      email,
      token,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      createdBy: adminId,
    })
    .returning();
  const setupLink = `${frontend()}/partner/setup?token=${token}`;
  void sendMail({
    to: email,
    subject: `Your AI Amplify partner dashboard for ${org.name}`,
    template: "partner-invite",
    context: { name: input.fullName.trim(), organisation: org.name, setupLink, days: INVITE_DAYS },
  }).catch((err) => console.error("[organisations] partner invite email failed", err));
  return { id: invite!.id, fullName: invite!.fullName, email, status: "invited", at: invite!.createdAt.toISOString(), setupLink, expiresAt: invite!.expiresAt.toISOString() };
}

export async function cancelInvite(organisationId: string, inviteId: string): Promise<void> {
  const rows = await db
    .delete(partnerInvites)
    .where(and(eq(partnerInvites.id, inviteId), eq(partnerInvites.organisationId, organisationId)))
    .returning({ id: partnerInvites.id });
  if (!rows.length) throw new AppError("Invite not found", 404, "NOT_FOUND");
}

/** Removes a partner contact's login (their account is deleted; learners are untouched). */
export async function removePartner(organisationId: string, userId: string): Promise<void> {
  const rows = await db
    .delete(users)
    .where(and(eq(users.id, userId), eq(users.organisationId, organisationId), eq(users.role, "partner")))
    .returning({ id: users.id });
  if (!rows.length) throw new AppError("Partner contact not found", 404, "NOT_FOUND");
}

/** A setup link that still works: { invite, organisation name }. */
export async function findValidInvite(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [row] = await db
    .select({ invite: partnerInvites, organisation: organisations.name, archivedAt: organisations.archivedAt })
    .from(partnerInvites)
    .innerJoin(organisations, eq(organisations.id, partnerInvites.organisationId))
    .where(and(eq(partnerInvites.token, token), isNull(partnerInvites.usedAt), sql`${partnerInvites.expiresAt} > now()`));
  if (!row || row.archivedAt) return null;
  return row;
}

/** The organisation a partner contact can see, or a 403 if they have none. */
export async function partnerOrganisationId(userId: string): Promise<string> {
  const [row] = await db
    .select({ id: organisations.id })
    .from(users)
    .innerJoin(organisations, eq(organisations.id, users.organisationId))
    .where(and(eq(users.id, userId), eq(users.role, "partner"), isNull(organisations.archivedAt)));
  if (!row) throw new AppError("Your partner access has ended. Contact the AI Amplify team.", 403, "NO_ORGANISATION");
  return row.id;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface OrganisationDashboard {
  organisation: { id: string; name: string; type: string; joinCode: string; joinLink: string; joinEnabled: boolean };
  kpis: {
    learners: number;
    activeLearners: number;
    learning: number;
    coursesCompleted: number;
    certificates: number;
    avgProgress: number | null;
  };
  joinsByWeek: { week: string; joins: number }[];
  courses: { courseId: string; title: string; enrolled: number; completed: number; avgProgress: number }[];
  learners: {
    id: string;
    fullName: string;
    email: string;
    company: string | null;
    joinedAt: string;
    lastActiveAt: string | null;
    coursesStarted: number;
    coursesCompleted: number;
    certificates: number;
    avgProgress: number | null;
  }[];
  learningGain: LearningGain;
}

export async function organisationDashboard(organisationId: string): Promise<OrganisationDashboard> {
  const org = await getOrganisation(organisationId);
  const [learnerRows, courseRows, weekRows, gain] = await Promise.all([
    db.execute(sql`
      SELECT u.id, u.full_name, u.email, u.company, u.created_at, u.last_active_at,
        (SELECT count(*) FROM course_enrollments e WHERE e.user_id = u.id)::int AS started,
        (SELECT count(*) FROM user_course_progress p WHERE p.user_id = u.id AND p.completed_at IS NOT NULL)::int AS completed,
        (SELECT count(*) FROM course_certificates c WHERE c.user_id = u.id)::int AS certificates,
        (SELECT avg(coalesce(p.progress_percentage, 0))::float FROM course_enrollments e
           LEFT JOIN user_course_progress p ON p.user_id = e.user_id AND p.course_id = e.course_id
           WHERE e.user_id = u.id) AS avg_progress
      FROM users u
      WHERE u.organisation_id = ${organisationId} AND u.role = 'sme'
      ORDER BY u.last_active_at DESC NULLS LAST, u.full_name
    `),
    db.execute(sql`
      SELECT c.id, c.title, count(*)::int AS enrolled,
        count(p.completed_at)::int AS completed,
        avg(coalesce(p.progress_percentage, 0))::float AS avg_progress
      FROM course_enrollments e
      JOIN users u ON u.id = e.user_id AND u.organisation_id = ${organisationId} AND u.role = 'sme'
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN user_course_progress p ON p.user_id = e.user_id AND p.course_id = e.course_id
      GROUP BY c.id, c.title
      ORDER BY enrolled DESC, c.title
      LIMIT 30
    `),
    db.execute(sql`
      SELECT to_char(w.week, 'YYYY-MM-DD') AS week, count(u.id)::int AS joins
      FROM generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS w(week)
      LEFT JOIN users u ON u.organisation_id = ${organisationId} AND u.role = 'sme'
        AND date_trunc('week', u.created_at) = w.week
      GROUP BY w.week ORDER BY w.week
    `),
    getLearningGain({ organisationId }),
  ]);

  const learners = (learnerRows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    fullName: String(r.full_name),
    email: String(r.email),
    company: r.company ? String(r.company) : null,
    joinedAt: new Date(String(r.created_at)).toISOString(),
    lastActiveAt: r.last_active_at ? new Date(String(r.last_active_at)).toISOString() : null,
    coursesStarted: Number(r.started),
    coursesCompleted: Number(r.completed),
    certificates: Number(r.certificates),
    avgProgress: r.avg_progress == null ? null : Math.round(Number(r.avg_progress)),
  }));
  const learning = learners.filter((l) => l.coursesStarted > 0);
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return {
    organisation: { id: org.id, name: org.name, type: org.type, joinCode: org.joinCode, joinLink: joinLink(org.joinCode), joinEnabled: org.joinEnabled },
    kpis: {
      learners: learners.length,
      activeLearners: learners.filter((l) => l.lastActiveAt && new Date(l.lastActiveAt).getTime() > monthAgo).length,
      learning: learning.length,
      coursesCompleted: learners.reduce((n, l) => n + l.coursesCompleted, 0),
      certificates: learners.reduce((n, l) => n + l.certificates, 0),
      avgProgress: learning.length ? Math.round(learning.reduce((n, l) => n + (l.avgProgress ?? 0), 0) / learning.length) : null,
    },
    joinsByWeek: (weekRows.rows as Array<Record<string, unknown>>).map((r) => ({ week: String(r.week), joins: Number(r.joins) })),
    courses: (courseRows.rows as Array<Record<string, unknown>>).map((r) => ({
      courseId: String(r.id),
      title: String(r.title),
      enrolled: Number(r.enrolled),
      completed: Number(r.completed),
      avgProgress: Math.round(Number(r.avg_progress)),
    })),
    learners,
    learningGain: gain,
  };
}
