import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "../db";
import {
  users,
  inviteCodes,
  courseCertificates,
  courseEnrollments,
  mentorRegistrations,
  otpCodes,
} from "../db/schema";
import { sendMail } from "../mail/mailer";
import { AppError } from "../utils/app-error";

/** Number of bcrypt rounds — high enough to be slow for attackers, fast enough for UX. */
const BCRYPT_ROUNDS = 12;

/** JWT expiry for all issued tokens. */
const TOKEN_EXPIRY = "12h";

/** How long an OTP code remains valid after issuance. */
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Maximum failed verify attempts before an OTP is locked out. */
const OTP_MAX_ATTEMPTS = 5;

/** Expiry of the short-lived "email-verified" JWT handed to the client after OTP success. */
const VERIFIED_TOKEN_EXPIRY = "15m";

/** Purpose claim embedded in the email-verified JWT — asserted at registration time. */
const VERIFIED_TOKEN_PURPOSE = "email-verified";

/**
 * A stable dummy hash used when the login email is not found.
 * Always running bcrypt.compare (even on a dummy hash) ensures the response
 * time for "unknown email" is indistinguishable from "wrong password",
 * preventing timing-based email enumeration attacks.
 *
 * The hash is a valid bcrypt hash format but will never match any real password.
 */
const DUMMY_HASH = "$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXXXX";

/**
 * Payload embedded in every JWT we sign.
 * Kept minimal to avoid encoding sensitive data in the token.
 */
interface JwtPayload {
  userId: string;
  role: string;
}

/**
 * Public user shape returned by auth endpoints — never includes passwordHash.
 */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  country: string | null;
}

/**
 * Extended user shape returned by /me — includes profile fields.
 */
export interface MeUser extends PublicUser {
  bio: string | null;
  company: string | null;
  phone: string | null;
  avatarUrl: string | null;
  certificatesCount: number;
  coursesCount: number;
  linkedinUrl: string | null;
  timezone: string | null; // IANA timezone string (e.g. "America/New_York")
  meetingLink: string | null; // Video call URL set by mentor users
  createdAt: Date;
  hasPassword: boolean; // true once a password hash is set; false for OTP-only accounts
}

/** Auth response shape shared by register and login. */
export interface AuthResult {
  token: string;
  user: PublicUser;
}

/**
 * Signs a JWT for the given user and returns the token string.
 * Algorithm is locked to HS256 to prevent algorithm-confusion attacks.
 *
 * @param userId - UUID of the authenticated user
 * @param role   - Role string embedded in the token (e.g. "sme", "admin")
 */
function signToken(userId: string, role: string): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    // This should never happen at runtime because index.ts guards it,
    // but we throw clearly here to surface misconfiguration immediately.
    throw new AppError("JWT_SECRET is not configured", 500, "SERVER_MISCONFIGURATION");
  }
  const payload: JwtPayload = { userId, role };
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: TOKEN_EXPIRY });
}

// ---------------------------------------------------------------------------
// registerUser
// ---------------------------------------------------------------------------

/**
 * Registers a new SME user.
 *
 * Steps:
 * 1. Check the email is not already taken.
 * 2. Hash the password with bcrypt.
 * 3. Open a transaction:
 *    a. If a couponCode is provided, SELECT FOR UPDATE to lock the invite_codes
 *       row and validate it atomically — eliminates the TOCTOU race where two
 *       concurrent registrations could both read "active" before either writes "used".
 *    b. Insert the new user row.
 *    c. If a coupon was used, mark it as 'used' and link it to the user.
 * 4. Sign and return a JWT alongside the public user fields.
 *
 * Two registration modes are supported:
 *   - Password mode: caller supplies `password`; it is hashed with bcrypt.
 *   - OTP mode: caller supplies a `verifiedToken` (issued by verifyOtp). The
 *     token is verified, its purpose + email asserted, and the user is created
 *     with passwordHash = null. The user sets a password later from the
 *     dashboard via setInitialPassword.
 * Exactly one of the two must be present.
 *
 * @throws AppError(400, "INVALID_COUPON")        — couponCode supplied but not found / already used
 * @throws AppError(400, "EMAIL_NOT_VERIFIED")    — verifiedToken invalid / wrong purpose / wrong email
 * @throws AppError(400, "VALIDATION_ERROR")      — neither password nor verifiedToken supplied
 * @throws AppError(409, "EMAIL_EXISTS")          — email is already registered
 */
