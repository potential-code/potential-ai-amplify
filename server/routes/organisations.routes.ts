import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import * as org from "../controllers/organisations.controller";

/** Public: what an organisation sign-up link joins. Mounted at /api/organisations. */
export const organisationsRouter: IRouter = Router();

const lookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env["NODE_ENV"] === "test" ? 10_000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many tries. Wait a few minutes and try again.", code: "RATE_LIMITED" } },
});

organisationsRouter.get("/join/:code", lookupLimiter, org.joinInfo);

/** Partner contacts: their organisation's dashboard. Mounted at /api/partner. */
export const partnerRouter: IRouter = Router();

partnerRouter.get("/setup-token", lookupLimiter, org.setupToken);
partnerRouter.get("/dashboard", authenticate, requireRole("partner"), org.partnerDashboard);
partnerRouter.get("/exports/:dataset", authenticate, requireRole("partner"), org.partnerExport);
partnerRouter.get("/learners/:userId", authenticate, requireRole("partner"), org.partnerParticipant);
