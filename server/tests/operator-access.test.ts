import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn } from "bun:test";
import crypto from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import { users, authVerifications, organisations, offers, announcements, liveEvents, inviteCodes } from "../db/schema";
import { parseOperatorKeys, matchOperatorKey } from "../auth/operatorKeys";
import {
  startTestServer,
  stopTestServer,
  api,
  createTestUser,
  createUser,
  cleanupFixtureUsers,
  signIn,
  rawHttp,
  ORIGIN,
  RUN_DOMAIN,
  type TestUser,
} from "./helpers";

/**
 * Operator keys (Maya, the AI operator): `Authorization: Bearer <key>` on
 * /api app routes authenticates as the service user named by
 * OPERATOR_SERVICE_USER_EMAIL, and reaches only auth/operatorScope.ts.
 * See docs/operator-access.md.
 */

let base: string;
let admin: TestUser;
let learner: TestUser;
let serviceUserId: string;
const serviceEmail = `maya-op-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`;

const newKey = () => `amplify_op_${crypto.randomBytes(32).toString("base64url")}`;
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const KEY = newKey();
const SECOND_KEY = newKey();

const savedEnv = {
  keys: process.env["OPERATOR_API_KEYS"],
  email: process.env["OPERATOR_SERVICE_USER_EMAIL"],
};

