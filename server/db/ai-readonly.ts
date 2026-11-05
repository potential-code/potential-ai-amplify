/**
 * AI analytics — the database connection generated SQL runs on.
 *
 * Two modes:
 *
 * 1. AI_READONLY_DATABASE_URL set (recommended for production): a second,
 *    deliberately separate pool that connects as `amplify_ai_readonly`, which can
 *    SELECT from the `ai` schema and do nothing else anywhere (see
 *    server/db/aiViews/000_role.sql.example). The role's GRANTs are then the
 *    security boundary, and `checkReadonlyRoleSafety()` refuses to run anything
 *    if that role turns out to hold more than it should.
 *
 * 2. Unset (the default — works locally and in production with no new env):
 *    the app's main pool. Every query still runs inside `BEGIN READ ONLY` with
 *    `SET LOCAL statement_timeout` and `SET LOCAL search_path = ai`, behind
 *    the AST guard (server/services/ai-sql/guard.ts), which only lets `ai.*`
 *    views and non-system functions through. Writes are impossible either
 *    way; what mode 1 adds is that a guard bug could not read a base table.
 */

import pg from "pg";
import { pool as mainPool } from "./index";
import { AI_STATEMENT_TIMEOUT_MS } from "../services/ai-sql/limits";

let readonlyPool: pg.Pool | null = null;

export function readonlyDatabaseUrl(): string {
  return (process.env["AI_READONLY_DATABASE_URL"] ?? "").trim();
}

/** True when the dedicated read-only role is configured for this environment. */
export function isAiReadonlyConfigured(): boolean {
  return readonlyDatabaseUrl().length > 0;
}

let warnedFallback = false;

/** The pool AI queries run on: the read-only role's when configured, else the main pool. */
export function getAiQueryPool(): { pool: pg.Pool; dedicated: boolean } {
  if (!isAiReadonlyConfigured()) {
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn(
        "[ai-readonly] AI_READONLY_DATABASE_URL is not set — AI analytics queries run on the main pool " +
          "in READ ONLY transactions behind the SQL guard. See server/db/aiViews/000_role.sql.example.",
      );
    }
    return { pool: mainPool, dedicated: false };
  }
  if (!readonlyPool) {
    // Small on purpose: an LLM will occasionally write an expensive query, and
    // a narrow pool keeps that cost from spreading into the app's connections.
    readonlyPool = new pg.Pool({
      connectionString: readonlyDatabaseUrl(),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Duplicates the role-level settings (ALTER ROLE ... SET) so the ceiling
      // holds even if the role was provisioned by hand and that step forgotten.
      statement_timeout: AI_STATEMENT_TIMEOUT_MS,
      options: "-c default_transaction_read_only=on -c search_path=ai",
      application_name: "amplify_ai_analytics",
    });
  }
  return { pool: readonlyPool, dedicated: true };
}

/** Closes the read-only pool (tests). */
export async function closeAiReadonlyPool(): Promise<void> {
  const p = readonlyPool;
  readonlyPool = null;
  roleSafetyCheck = null;
  if (p) await p.end();
}

interface RoleSafetyCheckRow {
  can_read_users: boolean;
  is_superuser: boolean;
  bypasses_rls: boolean;
  can_create_in_ai: boolean;
  db_user: string;
}

export type RoleSafetyResult = { safe: true } | { safe: false; reason: string; currentUser: string };

/**
 * The privilege check is trusted, the role's name is not — a role could be
 * named to look read-only and still hold real access. Pure, so it is
 * unit-testable without a connection.
 */
export function evaluateRoleSafety(row: RoleSafetyCheckRow): RoleSafetyResult {
  const failed: string[] = [];
  if (row.can_read_users) failed.push("can read public.users");
  if (row.is_superuser) failed.push("is superuser");
  if (row.bypasses_rls) failed.push("bypasses RLS");
  if (row.can_create_in_ai) failed.push("can create in the ai schema");
  if (failed.length === 0) return { safe: true };
  return { safe: false, reason: failed.join(", "), currentUser: row.db_user };
}

let roleSafetyCheck: Promise<RoleSafetyResult> | null = null;

/**
 * Confirms, by asking Postgres, that the dedicated role really can do no more
 * than SELECT on `ai`. Cached for the life of the process once it produces a
 * verdict; a connection failure is not a verdict, so it clears the cache and
 * the next call retries.
 */
export async function checkReadonlyRoleSafety(p: pg.Pool): Promise<RoleSafetyResult> {
  if (roleSafetyCheck) return roleSafetyCheck;
  const promise = (async (): Promise<RoleSafetyResult> => {
    const { rows } = await p.query<RoleSafetyCheckRow>(`
      SELECT
        has_table_privilege('public.users', 'select') AS can_read_users,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls,
        has_schema_privilege('ai', 'create') AS can_create_in_ai,
        current_user AS db_user
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    const row = rows[0];
    if (!row) return { safe: false, reason: "no pg_roles row matched current_user", currentUser: "" };
    const result = evaluateRoleSafety(row);
    if (!result.safe) {
      console.error(
        `[ai-readonly] refusing to query — the role is not safe (current_user=${result.currentUser}): ${result.reason}`,
      );
    }
    return result;
  })();
  roleSafetyCheck = promise;
  try {
    return await promise;
  } catch (err) {
    roleSafetyCheck = null;
    throw err;
  }
}
