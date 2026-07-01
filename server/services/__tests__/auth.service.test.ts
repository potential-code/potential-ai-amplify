/**
 * Unit tests for the OTP / passwordless-registration / set-password feature in
 * auth.service.ts.
 *
 * Strategy:
 * - `../db` is mocked via `mock.module` with a programmable fake query-builder
 *   so no live Postgres is required. The fake records every call and returns
 *   whatever the per-test "scenario" dictates.
 * - `../mail/mailer` is mocked so sendOtp does not attempt real SMTP/SES.
 * - bcryptjs and jsonwebtoken are the REAL libraries — OTP hashing and the
 *   verifiedToken JWT round-trip are genuinely exercised.
 * - JWT_SECRET and DATABASE_URL are set BEFORE the service is imported.
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// --- Environment must be configured before the service module is imported ----
process.env["JWT_SECRET"] = "test-secret-for-auth-service-tests";
// `../db` is mocked below, but its real module throws at import time if this is
// unset; setting it is harmless belt-and-braces.
process.env["DATABASE_URL"] = "postgres://test:test@localhost:5432/test";

// ---------------------------------------------------------------------------
// Fake DB query-builder
// ---------------------------------------------------------------------------
// The service uses these chains:
//   db.select(...).from(...).where(...).limit(...)                  -> rows[]
//   db.select(...).from(...).where(...).orderBy(...).limit(...)     -> rows[]
//   db.insert(...).values(...)            (otpCodes)                -> void
//   db.insert(...).values(...).returning() (users, inside tx)      -> rows[]
//   db.update(...).set(...).where(...)                             -> void
//   db.delete(...).where(...)                                      -> void
//   db.transaction(async (tx) => ...)                              -> cb(tx)
//
// We make every chain method return `this` (a thenable proxy) so awaiting at
// any point resolves to a queued result. Tests drive behaviour by pushing
// onto `dbScenario` queues and inspecting `dbCalls`.

interface DbCall {
  op: string;
  args: unknown[];
}

let dbCalls: DbCall[];
// Queue of result-sets for terminal SELECTs (resolved in call order).
let selectResults: unknown[][];
// Queue of result-sets for INSERT ... RETURNING (resolved in call order).
let returningResults: unknown[][];

function record(op: string, args: unknown[]): void {
  dbCalls.push({ op, args });
}

/**
 * A chain node. Every builder method returns a chain node. The node is
 * thenable: awaiting it pops the next queued SELECT result. `.returning()`
 * makes awaiting pop from the returning queue instead.
 */
function makeSelectChain(): any {
  const chain: any = {
    from: (...a: unknown[]) => (record("from", a), chain),
    where: (...a: unknown[]) => (record("where", a), chain),
    orderBy: (...a: unknown[]) => (record("orderBy", a), chain),
    limit: (...a: unknown[]) => (record("limit", a), chain),
    then: (resolve: (v: unknown) => void) => {
      const rows = selectResults.shift() ?? [];
      resolve(rows);
    },
  };
  return chain;
}

function makeInsertChain(): any {
  const chain: any = {
    values: (...a: unknown[]) => (record("insert.values", a), chain),
    returning: (...a: unknown[]) => {
      record("insert.returning", a);
      return {
        then: (resolve: (v: unknown) => void) => {
          const rows = returningResults.shift() ?? [];
          resolve(rows);
        },
      };
    },
    // Bare `await db.insert().values()` (otpCodes) resolves to undefined.
    then: (resolve: (v: unknown) => void) => resolve(undefined),
  };
  return chain;
}

function makeUpdateChain(): any {
  const chain: any = {
    set: (...a: unknown[]) => (record("update.set", a), chain),
    where: (...a: unknown[]) => (record("update.where", a), chain),
    then: (resolve: (v: unknown) => void) => resolve(undefined),
  };
  return chain;
}

