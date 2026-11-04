import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { authAccounts, inviteCodes, mentorRegistrations, mentorSetupTokens, partnerInvites, users } from "../db/schema";
import { findValidToken } from "../services/mentor.service";
import { findJoinable, findValidInvite } from "../services/organisations.service";
import { AppError } from "../utils/app-error";
import { hashPassword } from "./password";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A credential account row: how Better Auth stores an email + password login. */
async function insertCredentialAccount(tx: Tx, userId: string, password: string): Promise<void> {
  await tx.insert(authAccounts).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
}

async function assertEmailFree(email: string): Promise<void> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new AppError("An account with this email already exists", 409, "EMAIL_EXISTS");
}

/**
 * The checks sign-up can fail on (email taken, invite code not active,
 * organisation link not active), without changing anything.
 * createLearnerAccount repeats them atomically. AI Amplify is invite-only: the
 * invite code is required; an organisation link adds membership on top.
 */
export async function assertCanSignUp(email: string, couponCode: string, orgCode?: string): Promise<void> {
  await assertEmailFree(email);
  if (orgCode && !(await findJoinable(orgCode))) {
    throw new AppError("This organisation link isn't active any more. Ask the organisation for a new one, or sign up without it.", 400, "INVALID_ORG_CODE");
  }
  const [code] = await db
    .select({ status: inviteCodes.status })
    .from(inviteCodes)
    .where(eq(inviteCodes.code, couponCode))
    .limit(1);
  if (!code || code.status !== "active") {
    throw new AppError("Invalid or already used coupon code", 400, "INVALID_COUPON");
  }
}

/**
 * Creates a learner whose email was already proven with a sign-up code, and
 * redeems their invite code. The password is optional: Anna's chat sign-up
 * creates the account without one and the learner can set it in Profile.
 *
 * @throws AppError(409, "EMAIL_EXISTS") | AppError(400, "INVALID_COUPON")
 */
export async function createLearnerAccount(data: {
  fullName: string;
  email: string;
  country: string;
  couponCode: string;
  password?: string | undefined;
  /** An organisation's sign-up code: the learner joins that organisation. */
  orgCode?: string | undefined;
}): Promise<string> {
  await assertEmailFree(data.email);
  const organisation = data.orgCode ? await findJoinable(data.orgCode) : null;
  if (data.orgCode && !organisation) {
    throw new AppError("This organisation link isn't active any more. Ask the organisation for a new one, or sign up without it.", 400, "INVALID_ORG_CODE");
  }

  return db.transaction(async (tx) => {
    // Lock the invite code row so two sign-ups cannot both redeem it.
    const locked = await tx.execute(sql`SELECT * FROM invite_codes WHERE code = ${data.couponCode} FOR UPDATE`);
    const row = locked.rows[0] as typeof inviteCodes.$inferSelect | undefined;
    if (!row || row.status !== "active") {
      throw new AppError("Invalid or already used coupon code", 400, "INVALID_COUPON");
    }

    const [user] = await tx
      .insert(users)
      .values({
        fullName: data.fullName,
        email: data.email,
        emailVerified: true,
        role: "sme",
        country: data.country,
        inviteCodeId: row.id,
        organisationId: organisation?.id ?? null,
      })
      .returning({ id: users.id });
    if (!user) throw new AppError("Failed to create user", 500, "INSERT_FAILED");

    if (data.password) await insertCredentialAccount(tx, user.id, data.password);

    await tx
      .update(inviteCodes)
      .set({ usedBy: user.id, usedAt: new Date(), status: "used" })
      .where(eq(inviteCodes.id, row.id));
    return user.id;
  });
}

/**
 * Creates a mentor from an approved application's setup link. The link was
 * emailed to the applicant, so following it proves the address.
 *
 * @throws AppError(404, "TOKEN_NOT_FOUND") | AppError(400, "TOKEN_EXPIRED") | AppError(409, "EMAIL_EXISTS")
 */
export async function createMentorAccount(data: { token: string; password: string }): Promise<string> {
  const { token, registration } = await findValidToken(data.token);
  await assertEmailFree(registration.email);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ fullName: registration.name, email: registration.email, emailVerified: true, role: "mentor" })
      .returning({ id: users.id });
    if (!user) throw new AppError("Failed to create mentor account", 500, "INSERT_FAILED");

    await insertCredentialAccount(tx, user.id, data.password);
    await tx.update(mentorRegistrations).set({ userId: user.id }).where(eq(mentorRegistrations.id, registration.id));
    await tx.update(mentorSetupTokens).set({ usedAt: new Date() }).where(eq(mentorSetupTokens.id, token.id));
    return user.id;
  });
}

/**
 * Creates a partner contact's login from their emailed setup link: role
 * 'partner', tied to the organisation whose learners they can see.
 *
 * @throws AppError(400, "INVITE_INVALID") | AppError(409, "EMAIL_EXISTS")
 */
export async function createPartnerAccount(data: { token: string; password: string }): Promise<string> {
  const found = await findValidInvite(data.token);
  if (!found) throw new AppError("This setup link has expired or was already used. Ask the AI Amplify team for a new one.", 400, "INVITE_INVALID");
  const { invite } = found;
  await assertEmailFree(invite.email);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ fullName: invite.fullName, email: invite.email, emailVerified: true, role: "partner", organisationId: invite.organisationId })
      .returning({ id: users.id });
    if (!user) throw new AppError("Failed to create partner account", 500, "INSERT_FAILED");

    await insertCredentialAccount(tx, user.id, data.password);
    await tx.update(partnerInvites).set({ usedAt: new Date() }).where(eq(partnerInvites.id, invite.id));
    return user.id;
  });
}
