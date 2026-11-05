/**
 * AI analytics — the live `ai` schema: it compiles against the real tables,
 * it matches the catalogue, it exposes no personal data, and the catalogue
 * has the shape potential-ai's `sql-1.x` contract validates.
 *
 * Builds the schema itself (ensureAiSchema) rather than skipping when it is
 * missing, exactly as the server does at boot.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql as dsql } from "drizzle-orm";
import { db } from "../db";
import { ensureAiSchema } from "../services/ai-sql/apply-on-boot";
import {
  assertAiSchemaHasNoPii,
  buildSqlCatalog,
  catalogViewNames,
  liveAiColumns,
  PII_COLUMN_PATTERNS,
} from "../services/ai-sql/schema-catalog";
import { executeAiSql } from "../services/ai-sql/execute";
import { MAX_ROWS } from "../services/ai-sql/limits";
import { cleanupFixtureUsers, createTestUser, startTestServer, stopTestServer } from "./helpers";

beforeAll(async () => {
  await startTestServer();
  await ensureAiSchema(process.env["DATABASE_URL"]!);
  // At least one learner, so row-level checks have something to read.
  await createTestUser("ai-schema");
});

afterAll(async () => {
  await cleanupFixtureUsers();
  await stopTestServer();
});

describe("ai schema — installation", () => {
  test("a second apply is a no-op (the schema carries the file's hash)", async () => {
    expect(await ensureAiSchema(process.env["DATABASE_URL"]!)).toBe("up-to-date");
  });

  test("every view compiles and can be read against the real tables", async () => {
    for (const view of catalogViewNames()) {
      const { rows } = await db.execute(dsql.raw(`SELECT count(*)::int AS n FROM ai.${view}`));
      expect(typeof (rows[0] as { n: number }).n).toBe("number");
    }
  });
});

describe("ai schema — structure", () => {
  test("the catalogue lists exactly the live views", async () => {
    const live = [...new Set((await liveAiColumns()).map((c) => c.view))].sort();
    expect(live).toEqual([...catalogViewNames()].sort());
  });

  test("every catalogued column exists, and every live column is catalogued", async () => {
    const live = await liveAiColumns();
    for (const view of buildSqlCatalog().views) {
      const liveColumns = live.filter((c) => c.view === view.name).map((c) => c.column);
      expect({ view: view.name, columns: view.columns.map((c) => c.name) }).toEqual({
        view: view.name,
        columns: liveColumns,
      });
    }
  });

  test("learner-keyed views hold learners only (role = 'sme')", async () => {
    const live = await liveAiColumns();
    const keyed = [...new Set(live.filter((c) => c.column === "learner_id").map((c) => c.view))];
    expect(keyed.length).toBeGreaterThan(10);
    for (const view of keyed) {
      const { rows } = await db.execute(
        dsql.raw(`SELECT count(*)::int AS n FROM ai.${view} v JOIN users u ON u.id = v.learner_id WHERE u.role <> 'sme'`),
      );
      expect({ view, n: (rows[0] as { n: number }).n }).toEqual({ view, n: 0 });
    }
  });

  test("ISO country codes fold into names", async () => {
    const { rows } = await db.execute(
      dsql`SELECT ai.country_name('AE') AS a, ai.country_name(' uae ') AS b, ai.country_name('Nigeria') AS c, ai.country_name('') AS d`,
    );
    expect(rows[0]).toEqual({ a: "United Arab Emirates", b: "United Arab Emirates", c: "Nigeria", d: null });
  });
});

describe("ai schema — no personal data", () => {
  test("no live column name matches a PII pattern", async () => {
    await expect(assertAiSchemaHasNoPii()).resolves.toBeUndefined();
  });

  test("no explicitly banned column is exposed", async () => {
    const banned = [
      "email", "full_name", "name", "phone", "bio", "company", "avatar_url", "meeting_link", "recording_link",
      "linkedin_url", "mentor_notes", "notes", "transcript", "feedback", "scenario", "strengths", "improvements",
      "answers", "billing_first_name", "billing_last_name", "billing_email", "billing_phone", "billing_company",
      "billing_country", "billing_notes", "stripe_payment_intent_id", "password_hash", "token", "certificate_number",
      "certificate_url", "file_path", "passion", "hourly_rate", "representing", "website", "description", "cover",
      "image_url", "timezone",
    ];
    const found = (await liveAiColumns()).map((c) => c.column);
    expect(found.filter((c) => banned.includes(c))).toEqual([]);
  });

  test("the patterns do not false-positive on legitimate columns", () => {
    for (const column of ["learner_id", "has_recording", "questions_correct", "points_spent", "signed_up_with_invite", "featured"]) {
      expect({ column, flagged: PII_COLUMN_PATTERNS.some((p) => p.test(column)) }).toEqual({ column, flagged: false });
    }
  });

  test("no text value looks like an email, phone number or link, or is a person's name or email", async () => {
    const textColumns = (await liveAiColumns()).filter((c) => c.type === "text");
    expect(textColumns.length).toBeGreaterThan(10);
    for (const { view, column } of textColumns) {
      const { rows } = await db.execute(
        dsql.raw(`
          SELECT count(*)::int AS n FROM ai.${view} v
          WHERE v.${column} ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}'
             OR v.${column} ~* '(https?://|www\\.)'
             OR v.${column} ~ '\\+?[0-9][0-9 ()-]{7,}[0-9]'
             OR v.${column} IN (SELECT full_name FROM users UNION SELECT email FROM users
                               UNION SELECT name FROM mentor_registrations UNION SELECT email FROM mentor_registrations
                               UNION SELECT full_name FROM stakeholder_registrations)
        `),
      );
      expect({ view, column, n: (rows[0] as { n: number }).n }).toEqual({ view, column, n: 0 });
    }
  });
});

describe("ai executor", () => {
  test("caps rows and reports truncation", async () => {
    const result = await executeAiSql("SELECT l.learner_id, g FROM ai.learner l, generate_series(1, 600) g", catalogViewNames());
    expect(result.rowCount).toBe(MAX_ROWS);
    expect(result.truncated).toBe(true);
  });

  test("returns numbers for counts and text for dates", async () => {
    const result = await executeAiSql(
      "SELECT signup_month, count(*) AS learners FROM ai.learner GROUP BY signup_month ORDER BY signup_month",
      catalogViewNames(),
    );
    expect(result.columns).toEqual(["signup_month", "learners"]);
    expect(result.columnTypes).toEqual(["date", "bigint"]);
    expect(typeof result.rows[0]![1]).toBe("number");
    expect(String(result.rows[0]![0])).toMatch(/^\d{4}-\d{2}-01$/);
  });

  test("runs read-only: a write that reached the database would be refused", async () => {
    // The guard stops writes long before this; prove the transaction would too.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(dsql`SET TRANSACTION READ ONLY`);
        await tx.execute(dsql`UPDATE users SET points = points WHERE false`);
      }),
    ).rejects.toThrow();
  });
});

describe("catalogue — potential-ai sql-1.x contract", () => {
  const catalog = buildSqlCatalog();

  // Mirrors potential-ai src/graphs/shared/sqlCatalog.ts (parseSqlCatalog):
  // a supported major, a non-empty views list, string columns, positive
  // integer limits, and chart descriptors whose ids are declared chart types.
  test("version, dialect, schema and limits", () => {
    expect(catalog.version).toMatch(/^sql-1\.\d+\.\d+$/);
    expect(catalog.dialect).toBe("postgresql");
    expect(catalog.schema).toBe("ai");
    expect(typeof catalog.refreshedAt === "string" || catalog.refreshedAt === null).toBe(true);
    for (const value of Object.values(catalog.limits)) {
      expect(Number.isInteger(value) && value > 0).toBe(true);
    }
    expect(Object.keys(catalog.limits).sort()).toEqual(["maxQueriesPerTurn", "maxRows", "statementTimeoutMs"]);
  });

  test("views and columns", () => {
    expect(catalog.views.length).toBeGreaterThan(0);
    const names = new Set<string>();
    for (const view of catalog.views) {
      expect(view.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(names.has(view.name)).toBe(false);
      names.add(view.name);
      expect(view.grain.length).toBeGreaterThan(0);
      expect(view.description.length).toBeGreaterThan(0);
      expect(view.columns.length).toBeGreaterThan(0);
      for (const column of view.columns) {
        expect(column.name.length).toBeGreaterThan(0);
        expect(typeof column.type).toBe("string");
        expect(typeof column.description).toBe("string");
      }
    }
  });

  test("enums, notes and instructions are string lists", () => {
    for (const [name, values] of Object.entries(catalog.enums)) {
      expect({ name, ok: Array.isArray(values) && values.length > 0 && values.every((v) => typeof v === "string") }).toEqual({ name, ok: true });
    }
    expect(catalog.notes.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    expect(catalog.instructions.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
  });

  test("chart types and descriptors", () => {
    expect(catalog.chartTypes.length).toBeGreaterThan(0);
    for (const descriptor of catalog.chartDescriptors) {
      expect(catalog.chartTypes).toContain(descriptor.id);
      if (descriptor.minSeries !== undefined) expect(Number.isInteger(descriptor.minSeries) && descriptor.minSeries >= 0).toBe(true);
      if (descriptor.maxSeries !== undefined) expect(Number.isInteger(descriptor.maxSeries) && descriptor.maxSeries > 0).toBe(true);
    }
  });

  test("survives a JSON round trip (it is shipped to potential-ai as context)", () => {
    expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
  });

  test("chart types mirror the client renderer's list", () => {
    const client = path.join(__dirname, "..", "..", "client", "lib", "api", "adminAi.ts");
    if (!existsSync(client)) return;
    const source = readFileSync(client, "utf8");
    const block = /AI_CHART_TYPES\s*=\s*\[([\s\S]*?)\]/.exec(source)?.[1];
    if (!block) return;
    const clientTypes = [...block.matchAll(/'([a-z_]+)'|"([a-z_]+)"/g)].map((m) => m[1] ?? m[2]);
    expect(clientTypes).toEqual(catalog.chartTypes);
  });
});
