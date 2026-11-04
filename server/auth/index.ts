import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

import { db } from "../db";
import { authAccounts, authRateLimits, authSessions, authVerifications, users } from "../db/schema";
import { sendCodeEmail } from "./emails";
import { createAuthMiddleware } from "better-auth/api";
import { enforceEmailBudget } from "./emailLimits";
import { verifyLegacyAccount } from "./legacyVerification";
import { hashPassword, verifyPassword } from "./password";
import { amplifyPlugin } from "./amplifyPlugin";

// Sessions, sign-in and sign-up for learners, mentors and admins.
//
// The browser reaches this server through the Next app's /api rewrite, so the
// session cookie belongs to the site's own domain (first-party, httpOnly).
// BETTER_AUTH_URL is therefore the public site URL, not this server's URL.

// `||`, not `??`: docker-compose passes unset variables as empty strings.
const siteUrl = process.env["BETTER_AUTH_URL"] || process.env["FRONTEND_URL"] || "http://localhost:3000";
const isProduction = process.env["NODE_ENV"] === "production";

// Requests arrive through the edge proxy and then the Next server, each of
// which appends to X-Forwarded-For. Hops in these ranges are skipped when
// finding the client IP for rate limiting. Only safe while this server is not
// reachable from the internet except through those proxies.
const trustedProxies = (process.env["TRUSTED_PROXIES"] || "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DAY = 60 * 60 * 24;

// The test suite signs in many times from one process, so its limits are off
// unless a test turns them on to check them.
const limitsOff = () => process.env["NODE_ENV"] === "test" && process.env["RATE_LIMITS"] !== "on";
const rule = (window: number, max: number) => () => (limitsOff() ? false : { window, max });

export const auth = betterAuth({
  appName: "AI Amplify",
  baseURL: siteUrl,
  basePath: "/api/auth",
  // An empty BETTER_AUTH_SECRET (compose default) must fall back too, or
  // Better Auth would use its public default secret.
  secret: process.env["BETTER_AUTH_SECRET"] || process.env["JWT_SECRET"],
  trustedOrigins: [siteUrl],
  telemetry: { enabled: false },
  // Built-in endpoints AI Amplify doesn't use. Profile edits go through
  // PUT /api/account/me (validated), resets and verification through email
  // codes, so these would only be ways around those rules.
  disabledPaths: [
    "/update-user",
    "/change-email",
    "/delete-user",
    "/request-password-reset",
    "/reset-password",
    "/verify-email",
    "/send-verification-email",
    "/link-social",
    "/unlink-account",
    // Email change by code: AI Amplify never sends those codes, so leave no way in.
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
      rateLimit: authRateLimits,
    },
  }),

  user: {
    modelName: "users",
    fields: { name: "fullName", image: "avatarUrl" },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "sme", input: false },
      country: { type: "string", required: false, input: false },
      legacyAccount: { type: "boolean", required: false, defaultValue: false, input: false, returned: false },
    },
  },

  session: {
    expiresIn: 7 * DAY,
    updateAge: DAY,
    // Session checks read a signed cookie for up to 5 minutes before going
    // back to the database, so a revoked session can linger that long.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  emailAndPassword: {
    enabled: true,
    // Accounts are created by the AI Amplify endpoints (auth/amplifyPlugin.ts)
    // after the email is proven, never by Better Auth's open sign-up.
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: { hash: hashPassword, verify: verifyPassword },
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    // A legacy account signing in with its password gets a code to verify
    // its email, then is signed in by entering it.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: "hashed",
      // Sign-in codes go only to existing accounts; sign-up has its own flow.
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "change-email") return;
        await sendCodeEmail(email, otp, type);
      },
    }),
    amplifyPlugin(),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Per-email limits first (auth/emailLimits.ts), so a spent budget stops
      // the request before any code is sent or checked.
      await enforceEmailBudget(ctx);
      await verifyLegacyAccount(ctx);
    }),
  },

  rateLimit: {
    // Always on; each rule below switches itself off in the test suite unless
    // a test opts in with RATE_LIMITS=on (read per request, like
    // middleware/limits.ts). `enabled` itself is only read at startup.
    enabled: true,
    storage: "database",
    window: 60,
    // Generous default: a whole office can share one public IP.
    max: 300,
    customRules: {
      // Every page asks for the session; it only reads the caller's own.
      "/get-session": false,
      "/sign-in/email": rule(60, 5),
      "/sign-in/email-otp": rule(60, 5),
      "/email-otp/send-verification-otp": rule(60, 3),
      "/email-otp/request-password-reset": rule(60, 3),
      "/email-otp/verify-email": rule(60, 5),
      "/email-otp/reset-password": rule(60, 5),
      "/amplify/sign-up/send-code": rule(60, 3),
      "/amplify/sign-up/verify-code": rule(60, 10),
      "/amplify/sign-up": rule(60, 5),
      "/amplify/mentor-setup": rule(60, 5),
      "/amplify/partner-setup": rule(60, 5),
    },
  },

  advanced: {
    // Better Auth skips its CSRF origin check when NODE_ENV=test; keep it on so
    // the suite tests what production does.
    disableOriginCheck: false,
    cookiePrefix: "amplify",
    useSecureCookies: isProduction,
    database: { generateId: "uuid" },
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
