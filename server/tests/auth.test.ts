import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { authAccounts, inviteCodes, mentorRegistrations, mentorSetupTokens, users } from "../db/schema";
import { hashPassword } from "../auth/password";
import {
  startTestServer, api, cleanup, cookieHeader, createUser, createInviteCode, newEmail, sentMail, signIn, PASSWORD,
  type TestUser,
} from "./helpers";

let user: TestUser;

beforeAll(async () => {
  await startTestServer();
  user = await createUser();
});
afterAll(async () => {
  await cleanup();
});

/** The latest code emailed to `email` (the suite captures mail instead of sending it). */
function lastCode(email: string): string | null {
  const mail = sentMail().filter((m) => m.to === email && m.template === "otp-code").at(-1);
  return (mail?.context["code"] as string | undefined) ?? null;
}

/** Sends a sign-up code and swaps it for a verifiedToken. */
async function proveEmail(email: string): Promise<string> {
  expect((await api("POST", "/api/auth/amplify/sign-up/send-code", { body: { email } })).status).toBe(200);
  const code = lastCode(email);
  expect(code).toMatch(/^\d{6}$/);
  const res = await api("POST", "/api/auth/amplify/sign-up/verify-code", { body: { email, code } });
  expect(res.status).toBe(200);
  return res.body.verifiedToken;
}

const SESSION = "amplify.session_token=";

describe("sign-up (email code first, invite-only)", () => {
  it("refuses to create an account without a proven email", async () => {
    const res = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "No Proof", email: newEmail(), country: "AE", couponCode: await createInviteCode(), verifiedToken: "forged" },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("refuses a proof made for a different email", async () => {
    const res = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "Wrong Proof", email: newEmail(), country: "AE", couponCode: await createInviteCode(), verifiedToken: await proveEmail(newEmail()) },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("refuses a sign-up without an invite code, even with proof", async () => {
    const email = newEmail();
    const res = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "No Invite", email, country: "AE", verifiedToken: await proveEmail(email) },
    });
    expect(res.status).toBe(400);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u).toBeUndefined();
  });

  it("refuses an invite code that doesn't exist, without spending the proof", async () => {
    const email = newEmail();
    const token = await proveEmail(email);
    const bad = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "Bad Invite", email, country: "AE", couponCode: "NOPE-NOT-REAL", verifiedToken: token },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("INVALID_COUPON");
    const retry = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "Bad Invite", email, country: "AE", couponCode: await createInviteCode(), verifiedToken: token },
    });
    expect(retry.status).toBe(200);
  });

  it("creates a verified, signed-in account, uses the invite up, and the proof works once", async () => {
    const email = newEmail();
    const code = await createInviteCode();
    const verifiedToken = await proveEmail(email);
    const res = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "Proven", email, country: "AE", couponCode: code, password: "a-long-password", verifiedToken },
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, role: "sme", emailVerified: true });
    const me = await api("GET", "/api/account/me", { token: cookieHeader(res.setCookie) });
    expect(me.status).toBe(200);
    expect(me.body.data.user.hasPassword).toBe(true);

    const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
    expect(invite!.status).toBe("used");

    const again = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "Again", email: newEmail(), country: "AE", couponCode: await createInviteCode(), verifiedToken },
    });
    expect(again.status).toBe(400);

    const other = newEmail();
    const reuse = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "Reuse", email: other, country: "AE", couponCode: code, verifiedToken: await proveEmail(other) },
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe("INVALID_COUPON");
  });

  it("creates an account without a password (Anna's chat sign-up)", async () => {
    const email = newEmail();
    const res = await api("POST", "/api/auth/amplify/sign-up", {
      body: { fullName: "Chat", email, country: "AE", couponCode: await createInviteCode(), verifiedToken: await proveEmail(email) },
    });
    expect(res.status).toBe(200);
    const cookie = cookieHeader(res.setCookie);
    expect((await api("GET", "/api/account/me", { token: cookie })).body.data.user.hasPassword).toBe(false);
    const set = await api("POST", "/api/account/set-password", { token: cookie, body: { password: "first-pass-123", confirm: "first-pass-123" } });
    expect(set.status).toBe(200);
    expect(await signIn(email, "first-pass-123")).toContain(SESSION);
  });

  it("sends no sign-up code to an email that already has an account", async () => {
    const before = sentMail().length;
    expect((await api("POST", "/api/auth/amplify/sign-up/send-code", { body: { email: user.email } })).status).toBe(200);
    expect(sentMail().length).toBe(before);
  });

  it("locks a sign-up code after five wrong tries", async () => {
    const email = newEmail();
    await api("POST", "/api/auth/amplify/sign-up/send-code", { body: { email } });
    const real = lastCode(email)!;
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect((await api("POST", "/api/auth/amplify/sign-up/verify-code", { body: { email, code: wrong } })).status).toBe(400);
    }
    const locked = await api("POST", "/api/auth/amplify/sign-up/verify-code", { body: { email, code: real } });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("OTP_LOCKED");
  });

  it("reports email availability and invite codes truthfully", async () => {
    expect((await api("POST", "/api/account/check-email", { body: { email: user.email } })).body.data.available).toBe(false);
    expect((await api("POST", "/api/account/check-email", { body: { email: newEmail() } })).body.data.available).toBe(true);
    const code = await createInviteCode();
    expect((await api("GET", `/api/account/check-coupon?code=${code}`)).body.data.valid).toBe(true);
    expect((await api("GET", "/api/account/check-coupon?code=NOPE")).body.data.valid).toBe(false);
  });
});

