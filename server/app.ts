import path from "path";
import { fileURLToPath } from 'url'
import express, { type Express } from "express";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { toNodeHandler } from "better-auth/node";
import router from "./routes";
import { auth } from "./auth";
import { logger } from "./config/logger";
import { basicAuthGate } from "./middleware/basic-auth";
import { errorHandler } from "./middleware/error-handler";
import zoomWebhookRouter from "./routes/zoomWebhook.routes";
import { perIp, MINUTE } from "./middleware/limits";

// Fail fast without a signing secret: Better Auth signs session cookies with
// BETTER_AUTH_SECRET, falling back to JWT_SECRET (auth/index.ts).
const sessionSecret = process.env["BETTER_AUTH_SECRET"] || process.env["JWT_SECRET"];
if (!sessionSecret) {
  throw new Error(
    "BETTER_AUTH_SECRET (or JWT_SECRET) environment variable is required but was not provided.",
  );
}
// Anyone who learns or guesses the secret can forge session cookies, an
// admin's included. Production refuses to start with a weak one.
if (process.env["NODE_ENV"] === "production" && sessionSecret.length < 32) {
  throw new Error(
    "BETTER_AUTH_SECRET must be at least 32 characters in production (generate one with `openssl rand -base64 32`).",
  );
}

// The AI assistant mints service JWTs signed with COPILOT_SERVICE_JWT_SECRET
// (must match potential-ai's SERVICE_JWT_SECRET). Validate presence and
// strength at boot rather than failing per-request: an 8-char HMAC key is
// brute-forceable. Optional — if unset, the assistant endpoints 503 cleanly.
const copilotSecret = process.env["COPILOT_SERVICE_JWT_SECRET"];
if (copilotSecret && copilotSecret.length < 32) {
  throw new Error(
    "COPILOT_SERVICE_JWT_SECRET must be at least 32 characters when set.",
  );
}

const app: Express = express();

// Behind Dokploy's proxy (Traefik) every request arrives from the proxy's
// address. Trusting private-network hops makes req.ip the real visitor, so
// per-visitor rate limits don't collapse onto one shared IP.
// TRUST_PROXY_HOPS overrides this with a fixed hop count (e.g. behind a CDN).
app.set(
  "trust proxy",
  process.env["TRUST_PROXY_HOPS"] ? Number(process.env["TRUST_PROXY_HOPS"]) : "loopback, linklocal, uniquelocal",
);

// Security headers (HSTS, nosniff, frame-options, etc.). Registered first so
// every response — including errors — carries them.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  // Lock CORS to the configured frontend origin. Falls back to localhost in
  // development; override via FRONTEND_URL in production.
  // `||`, not `??`: compose passes an unset FRONTEND_URL as "", which would allow any origin.
  origin: process.env["FRONTEND_URL"] || "http://localhost:3000",
  credentials: true,
}));
// Better Auth reads the raw request body, so it is mounted before the body
// parsers. It owns everything under /api/auth.
app.all("/api/auth/*splat", toNodeHandler(auth));

// Zoom signs the raw body, so its webhook is mounted before the JSON parser.
app.use("/api/webhooks/zoom", zoomWebhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// A ceiling for every API route, per visitor, under the routes' own limits:
// 20 requests a second is far above any real page, even for an office sharing
// one address. Sign-in (/api/auth, above) has its own limits.
app.use("/api", perIp("api", MINUTE, 1200));

// Serve uploaded files without authentication — files are addressed by
// opaque filenames and do not expose sensitive data beyond the file itself.
// The basicAuthGate (admin UI guard) is intentionally bypassed here.
app.use(
  "/uploads",
  express.static(path.join(__dirname, '..', 'uploads'), {
    setHeaders: (res, filePath) => {
      // Never let the browser guess a different type than the extension says.
      res.setHeader("X-Content-Type-Options", "nosniff");
      // An SVG opened directly is a document that can run script on this
      // origin; sandbox it. <img> embeds are unaffected.
      if (filePath.toLowerCase().endsWith(".svg")) {
        res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      }
    },
  }),
);

app.use(basicAuthGate);

app.use("/api", router);

// Unknown API routes answer in the same JSON shape as every other error.
app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, error: { message: "Not found", code: "NOT_FOUND" } });
});

// Global error handler — must be registered after all routes.
app.use(errorHandler);

export { app };
