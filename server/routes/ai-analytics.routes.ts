import { Router, type IRouter } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/require-role";
import { validate } from "../middleware/validate";
import * as ai from "../controllers/ai-analytics.controller";
import { aiSqlErrorHandler, aiSqlLimiter } from "../middleware/ai-sql";
import { MAX_SQL_LENGTH } from "../services/ai-sql/limits";
import { reportSpecSchema } from "../services/ai-sql/report-spec";

/**
 * AI analytics — AI Insights (chat + reports) and AI Dashboard (saved boards),
 * mounted at /api/admin/ai.
 *
 * Admin-only: the `ai` views are pseudonymised but not scoped per admin, so
 * anyone who can call /query can read the whole schema. The agents themselves
 * run in potential-ai (graphs `dataChat` and `dashboardBuilder`, platformId
 * "smeep"); they only ever see the catalogue, and every statement they write
 * is executed here.
 */
const router: IRouter = Router();

const aiLimiter = aiSqlLimiter();

router.use(authenticate, requireRole("admin"), aiLimiter);

const querySchema = z.object({
  sql: z.string().trim().min(1, "sql is required").max(MAX_SQL_LENGTH),
});

/** GET /api/admin/ai/catalog — the sql-1.2.0 catalogue (no data values). */
router.get("/catalog", ai.getAiCatalog);

/** POST /api/admin/ai/query — guard and run one generated SELECT. */
router.post("/query", validate(querySchema), ai.runAiQuery);

/** POST /api/admin/ai/report — PDF or XLSX of re-run figures. */
router.post("/report", validate(reportSpecSchema), ai.downloadAiReport);

/** Saved AI Dashboard boards (shared across admins). */
router.get("/dashboards", ai.listAiDashboards);
router.post("/dashboards", validate(ai.dashboardBodySchema), ai.createAiDashboard);
router.get("/dashboards/:id", ai.getAiDashboard);
router.put("/dashboards/:id", validate(ai.dashboardBodySchema), ai.updateAiDashboard);
router.delete("/dashboards/:id", ai.deleteAiDashboard);

router.use(aiSqlErrorHandler);

export default router;
