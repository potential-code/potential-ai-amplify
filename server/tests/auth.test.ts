import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import jwt from "jsonwebtoken";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { otpCodes, users } from "../db/schema";
import { startTestServer, api, cleanup, createUser, createInviteCode, newEmail } from "./helpers";
import { verifyOtp } from "../services/auth.service";

beforeAll(async () => {
  await startTestServer();
});
afterAll(async () => {
  await cleanup();
});

/** Mint the "email verified" proof the way /verify-otp does, without email. */
async function proofFor(email: string): Promise<string> {
  // A real code row so verifyOtp runs its normal path.
  const bcrypt = (await import("bcryptjs")).default;
  await db.insert(otpCodes).values({
    email,
    codeHash: await bcrypt.hash("123456", 4),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
  });
  return (await verifyOtp(email, "123456")).verifiedToken;
}

describe("sign-up", () => {
  it("refuses a password sign-up without proof of the email", async () => {
    const res = await api("POST", "/api/auth/register", {
      body: { fullName: "No Proof", email: newEmail(), password: "a-long-password", country: "AE", couponCode: await createInviteCode() },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a proof minted for a different email", async () => {
    const email = newEmail();
    const res = await api("POST", "/api/auth/register", {
      body: {
        fullName: "Wrong Proof", email, password: "a-long-password", country: "AE",
        couponCode: await createInviteCode(), verifiedToken: await proofFor(newEmail()),
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("refuses a sign-up without an invite code, even with proof", async () => {
    const email = newEmail();
    const res = await api("POST", "/api/auth/register", {
      body: { fullName: "No Invite", email, password: "a-long-password", country: "AE", verifiedToken: await proofFor(email) },
    });
    expect(res.status).toBe(422);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u).toBeUndefined();
  });

  it("refuses an invite code that doesn't exist", async () => {
    const email = newEmail();
    const res = await api("POST", "/api/auth/register", {
      body: { fullName: "Bad Invite", email, password: "a-long-password", country: "AE", couponCode: "NOPE-NOT-REAL", verifiedToken: await proofFor(email) },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_COUPON");
  });

  it("creates the account with proof and a valid invite, and uses the invite up", async () => {
    const email = newEmail();
    const code = await createInviteCode();
    const res = await api("POST", "/api/auth/register", {
      body: { fullName: "Proven", email, password: "a-long-password", country: "AE", couponCode: code, verifiedToken: await proofFor(email) },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);

    const again = newEmail();
    const reuse = await api("POST", "/api/auth/register", {
      body: { fullName: "Reuse", email: again, password: "a-long-password", country: "AE", couponCode: code, verifiedToken: await proofFor(again) },
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("INVALID_COUPON");
  });

  it("the email-verified proof is not a sign-in token", async () => {
    const proof = await proofFor(newEmail());
    const res = await api("GET", "/api/auth/me", { token: proof });
    expect(res.status).toBe(401);
  });
});

describe("sign-in limits", () => {
  it("are per visitor: one visitor using up the login limit doesn't block another", async () => {
    process.env["RATE_LIMITS"] = "on";
    try {
      const a = { "X-Forwarded-For": "10.1.0.1" };
      let last = 0;
      for (let i = 0; i < 31; i++) {
        last = (await api("POST", "/api/auth/login", { headers: a, body: { email: newEmail(), password: "wrong" } })).status;
      }
      expect(last).toBe(429);

      const b = await api("POST", "/api/auth/login", { headers: { "X-Forwarded-For": "10.1.0.2" }, body: { email: newEmail(), password: "wrong" } });
      expect(b.status).toBe(401);

      // Anna's guest tokens are counted separately from logins.
      const guest = await api("GET", "/api/auth/copilot-token/guest", { headers: a });
      expect(guest.status).toBe(200);
    } finally {
      delete process.env["RATE_LIMITS"];
    }
  });

  it("are per email: one address can't be guessed at from many visitors", async () => {
    process.env["RATE_LIMITS"] = "on";
    try {
      const user = await createUser();
      let last = 0;
      for (let i = 0; i < 11; i++) {
        last = (await api("POST", "/api/auth/login", {
          headers: { "X-Forwarded-For": `10.2.0.${i + 1}` },
          body: { email: user.email, password: "wrong" },
        })).status;
      }
      expect(last).toBe(429);
    } finally {
      delete process.env["RATE_LIMITS"];
    }
  });
});

describe("error replies", () => {
  it("broken JSON is a 400, not a server error", async () => {
    const res = await api("POST", "/api/auth/login", { raw: "{bad" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("an unknown API address is a JSON 404", async () => {
    const res = await api("GET", "/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("a session token for a valid user still works", async () => {
    const user = await createUser();
    const res = await api("GET", "/api/auth/me", { token: user.token });
    expect(res.status).toBe(200);
  });
});

// Keep the imports used even if a scenario above changes.
void jwt; void and; void isNull;
