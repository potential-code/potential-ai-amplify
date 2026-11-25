import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import jwt from "jsonwebtoken";
import { startTestServer, api, cleanup, createUser } from "./helpers";
import { fingerprint } from "../services/serviceTokenClaims";
import { mintServiceToken } from "../services/learning/aiClient";
import { ASK_ANNA_PROMPT, SIGN_UP_PROMPT } from "../../shared/anna/prompts";

beforeAll(async () => {
  await startTestServer();
});
afterAll(async () => {
  await cleanup();
});

// Verified the way potential-ai checks them (src/lib/serviceToken.ts): HS256,
// iss = the platformId, aud = "potential-ai".
const claims = (token: string) =>
  jwt.verify(token, process.env["COPILOT_SERVICE_JWT_SECRET"]!, { algorithms: ["HS256"], issuer: "ai-amplify", audience: "potential-ai" }) as Record<string, unknown>;

describe("potential-ai tokens", () => {
  it("a guest token is scoped to the sign-up chat and its prompt only", async () => {
    const res = await api("GET", "/api/account/copilot-token/guest");
    const c = claims(res.body.data.token);
    expect(c["platformId"]).toBe("ai-amplify");
    expect(c["userId"]).toBeUndefined();
    expect(c["scope"]).toBe("guest");
    expect(c["prompts"]).toEqual([fingerprint(SIGN_UP_PROMPT)]);
  });

  it("a learner's token is scoped user and lists Anna's prompts", async () => {
    const u = await createUser();
    const c = claims((await api("GET", "/api/account/copilot-token", { token: u.token })).body.data.token);
    expect(c["userId"]).toBe(u.id);
    expect(c["scope"]).toBe("user");
    expect(c["prompts"]).toContain(fingerprint(ASK_ANNA_PROMPT));
    expect(c["prompts"]).toContain(fingerprint(SIGN_UP_PROMPT));
  });

  it("an admin's token is scoped admin", async () => {
    const a = await createUser("admin");
    const c = claims((await api("GET", "/api/account/copilot-token", { token: a.token })).body.data.token);
    expect(c["scope"]).toBe("admin");
  });

  it("every token names its issuer (ai-amplify, = platformId) and audience (potential-ai)", async () => {
    const u = await createUser();
    for (const token of [
      (await api("GET", "/api/account/copilot-token/guest")).body.data.token,
      (await api("GET", "/api/account/copilot-token", { token: u.token })).body.data.token,
      (await api("GET", "/api/account/voice-token", { token: u.token })).body.data.token,
      mintServiceToken(u.id),
    ]) {
      const c = claims(token);
      expect(c["iss"]).toBe("ai-amplify");
      expect(c["iss"]).toBe(c["platformId"]);
      expect(c["aud"]).toBe("potential-ai");
    }
    const server = claims(mintServiceToken(u.id));
    expect(server["scope"]).toBe("server");
    expect((server["exp"] as number) - (server["iat"] as number)).toBe(300);
  });

  it("needs a session for a user token", async () => {
    expect((await api("GET", "/api/account/copilot-token")).status).toBe(401);
  });

  it("the voice socket gets a 60-second token, never the 1-hour chat token", async () => {
    const u = await createUser();
    const c = claims((await api("GET", "/api/account/voice-token", { token: u.token })).body.data.token);
    expect(c["platformId"]).toBe("ai-amplify");
    expect(c["userId"]).toBe(u.id);
    expect(c["scope"]).toBe("user");
    expect((c["exp"] as number) - (c["iat"] as number)).toBe(60);
    expect((await api("GET", "/api/account/voice-token")).status).toBe(401);
  });
});
