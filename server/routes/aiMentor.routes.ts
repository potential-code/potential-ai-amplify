import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { perUser, MINUTE } from "../middleware/limits";

/**
 * AI mentors run on Potential's bot service. The browser used to call it
 * directly, unauthenticated; these routes put it behind the learner's AI Amplify
 * session, so learner conversations only ever leave through the AI Amplify server.
 */
const router: IRouter = Router();

const UPSTREAM = process.env["AI_MENTOR_API_URL"] || "https://api.potential.com";

/** The six AI Amplify AI mentors (client/lib/constants/content.ts). No other bot can be reached. */
const BOT_IDS = new Set([
  "64b78f8ea3495eade7931f1f",
  "64b7b59c2d7b52ec97f3a258",
  "64b7a7682d7b52ec97f3a21d",
  "6540b46f64bed7823ecd4209",
  "64cb87a1293c2813e908395e",
  "64b79d632d7b52ec97f3a204",
]);

const unavailable = { success: false, error: { message: "This mentor is unavailable right now. Please try again in a moment.", code: "MENTOR_UNAVAILABLE" } };

function knownBot(req: Request, res: Response): string | null {
  const botId = String(req.params["botId"] ?? "");
  if (BOT_IDS.has(botId)) return botId;
  res.status(404).json({ success: false, error: { message: "Mentor not found", code: "NOT_FOUND" } });
  return null;
}

// Per learner, so one busy office network doesn't share a limit.
const chatLimiter = perUser("ai-mentor-chat", MINUTE, 20);

/**
 * GET /api/ai-mentors/:botId
 * The mentor's name, greeting and ice-breakers. Never the bot's system prompt.
 */
router.get("/:botId", authenticate, async (req: Request, res: Response): Promise<void> => {
  const botId = knownBot(req, res);
  if (!botId) return;
  try {
    const upstream = await fetch(`${UPSTREAM}/api/admin/bot/${botId}`, { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok) {
      res.status(502).json(unavailable);
      return;
    }
    const bot = (await upstream.json()) as { name?: string; greeting?: string; active?: boolean; prePrompt?: unknown };
    res.json({
      success: true,
      data: {
        name: bot.name ?? "",
        greeting: bot.greeting ?? "",
        active: bot.active !== false,
        prePrompt: Array.isArray(bot.prePrompt) ? bot.prePrompt.filter((p): p is string => typeof p === "string").slice(0, 6) : [],
      },
    });
  } catch {
    res.status(502).json(unavailable);
  }
});

const chatDto = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionId: z.string().regex(/^[\w-]{1,100}$/),
  /** A document the learner shared (text read by POST /api/ask-sana/documents). */
  document: z
    .object({
      name: z.string().trim().min(1).max(120),
      text: z.string().min(1).max(20_000),
      /** The browser or the reader already cut a long document short. */
      truncated: z.boolean().optional(),
    })
    .optional(),
});

/** How much of a shared document the mentor reads (the hosted Potential chat sends about 6,000 characters). */
const DOCUMENT_CHARS = 12_000;

/** The learner's words, then the document, the way the hosted Potential chat attaches one. */
export function withDocument(message: string, doc?: { name: string; text: string; truncated?: boolean }): string {
  if (!doc) return message;
  const text = doc.text.trim();
  const cut = doc.truncated === true || text.length > DOCUMENT_CHARS;
  const name = doc.name.replace(/["\r\n]/g, "'");
  return `${message}\n\n[Attached document "${name}"${cut ? " (only the first part of a long document)" : ""}]\n${text.slice(0, DOCUMENT_CHARS)}`;
}

/**
 * POST /api/ai-mentors/:botId/chat  { message, sessionId, document? }
 * Streams the bot's server-sent events straight back to the learner.
 */
router.post("/:botId/chat", authenticate, chatLimiter, validate(chatDto), async (req: Request, res: Response): Promise<void> => {
  const botId = knownBot(req, res);
  if (!botId) return;
  const { message, sessionId, document } = req.body as z.infer<typeof chatDto>;
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  try {
    const upstream = await fetch(`${UPSTREAM}/agent/chatbot/${botId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Scoped to the learner, so one learner's session id can never continue another's conversation.
      body: JSON.stringify({ message: withDocument(message, document), sessionId: `amplify-${req.user!.userId}-${sessionId}` }),
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]),
    });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json(unavailable);
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    Readable.fromWeb(upstream.body as unknown as WebReadableStream<Uint8Array>)
      .on("error", () => res.end())
      .pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).json(unavailable);
    else res.end();
  }
});

export default router;
