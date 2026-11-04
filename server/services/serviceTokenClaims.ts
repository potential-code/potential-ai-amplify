import crypto from "node:crypto";
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
