import { pgTable, uuid, date, integer, primaryKey } from 'drizzle-orm/pg-core'
import { users } from './users'

/**
 * One row per learner per calendar day (in the learner's own timezone) on
 * which they completed at least one learning step: an LMS/tutor block, a
 * Content on Demand or Blended item, or a quiz/assessment/simulation submit.
 * Drives the streak and daily goal (GET /api/me/streak).
 */
export const learnerActivityDays = pgTable(
  'learner_activity_days',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** YYYY-MM-DD in the learner's timezone (users.timezone, falling back to UTC). */
    day: date('day', { mode: 'string' }).notNull(),
    steps: integer('steps').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

export type LearnerActivityDay = typeof learnerActivityDays.$inferSelect
export type InsertLearnerActivityDay = typeof learnerActivityDays.$inferInsert
