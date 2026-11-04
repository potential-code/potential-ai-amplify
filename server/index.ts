import { app } from "./app";
import { logger } from "./config/logger";
import { refreshOutdatedCertificates } from "./services/lms/certificate.service";

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
