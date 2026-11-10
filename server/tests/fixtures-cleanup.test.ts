import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { inviteCodes, users } from "../db/schema";
import { cleanup, createInviteCode, createUser, startTestServer, stopTestServer } from "./helpers";

/**
 * A test run removes only what it created. Another suite can share the
 * database at the same time (two sessions running the suite, or another
 * project pointed at it), and its fixture users and invite codes must survive
 * this run's cleanup.
 */

const othersEmails = [
  `someone-${crypto.randomUUID().slice(0, 8)}@e2e.local`,
  `someone-${crypto.randomUUID().slice(0, 8)}@rotherrun.e2e.local`,
];
const othersCode = `E2E${Date.now()}OTHER`;

beforeAll(async () => {
  await startTestServer();
});

afterAll(async () => {
  await cleanup(); // this run's own, if the test failed before its cleanup
  await stopTestServer();
  await db.delete(users).where(inArray(users.email, othersEmails));
  await db.delete(inviteCodes).where(inArray(inviteCodes.code, [othersCode]));
});

describe("fixture cleanup", () => {
  it("removes this run's users and codes, and leaves another run's alone", async () => {
    await db.insert(users).values(othersEmails.map((email) => ({ fullName: "Another run", email, role: "sme" as const, country: "AE" })));
    await db.insert(inviteCodes).values({ code: othersCode });
    const mine = await createUser("sme", "E2E cleanup");
    const myCode = await createInviteCode();

    await cleanup();

    const left = await db.select({ email: users.email }).from(users).where(inArray(users.email, [...othersEmails, mine.email]));
    expect(left.map((u) => u.email).sort()).toEqual([...othersEmails].sort());
    const codes = await db.select({ code: inviteCodes.code }).from(inviteCodes).where(inArray(inviteCodes.code, [othersCode, myCode]));
    expect(codes.map((c) => c.code)).toEqual([othersCode]);
  });
});
