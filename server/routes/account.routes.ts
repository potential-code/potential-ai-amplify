import { Router, type IRouter } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { perIp, MINUTE } from "../middleware/limits";
import * as accountController from "../controllers/account.controller";
import * as announcements from "../controllers/announcements.controller";
import { httpUrl } from "../utils/httpUrl";

const router: IRouter = Router();

// Signing in and up is Better Auth's (/api/auth, auth/index.ts), which has its
// own per-IP and per-email limits. These are the account routes around it.
const lookupIp = perIp("lookup", 15 * MINUTE, 60);
// The landing-page chat mints one guest token per visit; a workshop room
// shares one Wi-Fi IP, so this stays generous.
const guestTokenIp = perIp("guest-token", 15 * MINUTE, 300);

/** Normalise URL-ish fields: null and "" both become null; valid URLs pass through. */
const optionalProfileUrl = z
  .preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    httpUrl(500).optional(),
  )
  .transform((v) => v ?? null);

/**
 * Update-profile body schema. All fields are optional; only supplied fields
 * are saved. linkedinUrl and meetingLink are only written for mentors.
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

/** First password for an account created without one (Anna's chat sign-up). */
const setPasswordDto = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirm: z.string().min(8).max(128),
});

const checkEmailDto = z.object({
  email: z.string().email("Must be a valid email address").toLowerCase(),
});

/**
 * Account routes — mounted at /api/account
 *
 * GET  /me                   — own profile
 * PUT  /me                   — update own profile fields
 * POST /set-password         — first password for an account created without one
 * GET  /copilot-token        — service JWT for Anna (chat, voice)
 * GET  /copilot-token/guest  — anonymous token for Anna's landing-page chat
 * POST /check-email {email}  — is this email free to sign up with (in the body,
 *                              so addresses stay out of URLs and logs)
 * GET  /check-coupon?code=   — is this invite code active (advisory)
 * GET/PUT /email-preferences — announcement emails on or off
 * POST /unsubscribe {token}  — one-click unsubscribe from an announcement email
 *
 * Changing a password (with the current one) is Better Auth's own
 * POST /api/auth/change-password.
 */
router.get("/me", authenticate, accountController.me);
router.put("/me", authenticate, validate(updateProfileDto), accountController.updateProfile);
router.post("/set-password", authenticate, validate(setPasswordDto), accountController.setPassword);
router.get("/copilot-token", authenticate, accountController.copilotToken);
router.get("/copilot-token/guest", guestTokenIp, accountController.guestCopilotToken);
router.post("/check-email", lookupIp, validate(checkEmailDto), accountController.checkEmail);
router.get("/check-coupon", lookupIp, accountController.checkCoupon);
router.get("/email-preferences", authenticate, announcements.getEmailPreferences);
router.put("/email-preferences", authenticate, validate(z.object({ announcements: z.boolean() })), announcements.setEmailPreferences);
router.post("/unsubscribe", lookupIp, validate(z.object({ token: z.string().min(10).max(300) })), announcements.unsubscribe);

export default router;