export async function registerUser(data: {
  fullName: string;
  email: string;
  password?: string;
  country: string;
  couponCode?: string;
  verifiedToken?: string;
}): Promise<AuthResult> {
  const { fullName, email, password, country, couponCode, verifiedToken } = data;

  // --- 1. Ensure email is not taken -----------------------------------------
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError("An account with this email already exists", 409, "EMAIL_EXISTS");
  }

  // --- 2. Resolve the password hash based on registration mode --------------
  // OTP mode wins when a verifiedToken is present: verify it, assert it was
  // minted for THIS email with the email-verified purpose, then create the
  // account with no password (passwordHash = null). Otherwise fall back to
  // password mode and hash the supplied password. If neither is present the
  // request is invalid.
  let passwordHash: string | null;
  if (verifiedToken) {
    assertEmailVerified(verifiedToken, email);
    passwordHash = null; // OTP-only account — password set later from dashboard.
  } else if (password) {
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  } else {
    throw new AppError("Password or verified email required", 400, "VALIDATION_ERROR");
  }

  // --- 3. Insert user + atomically validate and redeem coupon in a transaction
  const newUser = await db.transaction(async (tx) => {
    // 3a. Lock the invite code row before reading its status.
    //     SELECT FOR UPDATE prevents two concurrent registrations from both
    //     seeing "active" before either commits the "used" update (TOCTOU fix).
    let inviteCode: typeof inviteCodes.$inferSelect | undefined;
    if (couponCode) {
      const locked = await tx.execute(
        sql`SELECT * FROM invite_codes WHERE code = ${couponCode} FOR UPDATE`,
      );
      const row = locked.rows[0] as typeof inviteCodes.$inferSelect | undefined;
      if (!row || row.status !== "active") {
        throw new AppError("Invalid or already used coupon code", 400, "INVALID_COUPON");
      }
      inviteCode = row;
    }

    // 3b. Insert the user.
    const [inserted] = await tx
      .insert(users)
      .values({
        fullName,
        email,
        passwordHash,
        role: "sme",
        country,
      })
      .returning();

    if (!inserted) {
      throw new AppError("Failed to create user", 500, "INSERT_FAILED");
    }

    // 3c. Redeem the invite code if one was provided.
    if (inviteCode) {
      await tx
        .update(inviteCodes)
        .set({
          usedBy: inserted.id,
          usedAt: new Date(),
          status: "used",
        })
        .where(eq(inviteCodes.id, inviteCode.id));

      await tx.update(users).set({ inviteCodeId: inviteCode.id }).where(eq(users.id, inserted.id));

      return { ...inserted, inviteCodeId: inviteCode.id };
    }

    return inserted;
  });

  // --- 4. Sign token ---------------------------------------------------------
  const token = signToken(newUser.id, newUser.role);

  return {
    token,
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      role: newUser.role,
      country: newUser.country ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------

/**
 * Authenticates a user by email + password.
 *
 * Always calls bcrypt.compare regardless of whether the user exists. This
 * ensures the response time is constant whether the email is registered or
 * not, preventing timing-based email enumeration attacks.
 *
 * @throws AppError(401, "INVALID_CREDENTIALS") — if email not found or password wrong
 */
export async function loginUser(data: { email: string; password: string }): Promise<AuthResult> {
  const { email, password } = data;

  // Only select the columns we actually need — passwordHash is required here
  // to verify credentials; the rest populate the public response shape.
  const found = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      country: users.country,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = found[0];

  // Always compare against a hash — even when the user is not found — so that
  // the response time does not reveal whether the email exists in the database.
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordMatch) {
    // Intentionally identical message to prevent email enumeration.
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  // --- Sign token ------------------------------------------------------------
  const token = signToken(user.id, user.role);

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      country: user.country ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// checkEmailAvailability
// ---------------------------------------------------------------------------

/**
 * Checks whether an email address is available for registration.
 *
 * Performs a lightweight existence check against the users table. Returns
 * `{ available: true }` when no matching row is found, `{ available: false }`
 * when the email is already registered.
 *
 * NOTE: Intentionally never throws — callers should always receive a 200
 * response; the `available` flag carries the result. Only an unexpected DB
 * error should propagate up (and will be caught by the error handler).
 *
 * @param email - The email address to check (should already be normalised to lowercase)
 * @returns Object indicating whether the email is available
 */
export async function checkEmailAvailability(email: string): Promise<{ available: boolean }> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return { available: existing.length === 0 };
}

// ---------------------------------------------------------------------------
// checkCouponValidity
// ---------------------------------------------------------------------------

/**
 * Returns whether the given coupon code is currently active.
 * Non-mutating SELECT — does NOT lock the row. The registration transaction
 * performs its own atomic FOR UPDATE check; this is advisory only.
 */
export async function checkCouponValidity(code: string): Promise<{ valid: boolean }> {
  const result = await db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(and(eq(inviteCodes.code, code), eq(inviteCodes.status, "active")))
    .limit(1);

  return { valid: result.length > 0 };
}

// ---------------------------------------------------------------------------
// getMe
// ---------------------------------------------------------------------------

/**
 * Returns the full profile for an authenticated user.
 * Selects only the columns needed for the profile — passwordHash is excluded.
 *
 * @param userId - UUID from the verified JWT payload
 * @throws AppError(404, "USER_NOT_FOUND") — if the user row no longer exists
 */
export async function getMe(userId: string): Promise<MeUser> {
  const found = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      country: users.country,
      bio: users.bio,
      company: users.company,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      meetingLink: users.meetingLink,
      createdAt: users.createdAt,
      // Selected only to derive the hasPassword flag — never returned itself.
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = found[0];
  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  const [certRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseCertificates)
    .where(eq(courseCertificates.userId, userId));

  const [enrollRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseEnrollments)
    .where(eq(courseEnrollments.userId, userId));

  let linkedinUrl: string | null = null;
  if (user.role === "mentor") {
    const [reg] = await db
      .select({ linkedinUrl: mentorRegistrations.linkedinUrl })
      .from(mentorRegistrations)
      .where(eq(mentorRegistrations.userId, userId))
      .limit(1);
    linkedinUrl = reg?.linkedinUrl ?? null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    country: user.country ?? null,
    bio: user.bio ?? null,
    company: user.company ?? null,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    certificatesCount: certRow?.n ?? 0,
    coursesCount: enrollRow?.n ?? 0,
    linkedinUrl,
    timezone: user.timezone ?? null,
    meetingLink: user.meetingLink ?? null,
    createdAt: user.createdAt,
    // Expose whether a password is set without ever leaking the hash itself.
    hasPassword: user.passwordHash != null,
  };
}

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

/**
 * Updates profile fields for the authenticated user.
 * Only fields present in `data` are written; omitted fields are left unchanged.
 * `linkedinUrl` is only written when `userRole === "mentor"` — silently ignored otherwise.
 *
 * @param userId   - UUID of the user to update
 * @param userRole - Role string from the JWT payload (avoids a redundant DB query)
 * @param data     - Partial profile fields to update
 * @throws AppError(404, "USER_NOT_FOUND") — if the user row no longer exists (surfaced via getMe)
 */
export async function updateProfile(
  userId: string,
  userRole: string,
  data: {
    fullName?: string;
    phone?: string | null;
    bio?: string | null;
    company?: string | null;
    country?: string | null;
    linkedinUrl?: string | null;
    timezone?: string | null;
    meetingLink?: string | null;
  },
): Promise<MeUser> {
  const { linkedinUrl, ...userFields } = data;

  type UserUpdate = Partial<
    Pick<
      typeof users.$inferInsert,
      | "fullName"
      | "phone"
      | "bio"
      | "company"
      | "country"
      | "timezone"
      | "meetingLink"
      | "updatedAt"
    >
  >;
  const userUpdates: UserUpdate = {};
  if (userFields.fullName !== undefined) userUpdates.fullName = userFields.fullName;
  if ("phone" in userFields) userUpdates.phone = userFields.phone ?? null;
  if ("bio" in userFields) userUpdates.bio = userFields.bio ?? null;
  if ("company" in userFields) userUpdates.company = userFields.company ?? null;
  if ("country" in userFields) userUpdates.country = userFields.country ?? null;
  if ("timezone" in userFields && userFields.timezone !== undefined)
    userUpdates.timezone = userFields.timezone ?? null;
  if ("meetingLink" in userFields && userFields.meetingLink !== undefined)
    userUpdates.meetingLink = userFields.meetingLink ?? null;

  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updatedAt = new Date();
    await db.update(users).set(userUpdates).where(eq(users.id, userId));
  }

  if (linkedinUrl !== undefined && userRole === "mentor") {
    await db
      .update(mentorRegistrations)
      .set({ linkedinUrl: linkedinUrl ?? null })
      .where(eq(mentorRegistrations.userId, userId));
  }

  return getMe(userId);
}

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

