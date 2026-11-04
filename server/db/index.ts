import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// A query that runs away can't hold a connection for ever (the pool has 10).
// Migrations use their own connection (scripts/migrate.mjs).
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, statement_timeout: 30_000 });
export const db = drizzle(pool, { schema });

export * from "./schema";
