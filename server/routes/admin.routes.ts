import { Router, type IRouter } from "express";
import { z } from "zod";
import { patchOf } from '../utils/zodPatch'

import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import * as adminController from "../controllers/admin.controller";
import * as offersCtrl from "../controllers/offers.controller";
import * as analyticsController from "../controllers/admin.analytics.controller";
import * as announcementsController from "../controllers/announcements.controller";
import * as organisationsController from "../controllers/organisations.controller";
import { ORGANISATION_TYPES } from "../services/organisations.service";
import { isHttpUrl } from "../utils/httpUrl";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Admin guard
// ---------------------------------------------------------------------------
// Every route in this file requires a valid JWT *and* the 'admin' role.
// These two middleware functions are applied once at the router level so they
// cannot be accidentally omitted from an individual route.
router.use(authenticate, requireRole("admin"));

// ---------------------------------------------------------------------------
// Invite code routes
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/invites
 * Lists all invite codes with optional usedBy user details.
 */
router.get("/invites", adminController.listInvites);

/**
 * GET /api/admin/needs-attention
 * Dashboard "Needs attention" counts (pending applications, draft courses,
 * unused invite codes, mentor sessions needing completion).
 */
router.get("/needs-attention", adminController.getNeedsAttention);

/**
 * POST /api/admin/invites
 * Creates a new invite code attributed to the requesting admin.
 */
router.post("/invites", adminController.createInvite);

// ---------------------------------------------------------------------------
// Mentor application routes
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/mentor-applications
 * Lists mentor applications. Accepts optional ?status= query param.
 */
router.get("/mentor-applications", adminController.listMentorApplications);

/**
 * POST /api/admin/mentor-applications/:id/approve
 * Approves a pending mentor application and emails the setup link.
 */
router.post("/mentor-applications/:id/approve", adminController.approveMentorApplication);

/**
 * POST /api/admin/mentor-applications/:id/reject
 * Rejects a mentor application.
 */
router.post("/mentor-applications/:id/reject", adminController.rejectMentorApplication);

// ---------------------------------------------------------------------------
// Stakeholder application routes
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/stakeholder-applications
 * Lists stakeholder registrations. Accepts optional ?type= query param.
 */
router.get("/stakeholder-applications", adminController.listStakeholderApplications);

// ---------------------------------------------------------------------------
// Offers CRUD routes
// ---------------------------------------------------------------------------

/** Valid category values for offers — mirrors the frontend constant. */
const OFFER_CATEGORIES = [
  "AI",
  "Marketing",
  "IT",
  "Finance",
  "PR",
  "Ecommerce",
  "Training",
] as const;

/**
 * DTO for creating a new offer.
 * `imageUrl` accepts a full URL, a local path starting with `/`, or an empty string (coerced to undefined).
 */
const createOfferDto = z.object({
  title: z.string().min(1).max(300).trim(),
  category: z.enum(OFFER_CATEGORIES),
  priceLabel: z.string().min(1).max(200).trim(),
  priceBefore: z.string().max(200).trim().optional(),
  price: z.number().int().min(0),
  pointsCost: z.number().int().min(0),
  imageUrl: z
    .string()
    .refine(
      (val) => val.startsWith('/') || isHttpUrl(val),
      { message: "imageUrl must be a valid URL or a path starting with '/'" },
    )
    .optional()
    .or(z.literal("").transform(() => undefined)),
  status: z.enum(["published", "draft"]).default("published"),
});

/** DTO for partially updating an existing offer — all fields optional. */
const updateOfferDto = patchOf(createOfferDto);

/**
 * GET /api/admin/offers
 * Returns all offers (any status) with total redemption counts.
 */
router.get("/offers", offersCtrl.adminListOffers);

/**
 * POST /api/admin/offers
 * Creates a new offer. Slug is auto-generated from the title.
 */
router.post("/offers", validate(createOfferDto), offersCtrl.adminCreateOffer);

/**
 * PATCH /api/admin/offers/:id
 * Partially updates an existing offer.
 */
router.patch("/offers/:id", validate(updateOfferDto), offersCtrl.adminUpdateOffer);

/**
 * DELETE /api/admin/offers/:id
 * Permanently deletes an offer (cascades to redemptions).
 */
router.delete("/offers/:id", offersCtrl.adminDeleteOffer);

// ── Announcements ───────────────────────────────────────────────────────────
const linkUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^\/[\w\-/?=&#.%]*$/.test(v) || /^https:\/\/\S+$/i.test(v), "Use a page path like /dashboard/events, or an https:// link")
const announcementDto = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  linkUrl: linkUrl.nullable().optional(),
  linkLabel: z.string().trim().max(40).nullable().optional(),
  audience: z.enum(["learners", "mentors", "all"]),
  showBanner: z.boolean(),
  bannerDays: z.number().int().min(1).max(90).nullable().optional(),
  notify: z.boolean(),
  email: z.boolean(),
}).refine((a) => a.showBanner || a.notify || a.email, { message: "Choose at least one way to send it" })