/**
 * Changes the authenticated user's password.
 * Verifies the current password before writing the new bcrypt hash.
 *
 * @param userId          - UUID of the user
 * @param currentPassword - Plaintext current password to verify
 * @param newPassword     - Plaintext new password (min 8 characters)
 * @throws AppError(400, "INVALID_PASSWORD")  — current password does not match
 * @throws AppError(400, "VALIDATION_ERROR")  — newPassword is fewer than 8 characters
 * @throws AppError(404, "USER_NOT_FOUND")    — user row not found
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new AppError("New password must be at least 8 characters", 400, "VALIDATION_ERROR");
  }

  const [found] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!found) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  // OTP-only accounts have no password to verify against — they must use
  // setInitialPassword (POST /set-password) to establish their first password.
  if (found.passwordHash == null) {
    throw new AppError("No password set. Set a password first.", 400, "PASSWORD_NOT_SET");
  }

  const valid = await bcrypt.compare(currentPassword, found.passwordHash);
  if (!valid) {
    throw new AppError("Current password is incorrect", 400, "INVALID_PASSWORD");
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// OTP registration: sendOtp / verifyOtp
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically-random 6-digit OTP, stores only its bcrypt
 * hash, and emails the plaintext code to the address.
 *
 * Security:
 * - The code is generated with node:crypto.randomInt (CSPRNG), never Math.random.
 * - Only the bcrypt hash is persisted — the plaintext lives only in the email.
 * - Any prior UNCONSUMED codes for this email are deleted so an old code can't
 *   be reused once a new one is requested.
 * - The plaintext code is never logged or returned.
 *
 * @param email - Recipient email (already normalised to lowercase by the DTO).
 */
