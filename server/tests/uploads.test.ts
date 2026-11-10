import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { mediaFiles } from "../db/schema";
import { startTestServer, cleanup, createUser, ORIGIN, type TestUser } from "./helpers";

let baseUrl = "";
let admin: TestUser;
const stored: string[] = [];

beforeAll(async () => {
  baseUrl = await startTestServer();
  admin = await createUser("admin");
});
afterAll(async () => {
  for (const name of stored) {
    await fs.rm(path.join(import.meta.dir, "..", "uploads", "media", name), { force: true });
    await db.delete(mediaFiles).where(eq(mediaFiles.storedName, name));
  }
  await cleanup();
});

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("media uploads", () => {
  it("name the stored file after its checked type, not the name it was sent with", async () => {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "page.html");
    const res = await fetch(`${baseUrl}/api/media/upload`, {
      method: "POST",
      headers: { Connection: "close", Origin: ORIGIN, Cookie: admin.token },
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { storedName: string }[] };
    const name = body.data[0]!.storedName;
    stored.push(name);
    expect(name).toMatch(/\.png$/);
    expect(name).not.toMatch(/\.html/);
  });

  it("serve an uploaded file back from where it was stored", async () => {
    const res = await fetch(`${baseUrl}/uploads/media/${stored[0]}`);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("serve uploaded files with nosniff", async () => {
    const res = await fetch(`${baseUrl}/uploads/media/${stored[0]}`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
