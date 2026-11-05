import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * Saved AI Dashboard boards (ported from VX Academy).
 *
 * `charts` holds chart SPECS ONLY — never result rows. A spec is the agent's
 * own SELECT plus how its columns map onto a picture (see
 * server/services/ai-sql/chart-spec.ts), and every render re-runs that SELECT
 * through the AI SQL guard and read-only executor, so a saved board can never
 * hand a viewer data the `ai` schema itself does not expose.
 *
 * Boards are shared across all admins: `createdBy` is audit metadata, not a
 * partition key, and reads are never filtered by it. `charts` is deliberately
 * unconstrained at the DB level; the read path drops entries that no longer
 * parse, so a stale row degrades a board instead of breaking the page.
 */
export const aiDashboards = pgTable(
  "ai_dashboards",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    charts: jsonb("charts").notNull().default(sql`'[]'::jsonb`),
    // set null, not cascade: deleting an admin must not delete shared boards.
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => [index("ai_dashboards_updated_at_idx").on(t.updatedAt)],
);

export type AiDashboardRow = typeof aiDashboards.$inferSelect;
export type InsertAiDashboard = typeof aiDashboards.$inferInsert;