export async function sendOtp(email: string): Promise<void> {
  // 6-digit code, zero-padded. randomInt's upper bound is exclusive.
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Delete prior unconsumed codes for this email, then insert the fresh one.
  // (Consumed rows are retained as an audit trail and excluded by consumedAt.)
  await db.delete(otpCodes).where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt)));

  await db.insert(otpCodes).values({ email, codeHash, expiresAt, attempts: 0 });

  // Email the plaintext code. Subject/template never echo the code anywhere else.
  await sendMail({
    to: email,
    subject: "Your AI Amplify verification code",
    template: "otp-code",
    context: { code },
  });
}

/**
 * Verifies a 6-digit OTP for the given email and consumes it on success.
 *
 * This is the shared verify-and-consume core used by BOTH the registration
 * flow (verifyOtp) and the login flow (loginWithOtp), guaranteeing both enforce
 * identical security properties:
 * - Uses the most recent unconsumed, non-expired code for the email.
 * - Locks out after OTP_MAX_ATTEMPTS failed compares (429).
 * - Returns an identical generic error for missing / wrong / expired codes so
 *   no information about which condition failed is leaked.
 * - Marks the code consumed (consumedAt) on success so it can never be reused.
 *
 * @param email - Email tied to the code (lowercased by the DTO).
 * @param code  - The 6-digit code the user entered.
 * @throws AppError(400, "INVALID_OTP")  — no usable code, mismatch, or expired
 * @throws AppError(429, "OTP_LOCKED")   — too many failed attempts
 */
async function consumeOtpCode(email: string, code: string): Promise<void> {
  const now = new Date();

  // Most recent unconsumed, non-expired code for this email.
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, now)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!row) {
    throw new AppError("Invalid or expired code", 400, "INVALID_OTP");
  }

  // Lock out brute-force guessing once the attempt ceiling is reached.
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError("Too many attempts. Request a new code.", 429, "OTP_LOCKED");
  }

  const match = await bcrypt.compare(code, row.codeHash);
  if (!match) {
    // Increment the failed-attempt counter for this specific code.
    await db
      .update(otpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otpCodes.id, row.id));
    throw new AppError("Invalid or expired code", 400, "INVALID_OTP");
  }

  // Success: consume the code so it can never be reused.
  await db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, row.id));
}

/**
 * Verifies a 6-digit OTP for the given email and, on success, mints a
 * short-lived "email-verified" JWT the client passes to /register.
 *
 * Security:
 * - Uses the most recent unconsumed, non-expired code for the email.
 * - Locks out after OTP_MAX_ATTEMPTS failed compares (429).
 * - Returns an identical generic error for missing / wrong / expired codes to
 *   avoid leaking which condition failed.
 * - The verified token carries only { purpose, email } and is signed HS256.
 *
 * @param email - Email tied to the code (lowercased by the DTO).
 * @param code  - The 6-digit code the user entered.
 * @throws AppError(400, "INVALID_OTP")  — no usable code, mismatch, or expired
 * @throws AppError(429, "OTP_LOCKED")   — too many failed attempts
 */
