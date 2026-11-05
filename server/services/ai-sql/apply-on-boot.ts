/**
 * Builds the `ai` schema on boot when it is missing or 001_ai_schema.sql has
 * changed since it was last applied (the schema's comment carries the file's
 * hash).
 *
 * Deliberately not a drizzle migration: the views are derived objects that
 * must track the base tables' current shape, and rebuilding them is cheap and
 * idempotent. Runs on its own short-lived connection, matching
 * `db:ai-views` (server/db/aiViews/apply.ts) exactly.
 */

import pg from "pg";
import { applyAiSchema, installedAiSchemaHash, readAiSchemaSql } from "../../db/aiViews/install";

// Arbitrary constant, unique to this lock's purpose — keeps two booting
// instances from building the schema at the same time.
const APPLY_LOCK_KEY = 741_990_224;

/**
 * Builds or rebuilds the `ai` schema against `databaseUrl` if it is missing or
 * out of date. Shared by the boot path and by the test suite.
 *
 * @returns "applied", "up-to-date" or "locked" (another instance is applying)
 */
export async function ensureAiSchema(databaseUrl: string): Promise<"applied" | "up-to-date" | "locked"> {
  const client = new pg.Client({ connectionString: databaseUrl, application_name: "amplify_ai_views_boot" });
  await client.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [APPLY_LOCK_KEY]);
    if (!rows[0]?.locked) return "locked";
    try {
      const { sql: sqlText, hash } = readAiSchemaSql();
      if ((await installedAiSchemaHash(client)) === hash) return "up-to-date";
      await applyAiSchema(client, sqlText, hash);
      return "applied";
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [APPLY_LOCK_KEY]).catch(() => {});
    }
  } finally {
    await client.end().catch(() => {});
  }
}

/** Boot hook: never throws — a failure leaves AI analytics answering 503. */
export async function applyAiSchemaIfChanged(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) return;
  try {
    const started = Date.now();
    const outcome = await ensureAiSchema(url);
    if (outcome === "applied") console.log(`[ai-views] schema rebuilt in ${Date.now() - started}ms`);
    else if (outcome === "locked") console.log("[ai-views] another instance is applying the schema; skipping");
  } catch (error) {
    console.error("[ai-views] could not apply the schema on boot:", error);
  }
}
