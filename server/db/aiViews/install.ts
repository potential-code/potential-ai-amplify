import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

/**
 * Builds the `ai` schema (001_ai_schema.sql). Shared by the CLI
 * (server/db/aiViews/apply.ts), the boot path
 * (server/services/ai-sql/apply-on-boot.ts) and the test suite.
 */

export const AI_SCHEMA_FILE = "001_ai_schema.sql";

/**
 * Where the SQL file lives. Under Bun (tests, scripts) `__dirname` is this
 * folder; in the esbuild bundle it is `dist/`, and the Docker image copies the
 * file to `db/aiViews/` next to it (see server/Dockerfile).
 */
export function aiSchemaSqlPath(): string {
  const candidates = [
    path.join(__dirname, AI_SCHEMA_FILE),
    path.join(__dirname, "..", "db", "aiViews", AI_SCHEMA_FILE),
    path.join(process.cwd(), "db", "aiViews", AI_SCHEMA_FILE),
    path.join(process.cwd(), "server", "db", "aiViews", AI_SCHEMA_FILE),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`[ai-views] ${AI_SCHEMA_FILE} not found (looked in ${candidates.join(", ")})`);
  }
  return found;
}

export function readAiSchemaSql(): { sql: string; hash: string } {
  const sql = readFileSync(aiSchemaSqlPath(), "utf8");
  return { sql, hash: createHash("sha256").update(sql).digest("hex") };
}

/**
 * Splits the file into statements on semicolons, while respecting the things a
 * naive split would break: single-quoted literals, dollar-quoted bodies (every
 * function body and DO block), and line/block comments.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i]!;
    const rest = sql.slice(i, i + 64);

    if (inLineComment) {
      buf += ch;
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (rest.startsWith("*/")) {
        buf += "/";
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }
    if (inSingle) {
      buf += ch;
      // '' is an escaped quote, not a terminator.
      if (ch === "'" && sql[i + 1] === "'") {
        buf += "'";
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }

    if (rest.startsWith("--")) {
      buf += "--";
      inLineComment = true;
      i += 2;
      continue;
    }
    if (rest.startsWith("/*")) {
      buf += "/*";
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      buf += ch;
      inSingle = true;
      i += 1;
      continue;
    }

    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      dollarTag = dollar[0];
      buf += dollarTag;
      i += dollarTag.length;
      continue;
    }

    if (ch === ";") {
      const trimmed = buf.trim();
      if (trimmed.length > 0) out.push(trimmed);
      buf = "";
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  // A chunk that is only comments (e.g. a trailing banner) is not a statement.
  return out.filter((statement) => statementLabel(statement) !== "");
}

/** A short label for progress output — the first meaningful line, truncated. */
export function statementLabel(statement: string): string {
  const firstCode = statement
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("--") && !l.startsWith("/*"));
  return (firstCode ?? "").replace(/\s+/g, " ").slice(0, 72);
}

/** The hash of the SQL file the `ai` schema was last built from, or null. */
export async function installedAiSchemaHash(client: pg.ClientBase): Promise<string | null> {
  const { rows } = await client.query<{ comment: string | null }>(
    "SELECT obj_description(oid, 'pg_namespace') AS comment FROM pg_namespace WHERE nspname = 'ai'",
  );
  const match = /^sha256:([0-9a-f]{64})$/.exec(rows[0]?.comment ?? "");
  return match ? match[1]! : null;
}

/**
 * Rebuilds the whole `ai` schema in one transaction — a failure part-way
 * leaves the previous schema in place — and stamps it with the file's hash.
 * Statement by statement, so a failure names the statement that failed.
 */
export async function applyAiSchema(
  client: pg.ClientBase,
  sqlText: string,
  hash: string,
  onStatement?: (index: number, total: number, label: string, ms: number | null) => void,
): Promise<void> {
  const statements = splitStatements(sqlText);
  await client.query("BEGIN");
  try {
    for (const [index, statement] of statements.entries()) {
      const label = statementLabel(statement);
      onStatement?.(index, statements.length, label, null);
      const at = Date.now();
      try {
        await client.query(statement);
      } catch (err) {
        throw new Error(`statement ${index + 1}/${statements.length} (${label}) failed: ${(err as Error).message}`, {
          cause: err,
        });
      }
      onStatement?.(index, statements.length, label, Date.now() - at);
    }
    await client.query(`COMMENT ON SCHEMA ai IS 'sha256:${hash}'`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}
