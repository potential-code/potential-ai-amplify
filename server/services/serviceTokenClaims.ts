import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  ASK_ANNA_PROMPT,
  BOTH_DELIVERY_PROMPT,
  COD_DELIVERY_PROMPT,
  LEARNING_PATH_PROMPT,
  SIGN_UP_PROMPT,
} from "../../shared/anna/prompts";

// Claims for the service tokens AI Amplify mints for potential-ai (see
// potential-ai's src/lib/tokenScope.ts). `scope` says what a token is for, and
// browser tokens list the fingerprints of the system prompts they may send.
// potential-ai enforces both for any token that carries a scope (whatever
// STRICT_TOKEN_PLATFORMS says, which only covers tokens without one): agents
// outside the scope are refused, and any other __system_prompt__ is ignored
// (logged, not an error), so a browser can't turn Anna into a general-purpose
// model billed to AI Amplify. A new Anna prompt must be added below, or
// potential-ai will quietly use its default prompt instead.

export const fingerprint = (prompt: string) => crypto.createHash("sha256").update(prompt, "utf8").digest("base64url");

const SIGN_UP = [fingerprint(SIGN_UP_PROMPT)];
// Signed-in users may still be on the landing page, so they get the sign-up prompt too.
const SIGNED_IN = [ASK_ANNA_PROMPT, LEARNING_PATH_PROMPT, COD_DELIVERY_PROMPT, BOTH_DELIVERY_PROMPT, SIGN_UP_PROMPT].map(fingerprint);

/** A signed-in browser: chat and voice agents; admins also get the data agents. */
export const browserClaims = (role: string | undefined) => ({
  scope: role === "admin" ? ("admin" as const) : ("user" as const),
  prompts: SIGNED_IN,
});

/** The public landing chat: the default agent and the sign-up prompt only. */
export const guestClaims = () => ({ scope: "guest" as const, prompts: SIGN_UP });

/** AI Amplify's own server calling potential-ai's /api/* endpoints (path builders). */
export const SERVER_CLAIMS = { scope: "server" as const };

/** Who mints the tokens (`iss`, equal to platformId as potential-ai requires) and who they are for (`aud`). */
export const SERVICE_TOKEN_ISSUER = "ai-amplify";
export const SERVICE_TOKEN_AUDIENCE = "potential-ai";

/**
 * Signs a service token for potential-ai: HS256 with COPILOT_SERVICE_JWT_SECRET
 * (the caller passes it), platformId "ai-amplify", `iss` "ai-amplify" and
 * `aud` "potential-ai". potential-ai checks iss/aud whenever a token carries
 * them (src/lib/serviceToken.ts), and can require them for ai-amplify with
 * SERVICE_JWT_REQUIRE_AUD_PLATFORMS=ai-amplify. Every token AI Amplify mints
 * goes through here.
 */
export function signServiceToken(
  claims: { userId?: string; scope?: string; prompts?: string[] },
  secret: string,
  expiresInSeconds: number,
): string {
  return jwt.sign({ platformId: SERVICE_TOKEN_ISSUER, ...claims }, secret, {
    algorithm: "HS256",
    expiresIn: expiresInSeconds,
    issuer: SERVICE_TOKEN_ISSUER,
    audience: SERVICE_TOKEN_AUDIENCE,
  });
}
