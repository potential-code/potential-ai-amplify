import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { newsletterSubscribers, users } from "../db/schema";
import { startTestServer, stopTestServer, api, createTestUser, cleanupFixtureUsers, newEmail, ORIGIN, RUN_DOMAIN, type TestUser } from "./helpers";

/**
 * State-changing /api calls must come from the site itself: Origin (or Referer
 * when Origin is missing) must be FRONTEND_URL's / BETTER_AUTH_URL's origin.
 * Better Auth, the Zoom webhook and operator-key requests are exempt.
 */

let learner: TestUser;
const emails: string[] = [];

beforeAll(async () => {
  await startTestServer();
  learner = await createTestUser("origin");
});

afterAll(async () => {
  for (const email of emails) await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.email, email));
  await cleanupFixtureUsers();
  await stopTestServer();
});

const subscribe = (headers: Record<string, string>) => {
  const email = newEmail();
  emails.push(email);
  return api("POST", "/api/newsletter/subscribe", { body: { email }, headers });
};

describe("origin check on state-changing API calls", () => {
  it("allows the site's own origin", async () => {
    expect((await subscribe({ Origin: ORIGIN })).status).toBe(201);
  });

  it("allows a same-site Referer when the browser sent no Origin", async () => {
    expect((await subscribe({ Origin: "", Referer: `${ORIGIN}/some/page?x=1` })).status).toBe(201);
  });

  it("refuses another site, a null origin, and requests with neither header", async () => {
    for (const headers of [
      { Origin: "https://evil.example" },
      { Origin: "null" },
      { Origin: `${ORIGIN}.evil.example` },
      { Origin: "", Referer: "https://evil.example/page" },
      { Origin: "" },
    ]) {
      const res = await subscribe(headers);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CROSS_SITE_REQUEST");
    }
  });

  it("refuses a cross-site write with a learner's cookie, and changes nothing", async () => {
    const res = await api("PUT", "/api/me/leaderboard-visibility", {
      token: learner.token,
      body: { show: false },
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    const ok = await api("PUT", "/api/me/leaderboard-visibility", { token: learner.token, body: { show: false } });
    expect(ok.status).toBe(200);
  });

  it("refuses PATCH and DELETE too, and leaves GET alone", async () => {
    expect((await api("PATCH", "/api/admin/organisations/x", { token: learner.token, headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await api("DELETE", "/api/media/x", { token: learner.token, headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await api("GET", "/api/health", { headers: { Origin: "https://evil.example" } })).status).toBe(200);
  });

  it("no longer parses HTML form posts", async () => {
    const email = newEmail();
    const res = await fetch(`${(await startTestServer())}/api/newsletter/subscribe`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email }).toString(),
    });
    expect(res.status).toBe(422);
  });
});

describe("exempt routes", () => {
  it("leaves Better Auth to its own origin check", async () => {
    // Better Auth answers (and refuses an untrusted origin itself), not this middleware.
    const res = await api("POST", "/api/auth/sign-in/email", {
      body: { email: learner.email, password: "wrong-password-123" },
      headers: { Origin: "https://evil.example" },
    });
    expect(res.body?.error?.code).not.toBe("CROSS_SITE_REQUEST");
    expect(res.status).toBe(403);
  });

  it("leaves the Zoom webhook to its signature check", async () => {
    const res = await api("POST", "/api/webhooks/zoom", { body: { event: "meeting.started" }, headers: { Origin: "" } });
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).not.toBe("CROSS_SITE_REQUEST");
  });

  describe("operator keys", () => {
    const key = `amplify_op_${crypto.randomBytes(32).toString("base64url")}`;
    const serviceEmail = `maya-origin-${crypto.randomUUID().slice(0, 8)}@${RUN_DOMAIN}`;
    const saved = { keys: process.env["OPERATOR_API_KEYS"], email: process.env["OPERATOR_SERVICE_USER_EMAIL"] };

    beforeAll(async () => {
      await db.insert(users).values({ fullName: "Maya (AI operator)", email: serviceEmail, role: "admin" });
      process.env["OPERATOR_API_KEYS"] = `maya-test:${crypto.createHash("sha256").update(key).digest("hex")}`;
      process.env["OPERATOR_SERVICE_USER_EMAIL"] = serviceEmail;
    });
    afterAll(async () => {
      await db.delete(users).where(eq(users.email, serviceEmail));
      for (const [name, value] of [["OPERATOR_API_KEYS", saved.keys], ["OPERATOR_SERVICE_USER_EMAIL", saved.email]] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });

    it("lets a Bearer-key request through without an Origin; the key decides", async () => {
      const good = await api("POST", "/api/lms/admin/courses", { headers: { Origin: "", Authorization: `Bearer ${key}` }, body: {} });
      expect(good.body?.error?.code).not.toBe("CROSS_SITE_REQUEST");
      expect(good.status).not.toBe(403);
      const bad = await api("POST", "/api/lms/admin/courses", { headers: { Origin: "", Authorization: "Bearer not-a-key" }, body: {} });
      expect(bad.status).toBe(401);
    });

    it("still checks the origin when the Bearer header can't be an operator key (account routes)", async () => {
      const res = await api("PUT", "/api/account/me", { token: learner.token, headers: { Origin: "https://evil.example", Authorization: `Bearer ${key}` }, body: {} });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CROSS_SITE_REQUEST");
    });
  });
});
