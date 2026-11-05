/**
 * Applies the `ai` schema (001_ai_schema.sql) to whatever DATABASE_URL points
 * at, unconditionally.
 *
 *   bun run --filter @workspace/server db:ai-views
 *
 * A Bun script rather than `psql -f`, so it runs anywhere the app runs — the
 * deployment image has no Postgres client. The server also applies the file on
 * boot whenever its hash has changed (server/services/ai-sql/apply-on-boot.ts);
 * this is the manual path. Idempotent: every view is dropped and recreated in
 * one transaction, so a failure leaves the previous schema in place.
 */

import pg from "pg";
import { aiSchemaSqlPath, applyAiSchema, readAiSchemaSql } from "./install";

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("[ai-views] DATABASE_URL is not set.");
    process.exit(1);
  }

  // Echo the target with credentials stripped, so a mis-pointed DATABASE_URL
  // is obvious before anything changes.
  console.log(`[ai-views] applying ${aiSchemaSqlPath()}`);
  console.log(`[ai-views] target   ${url.replace(/\/\/[^@]*@/, "//***@")}`);

  const { sql: sqlText, hash } = readAiSchemaSql();
  const client = new pg.Client({ connectionString: url, application_name: "amplify_ai_views_apply" });
  await client.connect();
  const started = Date.now();
  try {
    await applyAiSchema(client, sqlText, hash, (index, total, label, ms) => {
      if (ms === null) process.stdout.write(`[ai-views] ${index + 1}/${total} ${label} … `);
      else console.log(`${ms}ms`);
    });
    const { rows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'ai' WHERE c.relkind = 'v'",
    );
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'amplify_ai_readonly'");
    console.log(`[ai-views] done in ${Date.now() - started}ms — ${rows[0]?.n ?? 0} views`);
    if (role.rowCount === 0) {
      console.log(
        "[ai-views] note: the amplify_ai_readonly role does not exist here; AI analytics runs on the app\n" +
          "           connection (read-only transactions + guard). For a role-level boundary see\n" +
          "           server/db/aiViews/000_role.sql.example and AI_READONLY_DATABASE_URL.",
      );
    } else {
      console.log("[ai-views] amplify_ai_readonly exists and has been granted SELECT on the views.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[ai-views] failed: ${(err as Error).message}`);
  console.error("[ai-views] Nothing was changed — the build runs in one transaction.");
  process.exit(1);
});
