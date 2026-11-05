import type { NextFunction, Request, Response } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { AiSqlError } from "../services/ai-sql/guard";

/**
 * Shared by the two routers that run agent-written SQL: AI analytics
 * (/api/admin/ai) and the ecosystem statistics (/api/admin/eco).
 */

/**
 * Per admin, as Sama's AI Insights limiter: 120 requests per 5 minutes covers
 * a dashboard of two dozen charts re-rendering several times over. A factory,
 * so each router gets its own budget.
 */
export function aiSqlLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    max: process.env["NODE_ENV"] === "test" ? 10_000 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.userId ?? "anonymous",
    message: {
      success: false,
      error: { message: "Too many analytics requests. Wait a moment and try again.", code: "RATE_LIMITED" },
    },
  });
}

/**
 * Guard rejections and Postgres errors carry the full list of reasons in
 * `error.errors` — the agent's correction signal. Everything else falls
 * through to the global handler.
 */
export function aiSqlErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AiSqlError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code, errors: err.errors },
    });
    return;
  }
  next(err);
}
