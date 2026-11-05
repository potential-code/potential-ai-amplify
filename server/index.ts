import { app } from "./app";
import { logger } from "./config/logger";
import { refreshOutdatedCertificates } from "./services/lms/certificate.service";
import { startReminders } from "./services/reminders.service";
import { applyAiSchemaIfChanged } from "./services/ai-sql/apply-on-boot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Keep idle connections open longer than the proxy does, so it never reuses
// a connection Node has just closed ("socket hang up" errors).
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Certificates drawn before the current renderer (the blank-text ones from
// before the font fix) are drawn again, in the background.
void refreshOutdatedCertificates();

// Build the AI analytics `ai` schema if it is missing or out of date. In the
// background: it never blocks or fails the boot (AI analytics answers 503
// until it exists).
void applyAiSchemaIfChanged();

// Session reminders and course nudges, every 15 minutes (in-app; emails only
// with REMINDER_EMAILS_ENABLED=true; learners only with
// LEARNER_NOTIFICATIONS_ENABLED=true).
startReminders();
