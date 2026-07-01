import { defineConfig } from "drizzle-kit";

// Run from repo root. drizzle-kit resolves schema/out relative to cwd (root).
// DATABASE_URL only needed for live DB commands (push/migrate/studio);
// generate only reads the schema. Loaded from root .env automatically.
export default defineConfig({
  schema: "./server/db/schema/index.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost/placeholder",
  },
});
