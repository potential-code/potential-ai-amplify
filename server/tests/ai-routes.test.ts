/**
 * AI analytics routes (/api/admin/ai/*): admin-only access, the query path
 * and its guard, report downloads, and saved dashboards.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { aiDashboards, users } from "../db/schema";
import { ensureAiSchema } from "../services/ai-sql/apply-on-boot";
import {
  api,
  cleanupFixtureUsers,
  createTestUser,
  ORIGIN,
  signIn,
  startTestServer,
  stopTestServer,
  type TestUser,
} from "./helpers";

let baseUrl: string;
let learner: TestUser;
let adminToken: string;
const createdBoards: string[] = [];

beforeAll(async () => {
  baseUrl = await startTestServer();
  await ensureAiSchema(process.env["DATABASE_URL"]!);
  learner = await createTestUser("ai-learner");
  const admin = await createTestUser("ai-admin");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
  adminToken = await signIn(admin.email, admin.password);
});

afterAll(async () => {
  for (const id of createdBoards) await db.delete(aiDashboards).where(eq(aiDashboards.id, id));
  await cleanupFixtureUsers();
  await stopTestServer();
});

type ErrorBody = { success: false; error: { message: string; code: string; errors?: string[] } };

describe("access", () => {
  test("anonymous callers get 401, learners 403", async () => {
    for (const [method, path] of [
      ["GET", "/api/admin/ai/catalog"],
      ["POST", "/api/admin/ai/query"],
      ["POST", "/api/admin/ai/report"],
      ["GET", "/api/admin/ai/dashboards"],
    ] as const) {
      const body = method === "POST" ? { sql: "SELECT count(*) FROM ai.learner" } : undefined;
      expect({ path, status: (await api(method, path, { body })).status }).toEqual({ path, status: 401 });
      expect({ path, status: (await api(method, path, { token: learner.token, body })).status }).toEqual({
        path,
        status: 403,
      });
    }
  });
});

describe("catalog and query", () => {
  test("admins get the sql-1.2.0 catalogue", async () => {
    const res = await api<{ success: true; data: { version: string; views: { name: string }[]; chartTypes: string[] } }>(
      "GET",
      "/api/admin/ai/catalog",
      { token: adminToken },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe("sql-1.2.0");
    expect(res.body.data.views.map((v) => v.name)).toContain("learner");
    expect(res.body.data.chartTypes).toContain("kpi");
  });

  test("a valid SELECT returns columns, types and rows", async () => {
    const res = await api<{
      success: true;
      data: { columns: string[]; columnTypes: string[]; rows: unknown[][]; rowCount: number; truncated: boolean; elapsedMs: number };
    }>("POST", "/api/admin/ai/query", {
      token: adminToken,
      body: { sql: "SELECT country, count(*) AS learners FROM ai.learner GROUP BY country ORDER BY learners DESC" },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.columns).toEqual(["country", "learners"]);
    expect(res.body.data.columnTypes).toEqual(["text", "bigint"]);
    expect(res.body.data.rowCount).toBeGreaterThan(0);
    expect(res.body.data.truncated).toBe(false);
    expect(typeof res.body.data.elapsedMs).toBe("number");
    expect(res.body.data.rows.some((row) => row[0] === "United Arab Emirates")).toBe(true);
  });

  test("a guard rejection is a 400 with the reasons", async () => {
    const res = await api<ErrorBody>("POST", "/api/admin/ai/query", {
      token: adminToken,
      body: { sql: "SELECT email FROM users" },
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("SQL_REJECTED");
    expect(res.body.error.message).toContain("users");
    expect(res.body.error.errors?.length).toBeGreaterThan(0);
  });

  test("a writing statement is rejected before it reaches the database", async () => {
    const res = await api<ErrorBody>("POST", "/api/admin/ai/query", {
      token: adminToken,
      body: { sql: "DELETE FROM ai.learner" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SQL_REJECTED");
  });

  test("a Postgres error is a 400 the agent can act on", async () => {
    const res = await api<ErrorBody>("POST", "/api/admin/ai/query", {
      token: adminToken,
      body: { sql: "SELECT no_such_column FROM ai.learner" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SQL_FAILED");
    expect(res.body.error.message).toContain("no_such_column");
  });

  test("a missing sql body is a validation error", async () => {
    const res = await api<ErrorBody>("POST", "/api/admin/ai/query", { token: adminToken, body: {} });
    expect(res.status).toBe(422);
  });
});

describe("report", () => {
  const spec = {
    title: "Learner activity",
    summary: "Most learners are in the **United Arab Emirates** (Figure 1).",
    sections: [
      {
        heading: "Where learners are",
        body: "- By country",
        figures: [
          {
            source: "programme",
            number: 1,
            title: "Learners by country",
            chart: "bar",
            sql: "SELECT country, count(*) AS learners FROM ai.learner GROUP BY country ORDER BY learners DESC",
          },
          {
            number: 2,
            title: "Journeys started",
            chart: "table",
            sql: "SELECT journey_type, count(*) AS journeys FROM ai.journey GROUP BY journey_type",
          },
        ],
      },
    ],
  };

  async function download(body: unknown, query = ""): Promise<Response> {
    return fetch(`${baseUrl}/api/admin/ai/report${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: adminToken },
      body: JSON.stringify(body),
    });
  }

  test("PDF", async () => {
    const res = await download({ ...spec, format: "pdf" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/filename="ai-amplify-report-\d{4}-\d{2}-\d{2}\.pdf"/);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  test("XLSX, with the format on the query string", async () => {
    const res = await download(spec, "?format=xlsx");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/filename="ai-amplify-report-\d{4}-\d{2}-\d{2}\.xlsx"/);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  test("a figure whose SQL the guard rejects fails the report with 400", async () => {
    const bad = structuredClone(spec);
    bad.sections[0]!.figures[0]!.sql = "SELECT email FROM users";
    const res = await download({ ...bad, format: "pdf" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe("SQL_REJECTED");
  });

  test("an unknown format is a validation error", async () => {
    expect((await download({ ...spec, format: "docx" })).status).toBe(422);
    expect((await download(spec, "?format=docx")).status).toBe(422);
  });
});

describe("dashboards", () => {
  const chart = {
    sql: "SELECT signup_month, count(*) AS learners FROM ai.learner GROUP BY 1 ORDER BY 1",
    chartType: "line",
    encoding: { x: "signup_month", y: "learners" },
    title: "Sign-ups per month",
  };

  type Board = { id: string; title: string; charts: unknown[]; createdBy: string | null };

  test("create, list, read, replace and delete a board", async () => {
    const created = await api<{ success: true; data: Board }>("POST", "/api/admin/ai/dashboards", {
      token: adminToken,
      body: { title: "Growth", charts: [chart] },
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    createdBoards.push(id);
    expect(created.body.data.charts).toEqual([chart]);
    expect(created.body.data.createdBy).not.toBeNull();

    const list = await api<{ success: true; data: Board[] }>("GET", "/api/admin/ai/dashboards", { token: adminToken });
    expect(list.status).toBe(200);
    expect(list.body.data.some((b) => b.id === id)).toBe(true);

    const one = await api<{ success: true; data: Board }>("GET", `/api/admin/ai/dashboards/${id}`, { token: adminToken });
    expect(one.status).toBe(200);
    expect(one.body.data.title).toBe("Growth");

    const kpi = { sql: "SELECT count(*) AS learners FROM ai.learner", chartType: "kpi", encoding: { y: "learners" } };
    const updated = await api<{ success: true; data: Board }>("PUT", `/api/admin/ai/dashboards/${id}`, {
      token: adminToken,
      body: { title: "Growth (v2)", charts: [chart, kpi] },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe("Growth (v2)");
    expect(updated.body.data.charts.length).toBe(2);

    const deleted = await api("DELETE", `/api/admin/ai/dashboards/${id}`, { token: adminToken });
    expect(deleted.status).toBe(200);
    expect((await api("GET", `/api/admin/ai/dashboards/${id}`, { token: adminToken })).status).toBe(404);
  });

  test("an invalid chart spec is refused and names the chart", async () => {
    const res = await api<ErrorBody>("POST", "/api/admin/ai/dashboards", {
      token: adminToken,
      body: { title: "Broken", charts: [chart, { sql: "SELECT 1", chartType: "radar", encoding: {} }] },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_CHART_SPEC");
    expect(res.body.error.message).toContain("charts[1]");
  });

  test("a missing title is a validation error; unknown and malformed ids are 404", async () => {
    expect((await api("POST", "/api/admin/ai/dashboards", { token: adminToken, body: { charts: [] } })).status).toBe(422);
    expect((await api("GET", `/api/admin/ai/dashboards/${crypto.randomUUID()}`, { token: adminToken })).status).toBe(404);
    expect((await api("GET", "/api/admin/ai/dashboards/not-a-uuid", { token: adminToken })).status).toBe(404);
    expect((await api("DELETE", "/api/admin/ai/dashboards/not-a-uuid", { token: adminToken })).status).toBe(404);
  });

  test("learners cannot read or write boards", async () => {
    expect((await api("POST", "/api/admin/ai/dashboards", { token: learner.token, body: { title: "x", charts: [] } })).status).toBe(403);
  });
});
