import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";
import type { Request } from "express";

// Shared rate limits (ported from SMEEP). Each limiter keeps its own in-memory
// counter (one API instance; counters reset on deploy), keyed by the signed-in
// user, the visitor's IP or the email in the request, never shared across
// unrelated routes. req.ip is the real visitor because app.ts trusts the proxy.
// The test suite fires many requests from one process, so NODE_ENV=test lifts
// the caps unless a test opts back in with RATE_LIMITS=on.

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const off = () => process.env["NODE_ENV"] === "test" && process.env["RATE_LIMITS"] !== "on";

const message = (text: string) => ({ success: false, error: { message: text, code: "RATE_LIMITED" } });

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "");

function limiter(
  name: string,
  windowMs: number,
  max: number,
  key: (req: Request) => string,
  text: string,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: off,
    keyGenerator: (req) => `${name}:${key(req)}`,
    message: message(text),
  });
}

/** Per signed-in user (falls back to IP before authenticate has run). */
export function perUser(
  name: string,
  windowMs: number,
  max: number,
  text = "You're doing that too often. Please wait a little and try again.",
): RateLimitRequestHandler {
  return limiter(name, windowMs, max, (req) => req.user?.userId ?? `ip:${ipKey(req)}`, text);
}

/** Per visitor IP, for routes anyone can call. */
export function perIp(
  name: string,
  windowMs: number,
  max: number,
  text = "Too many requests, please try again later.",
): RateLimitRequestHandler {
  return limiter(name, windowMs, max, ipKey, text);
}

/**
 * Per email address in the request body, so one account can't be targeted
 * (password guessing, code guessing, code-email flooding) from many IPs.
 * Requests without an email fall back to the IP.
 */
export function perEmail(
  name: string,
  windowMs: number,
  max: number,
  text = "Too many attempts for this email. Please wait a few minutes and try again.",
): RateLimitRequestHandler {
  return limiter(name, windowMs, max, (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" && email ? `email:${email.trim().toLowerCase()}` : `ip:${ipKey(req)}`;
  }, text);
}

/**
 * A short-window limit plus a daily cap for the same action, e.g.
 * `capped("cod-path", 3, HOUR, 10)`: 3 an hour and 10 a day per user.
 */
export function capped(name: string, perWindow: number, windowMs: number, perDay: number): RateLimitRequestHandler[] {
  return [
    perUser(`${name}:w`, windowMs, perWindow),
    perUser(`${name}:d`, DAY, perDay, "You've reached today's limit for this. Please try again tomorrow."),
  ];
}