function restoreEnv(): void {
  for (const [name, value] of [["OPERATOR_API_KEYS", savedEnv.keys], ["OPERATOR_SERVICE_USER_EMAIL", savedEnv.email]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function enableKeys(): void {
  process.env["OPERATOR_API_KEYS"] = `maya-test:${sha256(KEY)}, maya-second:${sha256(SECOND_KEY)}`;
  process.env["OPERATOR_SERVICE_USER_EMAIL"] = serviceEmail;
}

/** A request with an Authorization header (and optionally a session cookie). */
async function call(method: string, path: string, opts: { authorization?: string; cookie?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...(opts.authorization ? { Authorization: opts.authorization } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body };
}

const asKey = (method: string, path: string, body?: unknown) => call(method, path, { authorization: `Bearer ${KEY}`, ...(body !== undefined ? { body } : {}) });
const asAdmin = (method: string, path: string, body?: unknown) => call(method, path, { cookie: admin.token, ...(body !== undefined ? { body } : {}) });
const idOf = (r: { body: unknown }) => (r.body as { data: { id: string } }).data.id;

/** Runs `fn` with console.warn silenced (refusals are logged), returning what was logged. */
async function quietly(fn: () => Promise<void>): Promise<string> {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    await fn();
    return warn.mock.calls.map((args) => args.join(" ")).join("\n");
  } finally {
    warn.mockRestore();
  }
}

beforeAll(async () => {
  base = await startTestServer();
  learner = await createTestUser("op-learner");
  admin = await createUser("admin", "E2E op-admin");
  const [row] = await db.insert(users).values({ fullName: "Maya (AI operator)", email: serviceEmail, role: "admin" }).returning({ id: users.id });
  serviceUserId = row!.id;
});

afterEach(() => {
  restoreEnv();
});

afterAll(async () => {
  restoreEnv();
  await cleanupFixtureUsers();
  await stopTestServer();
});

describe("operator key parsing", () => {
  it("reads label:sha256 entries separated by commas, spaces or new lines", () => {
    const a = sha256("a"),
      b = sha256("b");
    const keys = parseOperatorKeys(`maya-demo:${a},\n  maya.prod_2:${b.toUpperCase()}`);
    expect(keys.map((k) => k.label)).toEqual(["maya-demo", "maya.prod_2"]);
  });

  it("skips malformed entries (no label, short hash, raw key) instead of trusting them", () => {
    const keys = parseOperatorKeys(`:${sha256("a")}, nolabel, maya:abc123, maya:${"z".repeat(64)}, ok:${sha256("ok")}`);
    expect(keys.map((k) => k.label)).toEqual(["ok"]);
  });

  it("is empty for an unset or blank variable", () => {
    expect(parseOperatorKeys(undefined)).toEqual([]);
    expect(parseOperatorKeys("  ")).toEqual([]);
  });

  it("matches a raw key to its label by hash, and nothing else", () => {
    const keys = parseOperatorKeys(`first:${sha256("one")}, second:${sha256("two")}`);
    expect(matchOperatorKey("two", keys)).toBe("second");
    expect(matchOperatorKey("three", keys)).toBeNull();
    expect(matchOperatorKey("", keys)).toBeNull();
  });
});

describe("operator key authentication", () => {
  it("authenticates a valid key as the service user on an admin route", async () => {
    enableKeys();
    expect((await asKey("GET", "/api/admin/invites")).status).toBe(200);
  });

  it("accepts any of several configured keys", async () => {
    enableKeys();
    expect((await call("GET", "/api/admin/invites", { authorization: `Bearer ${SECOND_KEY}` })).status).toBe(200);
  });

  it("refuses a wrong key with 401, even alongside a valid admin session", async () => {
    enableKeys();
    expect((await call("GET", "/api/admin/invites", { authorization: `Bearer ${newKey()}` })).status).toBe(401);
    expect((await call("GET", "/api/admin/invites", { authorization: `Bearer ${newKey()}`, cookie: admin.token })).status).toBe(401);
    expect((await call("GET", "/api/admin/invites", { authorization: "Bearer " })).status).toBe(401);
  });

  it("ignores Bearer entirely when OPERATOR_API_KEYS is unset", async () => {
    delete process.env["OPERATOR_API_KEYS"];
    process.env["OPERATOR_SERVICE_USER_EMAIL"] = serviceEmail;
    // The key alone is not a sign-in…
    expect((await asKey("GET", "/api/admin/invites")).status).toBe(401);
    // …and a session cookie next to it works as before.
    expect((await call("GET", "/api/admin/invites", { authorization: `Bearer ${KEY}`, cookie: admin.token })).status).toBe(200);
  });

  it("leaves Basic credentials (the demo access gate) to the session cookie", async () => {
    enableKeys();
    const basic = `Basic ${Buffer.from("admin:pw").toString("base64")}`;
    expect((await call("GET", "/api/admin/invites", { authorization: basic, cookie: admin.token })).status).toBe(200);
    expect((await call("GET", "/api/admin/invites", { authorization: basic })).status).toBe(401);
  });

  it("cookie sign-in keeps working unchanged with keys configured", async () => {
    enableKeys();
    expect((await call("GET", "/api/admin/invites", { cookie: admin.token })).status).toBe(200);
    expect((await call("GET", "/api/admin/invites", { cookie: learner.token })).status).toBe(403);
  });

  it("is not accepted by the Better Auth routes", async () => {
    enableKeys();
    const res = await asKey("GET", "/api/auth/get-session");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("is not accepted on account routes (password, profile, tokens)", async () => {
    enableKeys();
    expect((await asKey("GET", "/api/account/me")).status).toBe(401);
    expect((await asKey("POST", "/api/account/set-password", { password: "new-pass-12345" })).status).toBe(401);
    expect((await asKey("GET", "/api/account/copilot-token")).status).toBe(401);
  });

  it("401s when the service user is missing", async () => {
    enableKeys();
    process.env["OPERATOR_SERVICE_USER_EMAIL"] = `missing-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`;
    expect((await asKey("GET", "/api/admin/invites")).status).toBe(401);
  });

  it("401s when OPERATOR_SERVICE_USER_EMAIL is unset", async () => {
    enableKeys();
    delete process.env["OPERATOR_SERVICE_USER_EMAIL"];
    expect((await asKey("GET", "/api/admin/invites")).status).toBe(401);
  });

  it("401s when the service user is not an admin", async () => {
    enableKeys();
    await db.update(users).set({ role: "sme" }).where(eq(users.id, serviceUserId));
    try {
      expect((await asKey("GET", "/api/admin/invites")).status).toBe(401);
      // Not even on a route any signed-in learner may use.
      expect((await asKey("GET", "/api/me/streak")).status).toBe(401);
    } finally {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, serviceUserId));
    }
  });
});

describe("the service account cannot hold a browser session", () => {
  const strip = (r: { status: number; body: unknown }) => ({ status: r.status, body: r.body });

  it("refuses password sign-in for the service email with the same status and body as a wrong password", async () => {
    const svc = await createTestUser("op-svc-signin");
    process.env["OPERATOR_SERVICE_USER_EMAIL"] = svc.email;
    // Even with the right password (in case the account ever had one).
    const refused = await api("POST", "/api/auth/sign-in/email", { body: { email: svc.email, password: svc.password } });
    const wrong = await api("POST", "/api/auth/sign-in/email", { body: { email: learner.email, password: "not-the-password-1" } });
    expect(wrong.status).toBe(401);
    expect(strip(refused)).toEqual(strip(wrong));
    expect(refused.setCookie.filter((c) => /session_token=[^;]/.test(c))).toEqual([]);
  });

  it("sends no sign-in code to the service email, answering as for an unknown address", async () => {
    const svc = await createTestUser("op-svc-otp");
    process.env["OPERATOR_SERVICE_USER_EMAIL"] = svc.email;
    const refused = await api("POST", "/api/auth/email-otp/send-verification-otp", { body: { email: svc.email, type: "sign-in" } });
    const unknown = await api("POST", "/api/auth/email-otp/send-verification-otp", {
      body: { email: `nobody-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`, type: "sign-in" },
    });
    expect(strip(refused)).toEqual(strip(unknown));
    expect(await db.select().from(authVerifications).where(like(authVerifications.identifier, `%${svc.email}%`))).toHaveLength(0);
  });

  it("refuses code sign-in for the service email with the same status and body as a wrong code", async () => {
    const svc = await createTestUser("op-svc-code");
    process.env["OPERATOR_SERVICE_USER_EMAIL"] = svc.email;
    const refused = await api("POST", "/api/auth/sign-in/email-otp", { body: { email: svc.email, otp: "123456" } });
    const wrong = await api("POST", "/api/auth/sign-in/email-otp", { body: { email: learner.email, otp: "123456" } });
    expect(wrong.status).toBe(400);
    expect(strip(refused)).toEqual(strip(wrong));
  });

  it("refuses an existing session cookie of the service user", async () => {
    const svc = await createUser("admin", "E2E op-svc-cookie");
    expect((await call("GET", "/api/admin/invites", { cookie: svc.token })).status).toBe(200);
    process.env["OPERATOR_SERVICE_USER_EMAIL"] = svc.email;
    expect((await call("GET", "/api/admin/invites", { cookie: svc.token })).status).toBe(401);
  });
});

describe("the service account is refused by name too, not only by OPERATOR_SERVICE_USER_EMAIL", () => {
  // If the variable is unset (feature turned off, or a deploy that forgot
  // it), the account the create script made must still be unable to sign in.
  const strip = (r: { status: number; body: unknown }) => ({ status: r.status, body: r.body });

  /** A fixture user renamed to the operator name, with the variable unset. */
  async function namedOperator(prefix: string, name = "Maya (AI operator)") {
    const svc = await createTestUser(prefix);
    await db.update(users).set({ fullName: name }).where(eq(users.id, svc.id));
    delete process.env["OPERATOR_SERVICE_USER_EMAIL"];
    return svc;
  }

  it("refuses password sign-in with the same status and body as a wrong password", async () => {
    const svc = await namedOperator("op-name-signin");
    const refused = await api("POST", "/api/auth/sign-in/email", { body: { email: svc.email, password: svc.password } });
    const wrong = await api("POST", "/api/auth/sign-in/email", { body: { email: learner.email, password: "not-the-password-1" } });
    expect(wrong.status).toBe(401);
    expect(strip(refused)).toEqual(strip(wrong));
    expect(refused.setCookie.filter((c) => /session_token=[^;]/.test(c))).toEqual([]);
  });

  it("sends no sign-in code, answering as for an unknown address", async () => {
    const svc = await namedOperator("op-name-otp");
    const refused = await api("POST", "/api/auth/email-otp/send-verification-otp", { body: { email: svc.email, type: "sign-in" } });
    const unknown = await api("POST", "/api/auth/email-otp/send-verification-otp", {
      body: { email: `nobody-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`, type: "sign-in" },
    });
    expect(strip(refused)).toEqual(strip(unknown));
    expect(await db.select().from(authVerifications).where(like(authVerifications.identifier, `%${svc.email}%`))).toHaveLength(0);
  });

  it("refuses code sign-in with the same status and body as a wrong code", async () => {
    const svc = await namedOperator("op-name-code");
    const refused = await api("POST", "/api/auth/sign-in/email-otp", { body: { email: svc.email, otp: "123456" } });
    const wrong = await api("POST", "/api/auth/sign-in/email-otp", { body: { email: learner.email, otp: "123456" } });
    expect(wrong.status).toBe(400);
    expect(strip(refused)).toEqual(strip(wrong));
  });

  it("matches the name whatever its case or surrounding spaces, and the address whatever its case", async () => {
    const svc = await namedOperator("op-name-case", "  maya (AI OPERATOR) ");
    const refused = await api("POST", "/api/auth/sign-in/email", { body: { email: svc.email.toUpperCase(), password: svc.password } });
    expect(refused.status).toBe(401);
    expect(refused.setCookie.filter((c) => /session_token=[^;]/.test(c))).toEqual([]);
  });

  it("refuses an existing session of an account carrying the operator name", async () => {
    const svc = await createUser("admin", "E2E op-name-cookie");
    // The session as stored in the database (no 5-minute cookie cache).
    const cookie = (await signIn(svc.email, svc.password))
      .split("; ")
      .filter((c) => !c.includes("session_data"))
      .join("; ");
    expect((await call("GET", "/api/admin/invites", { cookie })).status).toBe(200);
    delete process.env["OPERATOR_SERVICE_USER_EMAIL"];
    await db.update(users).set({ fullName: "Maya (AI operator)" }).where(eq(users.id, svc.id));
    expect((await call("GET", "/api/admin/invites", { cookie })).status).toBe(401);
  });

  it("leaves other people alone, including names that merely mention Maya", async () => {
    const person = await namedOperator("op-name-person", "Maya Operator");
    const res = await api("POST", "/api/auth/sign-in/email", { body: { email: person.email, password: person.password } });
    expect(res.status).toBe(200);
  });

  it("uses the same name as the create script", async () => {
    const { OPERATOR_SERVICE_NAME } = await import("../auth/operatorKeys");
    const script = await Bun.file(new URL("../scripts/create-operator-user.mjs", import.meta.url)).text();
    expect(script).toContain(`const NAME = '${OPERATOR_SERVICE_NAME}'`);
  });
});

describe("absolute-form request lines", () => {
  it('cannot slip a key past the account-route refusal with "POST http://host/api/account/…"', async () => {
    enableKeys();
    const res = await rawHttp("http://x/api/account/set-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN },
      body: { password: "operator-pass-12345", confirm: "operator-pass-12345" },
    });
    expect(res.status).toBe(401);
    const me = await rawHttp("http://x/api/account/me", { headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN } });
    expect(me.status).toBe(401);
  });

  it("still serves an allowed admin route in absolute form", async () => {
    enableKeys();
    const res = await rawHttp("http://x/api/admin/invites", { headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN } });
    expect(res.status).toBe(200);
  });

  it("cannot reach an excluded route in absolute form", async () => {
    enableKeys();
    await quietly(async () => {
      const res = await rawHttp("http://x/api/admin/invites", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN }, body: {} });
      expect(res.status).toBe(403);
    });
  });
});

