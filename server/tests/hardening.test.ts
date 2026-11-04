import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { like } from "drizzle-orm";
import { db } from "../db";
import { stakeholderRegistrations } from "../db/schema";
import { startTestServer, api, cleanup, createUser, newEmail } from "./helpers";

beforeAll(async () => {
  await startTestServer();
});
afterAll(async () => {
  await db.delete(stakeholderRegistrations).where(like(stakeholderRegistrations.email, "%@e2e.local"));
  await cleanup();
});

describe("stored links", () => {
  it("only http(s) addresses are saved, never javascript: links", async () => {
    const u = await createUser("mentor");
    const bad = await api("PUT", "/api/account/me", { token: u.token, body: { linkedinUrl: "javascript:alert(document.cookie)" } });
    expect(bad.status).toBe(422);
    const ok = await api("PUT", "/api/account/me", { token: u.token, body: { linkedinUrl: "https://www.linkedin.com/in/someone" } });
    expect(ok.status).toBe(200);
  });
});

describe("public forms", () => {
  it("one visitor can't flood the stakeholder applications", async () => {
    process.env["RATE_LIMITS"] = "on";
    try {
      const ip = { "X-Forwarded-For": `203.0.113.${Math.floor(Math.random() * 250) + 1}` };
      const body = () => ({
        type: "vc", fullName: "E2E Fund", title: "Partner", email: newEmail(), country: "AE",
        website: "https://fund.example", phone: "+971500000000", representing: "A fund", involvement: ["Funding"],
      });
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await api("POST", "/api/stakeholders/organisation", { headers: ip, body: body() })).status;
      expect(last).toBe(429);
    } finally {
      delete process.env["RATE_LIMITS"];
    }
  });
});
