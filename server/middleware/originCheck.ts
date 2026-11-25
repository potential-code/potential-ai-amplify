import type { Request, Response, NextFunction } from "express";
import { operatorKeyAllowedFor, operatorKeysEnabled, readBearer, requestPathname } from "../auth/operatorKeys";

/**
 * Cross-site request check for every state-changing API call.
 *
 * A POST/PUT/PATCH/DELETE under /api must come from the site itself: its
 * `Origin` header (or, when a browser leaves Origin out, its `Referer`) must
 * be FRONTEND_URL's or BETTER_AUTH_URL's origin. Anything else, including a
 * request with neither header or `Origin: null`, is refused with 403 before
 * the body is read. Browsers send Origin on every non-GET request, so this
 * only ever refuses another site (or a script) trying to act with a learner's
 * cookie. The session cookie's SameSite setting is the first line; this is
 * the second.
 *
 * Exempt:
 * - /api/auth/*: Better Auth checks the origin itself (trustedOrigins) and is
 *   mounted before this middleware anyway.
 * - /api/webhooks/*: Zoom, trusted on its signature (routes/zoomWebhook.routes.ts).
 * - Operator-key requests (Maya): when operator keys are on and the route takes
 *   them, authenticate() checks the Bearer key and ignores any cookie, so there
 *   is no ambient credential to forge. A browser can't add an Authorization
 *   header cross-site without a CORS preflight, which CORS refuses.
 */

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT_PREFIXES = ["/api/auth/", "/api/webhooks/"];

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** The site's own origins: FRONTEND_URL and BETTER_AUTH_URL (localhost:3000 when neither is set). */
export function siteOrigins(): Set<string> {
  const configured = [process.env["FRONTEND_URL"], process.env["BETTER_AUTH_URL"]]
    .map((v) => originOf(v?.trim()))
    .filter((v): v is string => v !== null);
  return new Set(configured.length > 0 ? configured : ["http://localhost:3000"]);
}

/** The origin a request claims to come from: Origin, else Referer's origin. Null when neither is usable. */
export function requestOrigin(req: Request): string | null {
  const origin = req.headers["origin"];
  if (typeof origin === "string" && origin !== "") return origin === "null" ? null : originOf(origin);
  const referer = req.headers["referer"];
  return typeof referer === "string" ? originOf(referer) : null;
}

function exempt(req: Request): boolean {
  // The normalised path, so "/api/auth/../admin" is not mistaken for Better Auth's.
  const path = requestPathname(req)?.toLowerCase() ?? "";
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return true;
  return readBearer(req) !== null && operatorKeysEnabled() && operatorKeyAllowedFor(req);
}

export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE.has(req.method.toUpperCase()) || exempt(req)) {
    next();
    return;
  }
  const origin = requestOrigin(req);
  if (origin !== null && siteOrigins().has(origin)) {
    next();
    return;
  }
  req.log?.warn({ method: req.method, origin: origin ?? "(none)" }, "[origin-check] refused a cross-site request");
  res.status(403).json({
    success: false,
    error: { message: "This request didn't come from the AI Amplify site.", code: "CROSS_SITE_REQUEST" },
  });
}