describe("operator key scope (auth/operatorScope.ts)", () => {
  it("lets a key reach the routes the operator MCP uses", async () => {
    enableKeys();
    for (const path of [
      "/api/admin/stats",
      "/api/admin/organisations",
      "/api/admin/offers",
      "/api/admin/announcements",
      "/api/live-events/admin",
      "/api/lms/admin/courses",
      "/api/admin/mentor-applications",
      "/api/admin/ai-reports",
    ]) {
      expect([path, (await asKey("GET", path)).status]).toEqual([path, 200]);
    }
  });

  it("refuses a bulk export with a key (403) while a cookie admin still gets it", async () => {
    enableKeys();
    const logged = await quietly(async () => {
      const viaKey = await fetch(`${base}/api/admin/exports/learners?format=csv`, { headers: { Origin: ORIGIN, Authorization: `Bearer ${KEY}` } });
      expect(viaKey.status).toBe(403);
      expect(((await viaKey.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    });
    expect(logged).toContain("GET /api/admin/exports/learners");
    expect(logged).not.toContain("format=csv");
    const viaCookie = await fetch(`${base}/api/admin/exports/learners?format=csv`, { headers: { Origin: ORIGIN, Cookie: admin.token } });
    expect(viaCookie.status).toBe(200);
    await viaCookie.arrayBuffer();
  });

  it("names the route shape in the warning, never ids or emails from the path", async () => {
    enableKeys();
    const orgId = crypto.randomUUID();
    const logged = await quietly(async () => {
      expect((await asKey("GET", `/api/admin/organisations/${orgId}/exports/learners`)).status).toBe(403);
    });
    expect(logged).toContain("GET /api/admin/organisations/:param/exports/learners");
    expect(logged).not.toContain(orgId);
  });

  it("refuses AI report downloads and AI generation", async () => {
    enableKeys();
    await quietly(async () => {
      expect((await asKey("POST", "/api/admin/ai/report", {})).status).toBe(403);
      expect((await asKey("POST", "/api/lms/admin/quiz/generate", {})).status).toBe(403);
    });
  });

  it("refuses learner routes with a key", async () => {
    enableKeys();
    await quietly(async () => {
      expect((await asKey("GET", "/api/me/streak")).status).toBe(403);
    });
  });

  it("refuses paths that routing and the allowlist could read differently", async () => {
    enableKeys();
    await quietly(async () => {
      // Dot segments and encoded separators: the allowlist would see /api/admin/stats.
      for (const target of [
        "/api/admin/exports/learners%5C..%5C..%5Cstats",
        "/api/admin/exports/learners/../../stats",
        "/api/admin/exports/%2e%2e/stats",
      ]) {
        const res = await rawHttp(target, { headers: { Authorization: `Bearer ${KEY}`, Origin: ORIGIN } });
        expect([target, res.status]).not.toEqual([target, 200]);
        expect([401, 403, 404]).toContain(res.status!);
      }
    });
  });
});

describe("a key can never hand out a login (partner invites, mentor approvals)", () => {
  it("refuses the partner invite with a key; an admin session still invites; the key's partner list hides setup links", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/organisations", { name: "Operator Partner Org", type: "other" });
    expect(created.status).toBe(201);
    const orgId = idOf(created);
    try {
      const email = `op-partner-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`;
      await quietly(async () => {
        const viaKey = await asKey("POST", `/api/admin/organisations/${orgId}/partners`, { fullName: "Op Partner", email });
        expect(viaKey.status).toBe(403);
        expect(JSON.stringify(viaKey.body)).not.toMatch(/setupLink|token=/);
      });

      // An admin in the browser invites, and gets the link to copy.
      const viaCookie = await asAdmin("POST", `/api/admin/organisations/${orgId}/partners`, { fullName: "Op Partner", email });
      expect(viaCookie.status).toBe(201);
      expect(JSON.stringify(viaCookie.body)).toContain("token=");
      expect(JSON.stringify((await asAdmin("GET", `/api/admin/organisations/${orgId}/partners`)).body)).toContain("token=");

      // The key can still list partners, without the live setup link.
      const listed = await asKey("GET", `/api/admin/organisations/${orgId}/partners`);
      expect(listed.status).toBe(200);
      const contacts = (listed.body as { data: Array<{ id: string; email: string; status: string }> }).data;
      expect(contacts.map((c) => c.email)).toContain(email);
      expect(JSON.stringify(listed.body)).not.toMatch(/setupLink|token=/);

      // Cancelling the invite is an organisation write: the Lead's (AI Amplify).
      const pending = contacts.find((c) => c.email === email && c.status === "invited");
      expect(pending).toBeDefined();
      await quietly(async () => {
        expect((await asKey("DELETE", `/api/admin/organisations/${orgId}/invites/${pending!.id}`)).status).toBe(403);
      });
      expect((await asAdmin("DELETE", `/api/admin/organisations/${orgId}/invites/${pending!.id}`)).status).toBe(200);
    } finally {
      await db.delete(organisations).where(eq(organisations.id, orgId));
    }
  });

  it("refuses mentor application approve and reject with a key; an admin session still reaches them", async () => {
    enableKeys();
    await quietly(async () => {
      const id = crypto.randomUUID();
      for (const action of ["approve", "reject"]) {
        const path = `/api/admin/mentor-applications/${id}/${action}`;
        expect([action, (await asKey("POST", path, {})).status]).toEqual([action, 403]);
        // The admin session gets past the scope check to the handler (no such application).
        expect([action, (await asAdmin("POST", path, {})).status]).toEqual([action, 404]);
      }
    });
    // Reading the applications is still allowed.
    expect((await asKey("GET", "/api/admin/mentor-applications")).status).toBe(200);
  });
});

// ── AI Amplify exclusions ────────────────────────────────────────────────────
// A paid, invite-only programme with learner messages off until the client
// signs off: a key sends nothing to learners, changes no price or payment
// record, and writes no invite code or organisation. Each refusal is checked
// next to an admin session doing the same thing successfully.

describe("AI Amplify: a key sends nothing to learners", () => {
  it("refuses sending an announcement; an admin session sends it; the key can still read and archive", async () => {
    enableKeys();
    const body = { title: "Operator scope check", body: "Mentors only, banner only.", audience: "mentors", showBanner: true, notify: false, email: false };
    await quietly(async () => {
      const viaKey = await asKey("POST", "/api/admin/announcements", body);
      expect(viaKey.status).toBe(403);
      expect((viaKey.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    });
    const viaCookie = await asAdmin("POST", "/api/admin/announcements", body);
    expect(viaCookie.status).toBe(201);
    const id = idOf(viaCookie);
    try {
      expect((await asKey("GET", "/api/admin/announcements")).status).toBe(200);
      expect((await asKey("GET", "/api/admin/announcements/audience?audience=learners")).status).toBe(200);
      expect((await asKey("POST", `/api/admin/announcements/${id}/archive`, {})).status).toBe(200);
    } finally {
      await db.delete(announcements).where(eq(announcements.id, id));
    }
  });

  it("refuses live event create, edit and delete; an admin session does all three; the key can still read and see bookings", async () => {
    enableKeys();
    const startsAt = new Date(Date.now() + 72 * 3600_000).toISOString();
    const body = { title: "Operator scope event", startsAt, format: "link", meetingLink: "https://example.com/meet", status: "draft" };
    await quietly(async () => {
      expect((await asKey("POST", "/api/live-events", body)).status).toBe(403);
    });
    const created = await asAdmin("POST", "/api/live-events", body);
    expect(created.status).toBe(201);
    const id = idOf(created);
    try {
      await quietly(async () => {
        expect((await asKey("PATCH", `/api/live-events/${id}`, { status: "published" })).status).toBe(403);
        expect((await asKey("PATCH", `/api/live-events/${id}`, { title: "Renamed by key" })).status).toBe(403);
        expect((await asKey("DELETE", `/api/live-events/${id}`)).status).toBe(403);
      });
      expect((await asKey("GET", "/api/live-events/admin")).status).toBe(200);
      expect((await asKey("GET", `/api/live-events/${id}/bookings`)).status).toBe(200);
      expect((await asAdmin("PATCH", `/api/live-events/${id}`, { title: "Renamed by admin" })).status).toBe(200);
      expect((await asAdmin("DELETE", `/api/live-events/${id}`)).status).toBe(200);
    } finally {
      await db.delete(liveEvents).where(eq(liveEvents.id, id));
    }
  });

  it("refuses adding learners to an organisation (it tells them), whatever the learner-messages switch says", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/organisations", { name: "Operator Learners Org", type: "other" });
    const orgId = idOf(created);
    const saved = process.env["LEARNER_NOTIFICATIONS_ENABLED"];
    try {
      process.env["LEARNER_NOTIFICATIONS_ENABLED"] = "true";
      await quietly(async () => {
        expect((await asKey("POST", `/api/admin/organisations/${orgId}/learners`, { emails: [learner.email] })).status).toBe(403);
        // The scope is fixed: switching learner messages on opens nothing for a key.
        expect((await asKey("POST", "/api/admin/announcements", {})).status).toBe(403);
      });
      const viaCookie = await asAdmin("POST", `/api/admin/organisations/${orgId}/learners`, { emails: [learner.email] });
      expect(viaCookie.status).toBe(200);
      expect((viaCookie.body as { data: { added: string[] } }).data.added).toEqual([learner.email.toLowerCase()]);
    } finally {
      if (saved === undefined) delete process.env["LEARNER_NOTIFICATIONS_ENABLED"];
      else process.env["LEARNER_NOTIFICATIONS_ENABLED"] = saved;
      await db.update(users).set({ organisationId: null }).where(eq(users.id, learner.id));
      await db.delete(organisations).where(eq(organisations.id, orgId));
    }
  });
});

describe("AI Amplify: a key never changes a price or a payment record", () => {
  const offerBody = { title: "Operator scope offer", category: "AI", priceLabel: "$25", price: 2500, pointsCost: 100, status: "draft" };

  it("refuses creating an offer (it sets a price); an admin session creates it", async () => {
    enableKeys();
    const logged = await quietly(async () => {
      expect((await asKey("POST", "/api/admin/offers", offerBody)).status).toBe(403);
    });
    expect(logged).toContain("POST /api/admin/offers");
    const created = await asAdmin("POST", "/api/admin/offers", offerBody);
    expect(created.status).toBe(201);
    await db.delete(offers).where(eq(offers.id, idOf(created)));
  });

  it("lets a key edit an offer's title, but refuses every price field and publishing; an admin session changes the price", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/offers", offerBody);
    const id = idOf(created);
    try {
      expect((await asKey("PATCH", `/api/admin/offers/${id}`, { title: "Renamed by Maya", category: "Marketing" })).status).toBe(200);
      const logged = await quietly(async () => {
        for (const change of [
          { price: 0 },
          { priceLabel: "Free" },
          { priceBefore: "$50" },
          { pointsCost: 0 },
          { title: "Sneaky", price: 1 },
          { PRICE: 1 },
          // Publishing puts a paid offer on sale (Stripe checkout opens).
          { title: "Renamed again", status: "published" },
          { status: "published" },
          { Status: "published" },
          { STATUS: "published" },
        ]) {
          const res = await asKey("PATCH", `/api/admin/offers/${id}`, change);
          expect([change, res.status]).toEqual([change, 403]);
          expect((res.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
        }
      });
      expect(logged).toContain("PATCH /api/admin/offers/:param");
      expect(logged).toContain("status (status)");
      expect(logged).not.toContain(id);
      const [unchanged] = await db.select().from(offers).where(eq(offers.id, id));
      expect(unchanged!).toMatchObject({ title: "Renamed by Maya", category: "Marketing", status: "draft", price: 2500, priceLabel: "$25", pointsCost: 100 });

      const viaCookie = await asAdmin("PATCH", `/api/admin/offers/${id}`, { price: 0, priceLabel: "Free", pointsCost: 0, status: "published" });
      expect(viaCookie.status).toBe(200);
      const [changed] = await db.select().from(offers).where(eq(offers.id, id));
      expect(changed!).toMatchObject({ price: 0, priceLabel: "Free", pointsCost: 0, status: "published" });
    } finally {
      await db.delete(offers).where(eq(offers.id, id));
    }
  });

  it("refuses unpublishing an offer with a key (it takes it off sale); an admin session unpublishes it", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/offers", { ...offerBody, status: "published" });
    const id = idOf(created);
    try {
      await quietly(async () => {
        const res = await asKey("PATCH", `/api/admin/offers/${id}`, { status: "draft" });
        expect(res.status).toBe(403);
        expect((res.body as { error: { message: string } }).error.message).toMatch(/publish/);
      });
      const [still] = await db.select().from(offers).where(eq(offers.id, id));
      expect(still!.status).toBe("published");
      expect((await asAdmin("PATCH", `/api/admin/offers/${id}`, { status: "draft" })).status).toBe(200);
      const [after] = await db.select().from(offers).where(eq(offers.id, id));
      expect(after!.status).toBe("draft");
    } finally {
      await db.delete(offers).where(eq(offers.id, id));
    }
  });

  it("refuses deleting an offer (its redemptions go with it); an admin session deletes it", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/offers", offerBody);
    const id = idOf(created);
    try {
      await quietly(async () => {
        expect((await asKey("DELETE", `/api/admin/offers/${id}`)).status).toBe(403);
      });
      expect(await db.select().from(offers).where(eq(offers.id, id))).toHaveLength(1);
      expect((await asAdmin("DELETE", `/api/admin/offers/${id}`)).status).toBe(200);
    } finally {
      await db.delete(offers).where(eq(offers.id, id));
    }
  });

  it("refuses the checkout routes (learner-only anyway)", async () => {
    enableKeys();
    const id = crypto.randomUUID();
    await quietly(async () => {
      expect((await asKey("POST", `/api/offers/${id}/payment-intent`, {})).status).toBe(403);
      expect((await asKey("POST", `/api/offers/${id}/complete`, {})).status).toBe(403);
    });
  });
});

describe("AI Amplify: a key writes no invite code or organisation (Maya asks her Lead)", () => {
  it("refuses creating an invite code; an admin session creates one; the key can still list them", async () => {
    enableKeys();
    await quietly(async () => {
      expect((await asKey("POST", "/api/admin/invites", {})).status).toBe(403);
    });
    const viaCookie = await asAdmin("POST", "/api/admin/invites", {});
    expect(viaCookie.status).toBe(201);
    const code = (viaCookie.body as { data: { code: string } }).data.code;
    try {
      const listed = await asKey("GET", "/api/admin/invites");
      expect(listed.status).toBe(200);
      expect((listed.body as { data: Array<{ status: string }> }).data.some((i) => i.status === "active")).toBe(true);
    } finally {
      await db.delete(inviteCodes).where(eq(inviteCodes.code, code));
    }
  });
  it("refuses every organisation write; an admin session makes each one; the key can still read", async () => {
    enableKeys();
    await quietly(async () => {
      expect((await asKey("POST", "/api/admin/organisations", { name: "Key Org", type: "other" })).status).toBe(403);
    });
    const created = await asAdmin("POST", "/api/admin/organisations", { name: "Operator Org Writes", type: "other" });
    expect(created.status).toBe(201);
    const orgId = idOf(created);
    try {
      const someone = crypto.randomUUID();
      await quietly(async () => {
        expect((await asKey("PATCH", `/api/admin/organisations/${orgId}`, { name: "Renamed by key" })).status).toBe(403);
        expect((await asKey("PATCH", `/api/admin/organisations/${orgId}`, { joinEnabled: false })).status).toBe(403);
        expect((await asKey("POST", `/api/admin/organisations/${orgId}/join-code`, {})).status).toBe(403);
        expect((await asKey("DELETE", `/api/admin/organisations/${orgId}/learners/${someone}`)).status).toBe(403);
        expect((await asKey("DELETE", `/api/admin/organisations/${orgId}/partners/${someone}`)).status).toBe(403);
        expect((await asKey("DELETE", `/api/admin/organisations/${orgId}/invites/${someone}`)).status).toBe(403);
        expect((await asKey("DELETE", `/api/admin/organisations/${orgId}`)).status).toBe(403);
      });
      const [untouched] = await db.select().from(organisations).where(eq(organisations.id, orgId));
      expect(untouched!.name).toBe("Operator Org Writes");

      // Reads stay open to the key.
      expect((await asKey("GET", "/api/admin/organisations")).status).toBe(200);
      expect((await asKey("GET", `/api/admin/organisations/${orgId}/dashboard`)).status).toBe(200);
      expect((await asKey("GET", `/api/admin/organisations/${orgId}/partners`)).status).toBe(200);

      // An admin in the browser can do each of them.
      expect((await asAdmin("PATCH", `/api/admin/organisations/${orgId}`, { name: "Renamed by admin" })).status).toBe(200);
      expect((await asAdmin("POST", `/api/admin/organisations/${orgId}/join-code`, {})).status).toBe(200);
      expect((await asAdmin("DELETE", `/api/admin/organisations/${orgId}`)).status).toBe(200);
    } finally {
      await db.delete(organisations).where(inArray(organisations.id, [orgId]));
    }
  });
});

describe("AI Amplify: a key never sees a live invite or sign-up code (the code is the login)", () => {
  it("lists invites without codes or links for a key, with status, dates and counts; an admin session sees the codes", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/invites", {});
    expect(created.status).toBe(201);
    const { id, code } = (created.body as { data: { id: string; code: string } }).data;
    try {
      const viaKey = await asKey("GET", "/api/admin/invites");
      expect(viaKey.status).toBe(200);
      const keyRows = (viaKey.body as { data: Array<Record<string, unknown>> }).data;
      const mine = keyRows.find((i) => i["id"] === id);
      expect(mine).toMatchObject({ id, status: "active", usedBy: null, codeHidden: true });
      expect(mine!["createdAt"]).toBeTruthy();
      for (const row of keyRows) {
        expect(row).not.toHaveProperty("code");
        expect(row).not.toHaveProperty("inviteLink");
      }
      expect(JSON.stringify(viaKey.body)).not.toContain(code);
      expect(JSON.stringify(viaKey.body)).not.toMatch(/sign-up\?code=|AMPLIFY-[A-Z0-9]{6,}/);

      const viaCookie = await asAdmin("GET", "/api/admin/invites");
      const adminRows = (viaCookie.body as { data: Array<{ id: string; code: string; inviteLink: string }> }).data;
      expect(adminRows.length).toBe(keyRows.length);
      expect(adminRows.find((i) => i.id === id)).toMatchObject({ code, inviteLink: expect.stringContaining(`code=${code}`) });
    } finally {
      await db.delete(inviteCodes).where(eq(inviteCodes.id, id));
    }
  });

  it("gives a key the needs-attention panel with unused invites counted but their codes left out; an admin session sees the codes", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/invites", {});
    const code = (created.body as { data: { code: string } }).data.code;
    try {
      type Panel = { data: { unusedInviteCodes: Array<Record<string, unknown>> } };
      const viaKey = await asKey("GET", "/api/admin/needs-attention");
      expect(viaKey.status).toBe(200);
      const keyUnused = (viaKey.body as Panel).data.unusedInviteCodes;
      expect(keyUnused.length).toBeGreaterThan(0);
      for (const row of keyUnused) {
        expect(row).not.toHaveProperty("code");
        expect(row).toMatchObject({ codeHidden: true });
        expect(row["createdAt"]).toBeTruthy();
      }
      expect(JSON.stringify(viaKey.body)).not.toMatch(/AMPLIFY-[A-Z0-9]{6,}/);

      const viaCookie = await asAdmin("GET", "/api/admin/needs-attention");
      const adminUnused = (viaCookie.body as Panel).data.unusedInviteCodes;
      expect(adminUnused.length).toBe(keyUnused.length);
      for (const row of adminUnused) expect(typeof row["code"]).toBe("string");
    } finally {
      await db.delete(inviteCodes).where(eq(inviteCodes.code, code));
    }
  });

  it("gives a key organisations and a dashboard without join codes or sign-up links; an admin session sees them", async () => {
    enableKeys();
    const created = await asAdmin("POST", "/api/admin/organisations", { name: "Operator Join Code Org", type: "other" });
    expect(created.status).toBe(201);
    const orgId = idOf(created);
    try {
      const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
      const joinCode = org!.joinCode;

      const list = await asKey("GET", "/api/admin/organisations");
      expect(list.status).toBe(200);
      const rows = (list.body as { data: Array<Record<string, unknown>> }).data;
      expect(rows.find((o) => o["id"] === orgId)).toMatchObject({ name: "Operator Join Code Org", joinEnabled: true, learners: 0, joinCodeHidden: true });
      for (const row of rows) {
        expect(row).not.toHaveProperty("joinCode");
        expect(row).not.toHaveProperty("joinLink");
      }
      expect(JSON.stringify(list.body)).not.toContain(joinCode);
      expect(JSON.stringify(list.body)).not.toMatch(/sign-up\?org=/);

      const board = await asKey("GET", `/api/admin/organisations/${orgId}/dashboard`);
      expect(board.status).toBe(200);
      const organisation = (board.body as { data: { organisation: Record<string, unknown>; kpis: unknown } }).data.organisation;
      expect(organisation).toMatchObject({ id: orgId, name: "Operator Join Code Org", joinEnabled: true, joinCodeHidden: true });
      expect(organisation).not.toHaveProperty("joinCode");
      expect(organisation).not.toHaveProperty("joinLink");
      expect((board.body as { data: { kpis: unknown } }).data.kpis).toBeDefined();
      expect(JSON.stringify(board.body)).not.toContain(joinCode);

      // An admin in the browser still gets the code and link to share.
      const adminList = await asAdmin("GET", "/api/admin/organisations");
      expect((adminList.body as { data: Array<Record<string, unknown>> }).data.find((o) => o["id"] === orgId)).toMatchObject({
        joinCode,
        joinLink: expect.stringContaining(`org=${joinCode}`),
      });
      const adminBoard = await asAdmin("GET", `/api/admin/organisations/${orgId}/dashboard`);
      expect((adminBoard.body as { data: { organisation: Record<string, unknown> } }).data.organisation).toMatchObject({ joinCode });
    } finally {
      await db.delete(organisations).where(eq(organisations.id, orgId));
    }
  });
});
