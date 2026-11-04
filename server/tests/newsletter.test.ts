import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { newsletterSubscribers } from "../db/schema";
import { startTestServer, api, newEmail } from "./helpers";

const emails: string[] = [];

beforeAll(async () => {
  await startTestServer();
});
afterAll(async () => {
  for (const email of emails) await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.email, email));
});

describe("newsletter sign-up", () => {
  it("stores the address once, and signing up again is harmless", async () => {
    const email = newEmail();
    emails.push(email);
    expect((await api("POST", "/api/newsletter/subscribe", { body: { email: email.toUpperCase() } })).status).toBe(201);
    expect((await api("POST", "/api/newsletter/subscribe", { body: { email } })).status).toBe(201);
    const rows = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email));
    expect(rows.length).toBe(1);
  });

  it("refuses something that isn't an email", async () => {
    const res = await api("POST", "/api/newsletter/subscribe", { body: { email: "not-an-email" } });
    expect(res.status).toBe(422);
  });
});