describe("password sign-in", () => {
  it("signs in with the right password", async () => {
    expect(await signIn(user.email, PASSWORD)).toContain(SESSION);
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    const wrong = await api("POST", "/api/auth/sign-in/email", { body: { email: user.email, password: "not-the-password" } });
    const unknown = await api("POST", "/api/auth/sign-in/email", { body: { email: newEmail(), password: "not-the-password" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe(unknown.body.code);
  });

  it("changes the password with the current one", async () => {
    const u = await createUser();
    const res = await api("POST", "/api/auth/change-password", {
      token: u.token, body: { currentPassword: PASSWORD, newPassword: "changed-pass-789" },
    });
    expect(res.status).toBe(200);
    expect(await signIn(u.email, "changed-pass-789")).toContain(SESSION);
  });
});

describe("code sign-in and reset", () => {
  it("signs in with an email code", async () => {
    await api("POST", "/api/auth/email-otp/send-verification-otp", { body: { email: user.email, type: "sign-in" } });
    const res = await api("POST", "/api/auth/sign-in/email-otp", { body: { email: user.email, otp: lastCode(user.email) } });
    expect(res.status).toBe(200);
    expect(cookieHeader(res.setCookie)).toContain(SESSION);
  });

  it("sends no sign-in code to an unknown email but answers the same", async () => {
    const email = newEmail();
    const res = await api("POST", "/api/auth/email-otp/send-verification-otp", { body: { email, type: "sign-in" } });
    expect(res.status).toBe(200);
    expect(lastCode(email)).toBeNull();
  });

  it("resets a forgotten password with a code", async () => {
    const u = await createUser();
    expect((await api("POST", "/api/auth/email-otp/request-password-reset", { body: { email: u.email } })).status).toBe(200);
    const reset = await api("POST", "/api/auth/email-otp/reset-password", {
      body: { email: u.email, otp: lastCode(u.email), password: "reset-pass-456" },
    });
    expect(reset.status).toBe(200);
    expect(await signIn(u.email, "reset-pass-456")).toContain(SESSION);
  });
});

describe("session", () => {
  it("GET /api/account/me works with a session and not without one", async () => {
    expect((await api("GET", "/api/account/me", { token: user.token })).status).toBe(200);
    expect((await api("GET", "/api/account/me")).status).toBe(401);
    expect((await api("GET", "/api/account/me", { token: `${SESSION}garbage` })).status).toBe(401);
  });

  it("an old-style bearer token signs nobody in", async () => {
    const old = jwt.sign({ userId: user.id, role: "admin" }, process.env["JWT_SECRET"]!, { algorithm: "HS256", expiresIn: "1h" });
    expect((await api("GET", "/api/account/me", { headers: { Authorization: `Bearer ${old}` } })).status).toBe(401);
  });

  it("signing out ends the session on the server", async () => {
    const cookie = await signIn(user.email, PASSWORD);
    expect((await api("POST", "/api/auth/sign-out", { token: cookie, body: {} })).status).toBe(200);
    // The cookie cache would keep a stale copy for a few minutes; send only
    // the session token so the server must look the session up.
    const tokenOnly = cookie.split("; ").filter((c) => c.startsWith(SESSION)).join("; ");
    expect((await api("GET", "/api/account/me", { token: tokenOnly })).status).toBe(401);
  });

  it("refuses a signed-in request from another site (CSRF)", async () => {
    const cookie = await signIn(user.email, PASSWORD);
    const res = await api("POST", "/api/auth/sign-out", { token: cookie, headers: { Origin: "https://evil.example" }, body: {} });
    expect(res.status).toBe(403);
    expect((await api("GET", "/api/account/me", { token: cookie })).status).toBe(200);
  });
});

describe("accounts created before Better Auth", () => {
  async function legacyUser(password: string): Promise<string> {
    const email = newEmail();
    const [row] = await db
      .insert(users)
      .values({ fullName: "Legacy", email, role: "sme", legacyAccount: true, emailVerified: false })
      .returning({ id: users.id });
    await db.insert(authAccounts).values({
      accountId: row!.id, providerId: "credential", userId: row!.id, password: await hashPassword(password),
    });
    return email;
  }

  it("holds a password sign-in until the email is verified by code", async () => {
    const email = await legacyUser("legacy-pass-123");
    const held = await api("POST", "/api/auth/sign-in/email", { body: { email, password: "legacy-pass-123" } });
    expect(held.status).toBe(403);
    expect(held.body.code).toBe("EMAIL_NOT_VERIFIED");
    const verified = await api("POST", "/api/auth/email-otp/verify-email", { body: { email, otp: lastCode(email) } });
    expect(verified.status).toBe(200);
    expect(await signIn(email, "legacy-pass-123")).toContain(SESSION);
  });

  it("keeps the password when signing in with an email code", async () => {
    const email = await legacyUser("legacy-pass-123");
    await api("POST", "/api/auth/email-otp/send-verification-otp", { body: { email, type: "sign-in" } });
    const res = await api("POST", "/api/auth/sign-in/email-otp", { body: { email, otp: lastCode(email) } });
    expect(res.status).toBe(200);
    const [row] = await db.select({ verified: users.emailVerified }).from(users).where(eq(users.email, email));
    expect(row!.verified).toBe(true);
    expect(await signIn(email, "legacy-pass-123")).toContain(SESSION);
  });
});

describe("mentor setup link", () => {
  it("creates a verified mentor, signs in, and cannot be reused", async () => {
    const email = newEmail();
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const [reg] = await db
      .insert(mentorRegistrations)
      .values({ name: "Setup Mentor", email, status: "approved" })
      .returning({ id: mentorRegistrations.id });
    await db.insert(mentorSetupTokens).values({ mentorRegistrationId: reg!.id, token, expiresAt: new Date(Date.now() + 3_600_000) });

    const res = await api("POST", "/api/auth/amplify/mentor-setup", { body: { token, password: "mentor-pass-123" } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "mentor", emailVerified: true });
    expect(await signIn(email, "mentor-pass-123")).toContain(SESSION);

    const again = await api("POST", "/api/auth/amplify/mentor-setup", { body: { token, password: "mentor-pass-123" } });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("TOKEN_EXPIRED");
    await db.delete(mentorRegistrations).where(eq(mentorRegistrations.id, reg!.id));
  });
});

describe("sign-in limits", () => {
  it("are per visitor: one visitor using up the sign-in limit doesn't block another", async () => {
    process.env["RATE_LIMITS"] = "on";
    try {
      // Public test addresses (RFC 5737): private ones count as proxy hops.
      const run = Math.floor(Math.random() * 250) + 1;
      const a = { "X-Forwarded-For": `203.0.113.${run}` };
      let last = 0;
      for (let i = 0; i < 6; i++) {
        last = (await api("POST", "/api/auth/sign-in/email", { headers: a, body: { email: newEmail(), password: "wrong-pass" } })).status;
      }
      expect(last).toBe(429);

      const b = await api("POST", "/api/auth/sign-in/email", { headers: { "X-Forwarded-For": `198.51.100.${run}` }, body: { email: newEmail(), password: "wrong-pass" } });
      expect(b.status).toBe(401);

      // Anna's guest tokens are counted separately from sign-ins.
      const guest = await api("GET", "/api/account/copilot-token/guest", { headers: a });
      expect(guest.status).toBe(200);
    } finally {
      delete process.env["RATE_LIMITS"];
    }
  });

  it("are per email: one address can't be guessed at from many visitors", async () => {
    process.env["RATE_LIMITS"] = "on";
    try {
      const u = await createUser();
      let last = 0;
      for (let i = 0; i < 21; i++) {
        last = (await api("POST", "/api/auth/sign-in/email", {
          headers: { "X-Forwarded-For": `192.0.2.${i + 1}` },
          body: { email: u.email, password: "wrong-pass" },
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
    const res = await api("POST", "/api/account/check-email", { raw: "{bad" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("an unknown API address is a JSON 404", async () => {
    const res = await api("GET", "/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
