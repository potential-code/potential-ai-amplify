/**
 * Preloaded before every integration test file (`bun test --preload`).
 *
 * The suite runs the real Express app against a real Postgres. It refuses to
 * run against anything but a database whose name ends in `_test`, so it can
 * never touch a development or production database by mistake. Migrations are
 * applied once here; fixtures use @e2e.local emails and clean up after
 * themselves.
 *
 *   createdb amplify_test
 *   TEST_DATABASE_URL=postgres://localhost:5432/amplify_test bun run test
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { mock } from "bun:test";

process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"] ?? "postgres://localhost:5432/amplify_test";
process.env["JWT_SECRET"] ??= "test-jwt-secret-0123456789abcdef0123456789";
process.env["COPILOT_SERVICE_JWT_SECRET"] ??= "test-copilot-secret-0123456789abcdef0123";
process.env["FRONTEND_URL"] ??= "http://localhost:3000";
process.env["STRIPE_SECRET_KEY"] ??= "sk_test_e2e_placeholder";

const dbName = new URL(process.env["DATABASE_URL"]).pathname.replace("/", "");
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to run tests against "${dbName}": the database name must end in _test.`);
}

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
await migrate(drizzle(pool), { migrationsFolder: path.join(import.meta.dir, "..", "db", "migrations") });
await pool.end();

// Email is captured instead of sent, so tests can check who a message went to
// (and read sign-in codes) without a mail server.
export interface SentMail { to: string; subject: string; template: string; context: Record<string, unknown> }
const sent: SentMail[] = [];
(globalThis as { __sentMail?: SentMail[] }).__sentMail = sent;
mock.module(path.join(import.meta.dir, "..", "mail", "mailer.ts"), () => ({
  sendMail: async (o: SentMail) => {
    sent.push(o);
  },
}));
