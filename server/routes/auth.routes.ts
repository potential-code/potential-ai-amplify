import { Router, type IRouter } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { perIp, perEmail, MINUTE, HOUR } from "../middleware/limits";
import * as authController from "../controllers/auth.controller";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

// Each route has its own limits, per visitor IP and (where an email is sent)
// per email address. They used to share one bucket, and before app.ts trusted
// the proxy every visitor counted as the same IP, so 20 requests in 15 minutes
// across the whole site (Anna's guest tokens included) locked everyone out.
const loginIp = perIp("login", 15 * MINUTE, 30);
const loginEmail = perEmail("login", 15 * MINUTE, 10);
const otpSendIp = perIp("otp-send", 15 * MINUTE, 20);
const otpSendEmail = perEmail("otp-send", 15 * MINUTE, 5, "Too many codes requested for this email. Please wait a few minutes.");
const otpCheckIp = perIp("otp-check", 15 * MINUTE, 30);
const otpCheckEmail = perEmail("otp-check", 15 * MINUTE, 10);
const registerIp = perIp("register", HOUR, 10);
const lookupIp = perIp("lookup", 15 * MINUTE, 60);
// The landing-page chat mints one guest token per visit; a workshop room
// shares one Wi-Fi IP, so this stays generous.
const guestTokenIp = perIp("guest-token", 15 * MINUTE, 300);

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/**
 * Registration body schema.
 * - fullName: trimmed, must be non-empty
 * - email: normalised to lowercase for consistent storage and lookup
 * - password: optional 8–128 chars (min prevents weak passwords; max prevents DoS via bcrypt);
 *   without one the account signs in by email code and can set a password later
 * - country: trimmed, must be non-empty
 * - couponCode: the admin-issued, single-use invite code (registration is invite-only)
 * - verifiedToken: the "email-verified" JWT from /verify-otp, proving the
 *   person owns the email before the account exists
 */
const registerDto = z.object({
  fullName: z.string().min(1).max(200).trim(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128).optional(),
  country: z.string().min(1).max(100),
  couponCode: z.string().trim().min(1, "An invite code is required").max(100),
  verifiedToken: z.string().min(1, "Verify your email first"),
});

/**
 * Login body schema.
 * - email normalised to lowercase to match stored value
 * - password max-bounded to prevent DoS via oversized bcrypt input
 */
const loginDto = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

/** Normalise URL-ish fields: null and "" both become null; valid URLs pass through. */
const optionalProfileUrl = z
  .preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.string().url("Must be a valid URL").max(500).optional(),
  )
  .transform((v) => v ?? null);

/**
 * Update-profile body schema.
 * All fields are optional — only supplied fields are persisted.
 * linkedinUrl and meetingLink are only written for the relevant role users.
 */
const updateProfileDto = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(200).trim().optional(),
  phone: z.string().max(30).nullable().optional(),
  bio: z.string().max(500, "Bio must be under 500 characters").nullable().optional(),
  company: z.string().max(200).trim().nullable().optional(),
  country: z.string().max(100).trim().nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  linkedinUrl: optionalProfileUrl.optional(),
  meetingLink: optionalProfileUrl.optional(),
});

/**
 * Change-password body schema.
 * newPassword max-bounded to prevent DoS via oversized bcrypt input.
 */
const changePasswordDto = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
});

/**
 * Send-OTP body schema.
 * email normalised to lowercase to match stored value and OTP lookups.
 */
const sendOtpDto = z.object({
  email: z.string().email().toLowerCase(),
});

/**
 * Verify-OTP body schema.
 * - email normalised to lowercase
 * - code: exactly 6 digits (matches the server-generated format)
 */
const verifyOtpDto = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

/**
 * Login-OTP body schema (existing-user passwordless login).
 * Identical validation to verifyOtpDto — same email + 6-digit code shape.
 */
const loginOtpDto = z.object({
  email: z.string().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

/**
 * Set-password body schema (first password for an OTP-only account).
 * Both fields max-bounded to prevent DoS via oversized bcrypt input.
 * Equality of password/confirm is enforced in the service.
 */
const setPasswordDto = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirm: z.string().min(8).max(128),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Auth routes — mounted at /api/auth in routes/index.ts
 *
 * POST   /api/auth/register        — create account + receive JWT
 * POST   /api/auth/send-otp        — email a 6-digit verification code (passwordless)
 * POST   /api/auth/verify-otp      — verify code, receive short-lived email-verified JWT
 * POST   /api/auth/login-otp       — verify code for an EXISTING user, receive auth JWT
 * POST   /api/auth/set-password    — set first password for an OTP-only account (requires JWT)
 * POST   /api/auth/login           — exchange credentials for JWT
 * GET    /api/auth/me              — fetch own profile (requires valid JWT)
 * PUT    /api/auth/me              — update own profile fields (requires valid JWT)
 * POST   /api/auth/change-password — change own password (requires valid JWT)
 * POST   /api/auth/logout          — stateless; client clears token
 * GET    /api/auth/check-email     — check whether an email is available (no auth required)
 * GET    /api/auth/check-coupon    — advisory coupon pre-validation (no auth required)
 */

router.post("/register", registerIp, validate(registerDto), authController.register);
// Sign-in codes: limited per visitor and per email (code requests and guesses).
router.post("/send-otp", otpSendIp, otpSendEmail, validate(sendOtpDto), authController.sendOtp);
router.post("/verify-otp", otpCheckIp, otpCheckEmail, validate(verifyOtpDto), authController.verifyOtp);
// OTP login for EXISTING users — verifies the code and returns a real auth JWT.
router.post("/login-otp", otpCheckIp, otpCheckEmail, validate(loginOtpDto), authController.loginOtp);
router.post("/login", loginIp, loginEmail, validate(loginDto), authController.login);
// Set first password for an OTP-only account — authenticated, no current password needed.
router.post("/set-password", authenticate, validate(setPasswordDto), authController.setPassword);
router.get("/me", authenticate, authController.me);
// Short-lived service JWT for the AI backend (chat + voice) — logged-in users only.
router.get("/copilot-token", authenticate, authController.copilotToken);
// Anonymous variant for the public landing-page chat (rate-limited, 30 min).
router.get("/copilot-token/guest", guestTokenIp, authController.guestCopilotToken);
router.put("/me", authenticate, validate(updateProfileDto), authController.updateProfile);
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordDto),
  authController.changePassword,
);
router.post("/logout", authController.logout);

// Query-param validation is performed inside the controller because the shared
// `validate` middleware only targets req.body. A per-IP limit is applied to
// discourage bulk scraping / enumeration at rate-limit granularity.
router.get("/check-email", lookupIp, authController.checkEmail);

// Advisory coupon pre-validation. Per-IP limited to prevent bulk
// coupon enumeration. Always returns HTTP 200; valid:false means invalid code.
router.get("/check-coupon", lookupIp, authController.checkCoupon);

export default router;
