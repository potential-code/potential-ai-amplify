import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Every points award, once per (user, reason, ref). users.points stays the
 * spendable balance; this ledger is what stops the same unit paying twice and
 * what the daily cap counts. Ported from SMEEP.
 */
export const pointsEvents = pgTable(
  'points_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** 'unit' (ref = unit id) */
    reason: text('reason').notNull(),
    ref: text('ref').notNull(),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('points_events_user_reason_ref_idx').on(t.userId, t.reason, t.ref),
    index('points_events_user_created_idx').on(t.userId, t.createdAt),
  ],
)

export type PointsEvent = typeof pointsEvents.$inferSelect
