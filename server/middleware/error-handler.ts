import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppError } from "../utils/app-error";
import { logger } from "../config/logger";

/**
 * Global Express error-handling middleware.
 *
 * Must be registered LAST in `server/index.ts` so it catches errors from all
 * other middleware and route handlers.
 *
 * - `AppError` instances are converted to structured JSON responses.
 * - Unknown errors are logged and returned as 500 without leaking internals.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // `next` must be declared even if unused — Express uses arity-4 to identify
  // error-handling middleware.
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code },
    });
    return;
  }

  // Request problems raised by Express's body parser (bad JSON → 400, too
  // large → 413) and by multer (file too big, wrong field) are the caller's
  // fault: answer with a clear 4xx instead of "Internal server error".
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      success: false,
      error: {
        message: tooLarge ? "That file is too large." : "That upload couldn't be read.",
        code: tooLarge ? "FILE_TOO_LARGE" : "BAD_UPLOAD",
      },
    });
    return;
  }
  if (err instanceof Error && err.message === "FILE_TYPE_NOT_ALLOWED") {
    res.status(400).json({
      success: false,
      error: { message: "That file type isn't allowed.", code: "FILE_TYPE_NOT_ALLOWED" },
    });
    return;
  }
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status ??
    (err as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const type = (err as { type?: unknown }).type;
    res.status(status).json({
      success: false,
      error: {
        message:
          type === "entity.parse.failed" ? "The request body isn't valid JSON."
          : status === 413 ? "The request is too large."
          : "The request couldn't be processed.",
        code: type === "entity.parse.failed" ? "INVALID_JSON" : status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
      },
    });
    return;
  }

  // body-parser: malformed JSON or an oversized body is the client's mistake, not a 500.
  const parseError = err as { type?: string; status?: number } | null;
  if (parseError?.type === "entity.parse.failed") {
    res.status(400).json({
      success: false,
      error: { message: "The request body is not valid JSON.", code: "INVALID_JSON" },
    });
    return;
  }
  if (parseError?.type === "entity.too.large") {
    res.status(413).json({
      success: false,
      error: { message: "The request is too large.", code: "PAYLOAD_TOO_LARGE" },
    });
    return;
  }

  // Unexpected error — log the full details server-side but never expose them.
  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: { message: "Internal server error", code: "INTERNAL_ERROR" },
  });
}