function makeDeleteChain(): any {
  const chain: any = {
    where: (...a: unknown[]) => (record("delete.where", a), chain),
    then: (resolve: (v: unknown) => void) => resolve(undefined),
  };
  return chain;
}

const fakeDb: any = {
  select: (...a: unknown[]) => (record("select", a), makeSelectChain()),
  insert: (...a: unknown[]) => (record("insert", a), makeInsertChain()),
  update: (...a: unknown[]) => (record("update", a), makeUpdateChain()),
  delete: (...a: unknown[]) => (record("delete", a), makeDeleteChain()),
  transaction: async (cb: (tx: any) => Promise<unknown>) => {
    record("transaction", []);
    // tx exposes the same builder surface plus execute() for the FOR UPDATE.
    const tx: any = {
      insert: fakeDb.insert,
      update: fakeDb.update,
      select: fakeDb.select,
      delete: fakeDb.delete,
      execute: (...a: unknown[]) => {
        record("tx.execute", a);
        const rows = selectResults.shift() ?? [];
        return Promise.resolve({ rows });
      },
    };
    return cb(tx);
  },
};

// Mock the db module the service imports. The service does
// `import { db } from "../db"`. mock.module resolves the specifier relative to
// THIS test file, so we must point at the same absolute module the service
// resolves — server/db/index.ts — using an absolute path. We also re-export the
// real schema so `import { users, ... } from "../db"` still yields genuine
// Drizzle table objects (the fake db ignores them, but the import must succeed).
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbModulePath = path.resolve(here, "../../db"); // -> server/db
const realSchema = await import(path.resolve(here, "../../db/schema"));

mock.module(dbModulePath, () => ({ db: fakeDb, ...realSchema }));

// Mock the mailer so sendOtp does not touch SMTP/SES.
const sendMailMock = mock(async (_opts: unknown) => undefined);
mock.module(path.resolve(here, "../../mail/mailer"), () => ({ sendMail: sendMailMock }));

// Import AFTER mocks + env are in place.
const { sendOtp, verifyOtp, registerUser, setInitialPassword, getMe } =
  await import("../auth.service");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = process.env["JWT_SECRET"]!;

function makeVerifiedToken(email: string, opts?: { purpose?: string; expiresIn?: string }) {
  return jwt.sign({ purpose: opts?.purpose ?? "email-verified", email }, SECRET, {
    algorithm: "HS256",
    expiresIn: opts?.expiresIn ?? "15m",
  });
}

/** Build an otp row with a real bcrypt hash of `code`. */
async function makeOtpRow(overrides: {
  code?: string;
  email?: string;
  attempts?: number;
  expiresAt?: Date;
  consumedAt?: Date | null;
}) {
  const code = overrides.code ?? "123456";
  return {
    id: "otp-row-id",
    email: overrides.email ?? "user@example.com",
    codeHash: await bcrypt.hash(code, 12),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
    consumedAt: overrides.consumedAt ?? null,
    attempts: overrides.attempts ?? 0,
    createdAt: new Date(),
  };
}

function expectAppError(fn: () => Promise<unknown>, code: string, status?: number) {
  return fn().then(
    () => {
      throw new Error(`Expected AppError "${code}" but call resolved`);
    },
    (err: any) => {
      expect(err.code).toBe(code);
      if (status !== undefined) expect(err.statusCode).toBe(status);
      return err;
    },
  );
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  dbCalls = [];
  selectResults = [];
  returningResults = [];
  sendMailMock.mockClear();
});