export async function verifyOtp(email: string, code: string): Promise<{ verifiedToken: string }> {
  // Verify-and-consume is shared with loginWithOtp so both flows enforce the
  // identical lockout / generic-error / consume-on-success security properties.
  await consumeOtpCode(email, code);

  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new AppError("JWT_SECRET is not configured", 500, "SERVER_MISCONFIGURATION");
  }
  const verifiedToken = jwt.sign({ purpose: VERIFIED_TOKEN_PURPOSE, email }, secret, {
    algorithm: "HS256",
    expiresIn: VERIFIED_TOKEN_EXPIRY,
  });

  return { verifiedToken };
}

// ---------------------------------------------------------------------------
// loginWithOtp
// ---------------------------------------------------------------------------

/**
 * Logs an EXISTING user in via OTP and returns a real auth JWT.
 *
 * Mirrors loginUser (password login) but authenticates with a one-time code
 * instead of a password. Reuses consumeOtpCode for verify-and-consume, so the
 * lockout / generic-error / consume-on-success guarantees are identical to the
 * registration verify flow.
 *
 * The code is consumed FIRST (so a valid code is always spent, never replayable)
 * and only then is the user looked up. A valid code with no matching account
 * yields ACCOUNT_NOT_FOUND so the frontend can prompt the visitor to sign up.
 *
 * @param email - Email tied to the code (lowercased by the DTO).
 * @param code  - The 6-digit code the user entered.
 * @throws AppError(400, "INVALID_OTP")        — no usable code, mismatch, or expired
 * @throws AppError(429, "OTP_LOCKED")         — too many failed attempts
 * @throws AppError(404, "ACCOUNT_NOT_FOUND")  — code valid but no user for that email
 */
export async function loginWithOtp(email: string, code: string): Promise<AuthResult> {
  // Verify and consume the code (throws INVALID_OTP / OTP_LOCKED on failure).
  await consumeOtpCode(email, code);

  // Look up the user only after the code is consumed.
  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      country: users.country,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new AppError("No account found for this email", 404, "ACCOUNT_NOT_FOUND");
  }

  const token = signToken(user.id, user.role);

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      country: user.country ?? null,
    },
  };
}

/**
 * Verifies an "email-verified" JWT and asserts it was minted for `email`.
 * Used by registerUser when registering via the OTP (passwordless) flow.
 *
 * @param token - The verifiedToken returned by verifyOtp.
 * @param email - The registration email (lowercased) the token must match.
 * @throws AppError(400, "EMAIL_NOT_VERIFIED") — token invalid / expired / wrong purpose / wrong email
 */
function assertEmailVerified(token: string, email: string): void {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new AppError("JWT_SECRET is not configured", 500, "SERVER_MISCONFIGURATION");
  }

  let payload: jwt.JwtPayload;
  try {
    // Lock verification to HS256 to prevent algorithm-confusion attacks.
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof decoded === "string") {
      throw new AppError("Email verification required", 400, "EMAIL_NOT_VERIFIED");
    }
    payload = decoded;
  } catch {
    // Covers expiry, bad signature, and malformed tokens alike.
    throw new AppError("Email verification required", 400, "EMAIL_NOT_VERIFIED");
  }

  if (payload["purpose"] !== VERIFIED_TOKEN_PURPOSE || payload["email"] !== email) {
    throw new AppError("Email verification required", 400, "EMAIL_NOT_VERIFIED");
  }
}

// ---------------------------------------------------------------------------
// setInitialPassword
// ---------------------------------------------------------------------------

/**
 * Sets the FIRST password for an OTP-registered account that has none yet.
 * Distinct from changePassword: it requires no current password but refuses
 * to run once a password already exists (use changePassword for that).
 *
 * @param userId   - UUID of the authenticated user.
 * @param password - New plaintext password (8–128, enforced by the DTO).
 * @param confirm  - Confirmation that must equal `password`.
 * @throws AppError(400, "PASSWORD_MISMATCH")     — confirm !== password
 * @throws AppError(404, "USER_NOT_FOUND")        — user row not found
 * @throws AppError(409, "PASSWORD_ALREADY_SET")  — a password already exists
 */
export async function setInitialPassword(
  userId: string,
  password: string,
  confirm: string,
): Promise<void> {
  if (confirm !== password) {
    throw new AppError("Passwords do not match", 400, "PASSWORD_MISMATCH");
  }

  const [found] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!found) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  // This endpoint is only for accounts without a password. Once one is set the
  // user must go through changePassword (which verifies the current password).
  if (found.passwordHash != null) {
    throw new AppError("Password already set", 409, "PASSWORD_ALREADY_SET");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}
