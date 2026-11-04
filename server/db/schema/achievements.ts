import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// The points ledger itself (points_events) is pointsEvents.ts.

/** Badges a learner has earned, kept once with the day they earned it. */
export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** A key from server/services/achievements.service.ts BADGES. */
    badge: text('badge').notNull(),
    earnedAt: timestamp('earned_at').notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badge] })],
)

export type UserBadge = typeof userBadges.$inferSelect
