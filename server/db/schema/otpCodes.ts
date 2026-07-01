import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * One-time-password codes for passwordless registration.
 *
 * The 6-digit code is NEVER stored in plaintext — only a bcrypt hash is
 * persisted in `code_hash`. Verification re-hashes the supplied code via
 * bcrypt.compare. Codes are short-lived (~10 min) and single-use (consumedAt
 * is stamped on success). `attempts` is incremented on each failed compare so
 * the verify endpoint can lock out brute-force guessing.
 */
export const otpCodes = pgTable("otp_codes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  // bcrypt hash of the 6-digit OTP — never the plaintext code.
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  // Set once the code is successfully consumed; null means still usable.
  consumedAt: timestamp("consumed_at"),
  // Failed-verify counter used to lock out brute-force attempts.
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
});

export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = typeof otpCodes.$inferInsert;