// ===========================================================================
// sendOtp
// ===========================================================================
describe("sendOtp", () => {
  it("deletes prior unconsumed codes, stores only a bcrypt HASH (not plaintext), and emails the code", async () => {
    await sendOtp("user@example.com");

    // A delete happened before the insert.
    const deleteIdx = dbCalls.findIndex((c) => c.op === "delete");
    const insertIdx = dbCalls.findIndex((c) => c.op === "insert");
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(deleteIdx);

    // Inspect the values passed to insert().values(...).
    const valuesCall = dbCalls.find((c) => c.op === "insert.values");
    expect(valuesCall).toBeDefined();
    const stored = valuesCall!.args[0] as {
      email: string;
      codeHash: string;
      expiresAt: Date;
      attempts: number;
    };

    expect(stored.email).toBe("user@example.com");
    expect(stored.attempts).toBe(0);
    // Expiry roughly 10 minutes out.
    const ttl = stored.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 5000);

    // sendMail called exactly once with a 6-digit code in context.
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mailArg = sendMailMock.mock.calls[0]![0] as {
      to: string;
      context: { code: string };
      template: string;
    };
    expect(mailArg.to).toBe("user@example.com");
    expect(mailArg.template).toBe("otp-code");
    const plaintext = mailArg.context.code;
    expect(plaintext).toMatch(/^\d{6}$/);

    // The stored value must NOT be the plaintext — it must be a bcrypt hash
    // that verifies against the emailed plaintext.
    expect(stored.codeHash).not.toBe(plaintext);
    expect(stored.codeHash.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare(plaintext, stored.codeHash)).toBe(true);
  });

  it("always resolves to undefined", async () => {
    const result = await sendOtp("anyone@example.com");
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// verifyOtp
// ===========================================================================
describe("verifyOtp", () => {
  it("returns a valid HS256 'email-verified' verifiedToken on success and consumes the code", async () => {
    const row = await makeOtpRow({ code: "424242", email: "vu@example.com" });
    selectResults.push([row]);

    const { verifiedToken } = await verifyOtp("vu@example.com", "424242");

    // Token is a genuine HS256 JWT carrying purpose + matching email.
    const decoded = jwt.verify(verifiedToken, SECRET, { algorithms: ["HS256"] }) as any;
    expect(decoded.purpose).toBe("email-verified");
    expect(decoded.email).toBe("vu@example.com");

    // The code was consumed (update set consumedAt).
    const setCall = dbCalls.find(
      (c) => c.op === "update.set" && (c.args[0] as any).consumedAt instanceof Date,
    );
    expect(setCall).toBeDefined();
  });

  it("throws INVALID_OTP (400) and increments attempts when the code is wrong", async () => {
    const row = await makeOtpRow({ code: "111111", attempts: 2 });
    selectResults.push([row]);

    await expectAppError(() => verifyOtp("user@example.com", "999999"), "INVALID_OTP", 400);

    // attempts incremented to 3.
    const setCall = dbCalls.find((c) => c.op === "update.set");
    expect(setCall).toBeDefined();
    expect((setCall!.args[0] as any).attempts).toBe(3);
  });

  it("throws INVALID_OTP when no usable row exists (expired filtered out by query / wrong email)", async () => {
    // The service's WHERE clause excludes expired/consumed rows, so the DB
    // returns nothing. Simulate that with an empty result set.
    selectResults.push([]);

    await expectAppError(() => verifyOtp("user@example.com", "123456"), "INVALID_OTP", 400);
  });

  it("treats an expired code as no usable row -> INVALID_OTP", async () => {
    // Even if a row somehow surfaced expired, the query's gt(expiresAt, now)
    // guard means production returns []. We assert the same outcome here.
    selectResults.push([]);
    await expectAppError(() => verifyOtp("user@example.com", "123456"), "INVALID_OTP", 400);
  });

  it("throws OTP_LOCKED (429) once attempts have reached the max", async () => {
    const row = await makeOtpRow({ code: "555555", attempts: 5 });
    selectResults.push([row]);

    await expectAppError(() => verifyOtp("user@example.com", "555555"), "OTP_LOCKED", 429);

    // Locked out BEFORE comparing — no attempts increment, no consume.
    const consumed = dbCalls.find(
      (c) => c.op === "update.set" && (c.args[0] as any).consumedAt instanceof Date,
    );
    expect(consumed).toBeUndefined();
  });

  it("does not consume the code or issue a token on a wrong guess", async () => {
    const row = await makeOtpRow({ code: "313131" });
    selectResults.push([row]);
    await expectAppError(() => verifyOtp("user@example.com", "000000"), "INVALID_OTP");
    const consumed = dbCalls.find(
      (c) => c.op === "update.set" && (c.args[0] as any).consumedAt instanceof Date,
    );
    expect(consumed).toBeUndefined();
  });
});

// ===========================================================================
// registerUser — OTP (passwordless) mode
// ===========================================================================
describe("registerUser (OTP / passwordless mode)", () => {
  it("creates a user with passwordHash null and issues a JWT when given a valid verifiedToken", async () => {
    const email = "newsme@example.com";
    const token = makeVerifiedToken(email);

    // 1) email-availability SELECT -> empty (available)
    selectResults.push([]);
    // 2) insert ... returning -> the created user
    returningResults.push([
      { id: "user-uuid-1", fullName: "New SME", email, role: "sme", country: "US" },
    ]);

    const result = await registerUser({
      fullName: "New SME",
      email,
      country: "US",
      verifiedToken: token,
    });

    // JWT issued and decodes to the new user.
    const decoded = jwt.verify(result.token, SECRET, { algorithms: ["HS256"] }) as any;
    expect(decoded.userId).toBe("user-uuid-1");
    expect(decoded.role).toBe("sme");

    expect(result.user).toMatchObject({ id: "user-uuid-1", email, role: "sme" });

    // The insert stored passwordHash null (OTP-only account).
    const valuesCall = dbCalls.find(
      (c) => c.op === "insert.values" && (c.args[0] as any)?.role === "sme",
    );
    expect(valuesCall).toBeDefined();
    expect((valuesCall!.args[0] as any).passwordHash).toBeNull();
  });

  it("throws EMAIL_NOT_VERIFIED (400) when the verifiedToken is forged / bad signature", async () => {
    const email = "x@example.com";
    const forged = jwt.sign({ purpose: "email-verified", email }, "WRONG-SECRET", {
      algorithm: "HS256",
    });
    selectResults.push([]); // email available

    await expectAppError(
      () => registerUser({ fullName: "X", email, country: "US", verifiedToken: forged }),
      "EMAIL_NOT_VERIFIED",
      400,
    );
  });

  it("throws EMAIL_NOT_VERIFIED when the token email does not match the registration email", async () => {
    const token = makeVerifiedToken("someone-else@example.com");
    selectResults.push([]); // email available

    await expectAppError(
      () =>
        registerUser({
          fullName: "Y",
          email: "mismatch@example.com",
          country: "US",
          verifiedToken: token,
        }),
      "EMAIL_NOT_VERIFIED",
      400,
    );
  });

  it("throws EMAIL_NOT_VERIFIED when the token purpose is wrong", async () => {
    const email = "z@example.com";
    const token = makeVerifiedToken(email, { purpose: "password-reset" });
    selectResults.push([]); // email available

    await expectAppError(
      () => registerUser({ fullName: "Z", email, country: "US", verifiedToken: token }),
      "EMAIL_NOT_VERIFIED",
      400,
    );
  });

  it("throws EMAIL_NOT_VERIFIED when the verifiedToken is expired", async () => {
    const email = "exp@example.com";
    const token = jwt.sign({ purpose: "email-verified", email }, SECRET, {
      algorithm: "HS256",
      expiresIn: "-1s",
    });
    selectResults.push([]); // email available

    await expectAppError(
      () => registerUser({ fullName: "E", email, country: "US", verifiedToken: token }),
      "EMAIL_NOT_VERIFIED",
      400,
    );
  });

  it("throws VALIDATION_ERROR (400) when neither password nor verifiedToken is supplied", async () => {
    selectResults.push([]); // email available

    await expectAppError(
      () => registerUser({ fullName: "No Creds", email: "nc@example.com", country: "US" }),
      "VALIDATION_ERROR",
      400,
    );
  });

  it("throws EMAIL_EXISTS (409) when the email is already registered", async () => {
    selectResults.push([{ id: "existing-id" }]); // email taken

    await expectAppError(
      () =>
        registerUser({
          fullName: "Dup",
          email: "dup@example.com",
          country: "US",
          verifiedToken: makeVerifiedToken("dup@example.com"),
        }),
      "EMAIL_EXISTS",
      409,
    );
  });
});

// ===========================================================================
// setInitialPassword
// ===========================================================================
describe("setInitialPassword", () => {
  it("hashes and saves the password for an account that has none", async () => {
    // user lookup -> passwordHash null (OTP-only account)
    selectResults.push([{ passwordHash: null }]);

    await setInitialPassword("user-uuid-1", "s3cretpass", "s3cretpass");

    const setCall = dbCalls.find(
      (c) => c.op === "update.set" && typeof (c.args[0] as any).passwordHash === "string",
    );
    expect(setCall).toBeDefined();
    const saved = (setCall!.args[0] as any).passwordHash as string;
    expect(saved.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("s3cretpass", saved)).toBe(true);
  });

  it("throws PASSWORD_MISMATCH (400) when confirm differs from password", async () => {
    await expectAppError(
      () => setInitialPassword("user-uuid-1", "abcdefgh", "different"),
      "PASSWORD_MISMATCH",
      400,
    );
    // Must fail before any DB read.
    expect(dbCalls.length).toBe(0);
  });

  it("throws PASSWORD_ALREADY_SET (409) when the account already has a hash", async () => {
    selectResults.push([
      { passwordHash: "$2b$12$alreadysethashvalueXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
    ]);

    await expectAppError(
      () => setInitialPassword("user-uuid-1", "abcdefgh", "abcdefgh"),
      "PASSWORD_ALREADY_SET",
      409,
    );
    // No update should have been issued.
    const setCall = dbCalls.find((c) => c.op === "update.set");
    expect(setCall).toBeUndefined();
  });

  it("throws USER_NOT_FOUND (404) when the user row is missing", async () => {
    selectResults.push([]); // no user

    await expectAppError(
      () => setInitialPassword("ghost", "abcdefgh", "abcdefgh"),
      "USER_NOT_FOUND",
      404,
    );
  });
});

// ===========================================================================
// getMe — hasPassword flag
// ===========================================================================
describe("getMe (hasPassword flag)", () => {
  function pushMeSelects(passwordHash: string | null, role = "sme") {
    // 1) user row
    selectResults.push([
      {
        id: "u1",
        fullName: "Me",
        email: "me@example.com",
        role,
        country: "US",
        bio: null,
        company: null,
        phone: null,
        avatarUrl: null,
        timezone: null,
        meetingLink: null,
        createdAt: new Date(),
        passwordHash,
      },
    ]);
    // 2) cert count, 3) enroll count
    selectResults.push([{ n: 0 }]);
    selectResults.push([{ n: 0 }]);
    // 4) mentor registration lookup (only for role === "mentor")
    if (role === "mentor") selectResults.push([{ linkedinUrl: null }]);
  }

  it("returns hasPassword false for an OTP-only account (null hash)", async () => {
    pushMeSelects(null);
    const me = await getMe("u1");
    expect(me.hasPassword).toBe(false);
    expect(me.email).toBe("me@example.com");
  });

  it("returns hasPassword true once a password hash is set", async () => {
    pushMeSelects("$2b$12$somehashvalueXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    const me = await getMe("u1");
    expect(me.hasPassword).toBe(true);
  });

  it("throws USER_NOT_FOUND (404) when the user row is missing", async () => {
    selectResults.push([]); // no user
    await expectAppError(() => getMe("ghost"), "USER_NOT_FOUND", 404);
  });
});
