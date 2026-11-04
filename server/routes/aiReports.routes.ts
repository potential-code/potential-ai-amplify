import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import * as svc from "../services/aiReports.service";

/** AI safety reports: learners send them (/api/ai-reports), admins review them (/api/admin/ai-reports). */
export const aiReportsRouter: IRouter = Router();
export const adminAiReportsRouter: IRouter = Router();

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env["NODE_ENV"] === "test" ? 10_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? "anonymous",
  message: { success: false, error: { message: "You've sent a lot of reports. Thank you; try again a little later.", code: "RATE_LIMITED" } },
});

const reportDto = z.object({
  surface: z.string().trim().min(2).max(80).regex(/^[a-z0-9:-]+$/),
  reason: z.enum(svc.REPORT_REASONS),
  note: z.string().trim().max(1000).optional().nullable(),
  reply: z.string().min(1).max(20_000),
  question: z.string().max(8_000).optional().nullable(),
  page: z.string().max(300).optional().nullable(),
});

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

aiReportsRouter.post(
  "/",
  authenticate,
  reportLimiter,
  validate(reportDto),
  wrap(async (req, res) => {
    res.status(201);
    return svc.createReport(req.user!.userId, req.body as svc.NewReport);
  }),
);

adminAiReportsRouter.use(authenticate, requireRole("admin"));
adminAiReportsRouter.get(
  "/",
  wrap(async (req) => {
    const s = String(req.query["status"] ?? "open");
    return svc.listReports((svc.REPORT_STATUSES as readonly string[]).includes(s) ? (s as svc.ReportStatus) : "all");
  }),
);
adminAiReportsRouter.patch(
  "/:id",
  validate(
    z
      .object({ status: z.enum(svc.REPORT_STATUSES).optional(), adminNote: z.string().max(2000).optional().nullable() })
      .refine((b) => b.status !== undefined || b.adminNote !== undefined, { message: "Nothing to change" }),
  ),
  wrap((req) => svc.updateReport(req.user!.userId, String(req.params["id"]), req.body as { status?: svc.ReportStatus; adminNote?: string | null })),
);