// GET /api/admin/announcements — past announcements
router.get("/announcements", announcementsController.list);
// GET /api/admin/announcements/audience?audience= — how many people (and emails) it would reach
router.get("/announcements/audience", announcementsController.audience);
// POST /api/admin/announcements — create and send (banner, bell, email)
router.post("/announcements", validate(announcementDto), announcementsController.create);
// POST /api/admin/announcements/:id/archive — take the banner down
router.post("/announcements/:id/archive", announcementsController.archive);

// ── Analytics routes ────────────────────────────────────────────────────────
/** GET /api/admin/stats — KPI counts for the Overview dashboard */
router.get("/stats", analyticsController.getKpiStats);

// GET /api/admin/analytics/impact — impact KPIs, monthly outcomes, journeys, countries
router.get("/analytics/impact", analyticsController.getImpact);

// GET /api/admin/analytics/learning-gain — pre-test vs final exam, overall and per course
router.get("/analytics/learning-gain", analyticsController.getLearningGain);

// GET /api/admin/exports/:dataset?format=csv|xlsx — learners, course progress, learning gain,
// certificates, redemptions or mentor sessions as a spreadsheet
router.get("/exports/:dataset", analyticsController.downloadExport);

// GET /api/admin/analytics/insights?range= — Analytics page KPIs (vs previous period) and charts
router.get("/analytics/insights", analyticsController.getAnalyticsInsights);

/** GET /api/admin/analytics/kpi-overview?range=7d|30d|12m */
router.get("/analytics/kpi-overview", analyticsController.getOverviewKpis);

/** GET /api/admin/analytics/user-growth?range=7d|30d|12m */
router.get("/analytics/user-growth", analyticsController.getUserGrowthTrend);

/** GET /api/admin/analytics/enrollments — monthly enrollments for Overview dashboard */
router.get("/analytics/enrollments", analyticsController.getEnrollmentTrend);

/** GET /api/admin/analytics/course-engagement — for Overview dashboard */
router.get("/analytics/course-engagement", analyticsController.getCourseEngagement);

/** GET /api/admin/analytics/course-completion?range=7d|30d|12m */
router.get("/analytics/course-completion", analyticsController.getCourseCompletionRates);

/** GET /api/admin/analytics/course-performance — all-time course table */
router.get("/analytics/course-performance", analyticsController.getCoursePerformance);

/** GET /api/admin/analytics/stakeholder-kpis — count per stakeholder type */
router.get("/analytics/stakeholder-kpis", analyticsController.getStakeholderKpis);

/** GET /api/admin/analytics/stakeholder-trend?range=7d|30d|12m */
router.get("/analytics/stakeholder-trend", analyticsController.getStakeholderTrend);

/** GET /api/admin/analytics/stakeholder-trend-by-type?range=7d|30d|12m */
router.get("/analytics/stakeholder-trend-by-type", analyticsController.getStakeholderTrendByType);


// --- Organisations (partners and their learners) ---

const organisationDto = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(ORGANISATION_TYPES),
});
const organisationPatchDto = z
  .object({ name: z.string().trim().min(2).max(120), type: z.enum(ORGANISATION_TYPES), joinEnabled: z.boolean() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change" });
const addLearnersDto = z.object({ emails: z.array(z.string().trim().email().max(254)).min(1).max(500) });
const invitePartnerDto = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254) });

router.get("/organisations", organisationsController.list);
router.post("/organisations", validate(organisationDto), organisationsController.create);
router.patch("/organisations/:id", validate(organisationPatchDto), organisationsController.update);
router.post("/organisations/:id/join-code", organisationsController.regenerateCode);
router.delete("/organisations/:id", organisationsController.archive);
router.get("/organisations/:id/dashboard", organisationsController.dashboard);
router.get("/organisations/:id/exports/:dataset", organisationsController.adminExport);
router.post("/organisations/:id/learners", validate(addLearnersDto), organisationsController.addLearners);
router.get("/organisations/:id/learners/:userId", organisationsController.adminParticipant);
router.delete("/organisations/:id/learners/:userId", organisationsController.removeLearner);
router.get("/organisations/:id/partners", organisationsController.partners);
router.post("/organisations/:id/partners", validate(invitePartnerDto), organisationsController.invitePartner);
router.delete("/organisations/:id/partners/:userId", organisationsController.removePartner);
router.delete("/organisations/:id/invites/:inviteId", organisationsController.cancelInvite);

export default router;
