import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * A learner's report of an AI answer (Anna, the course helper, the AI
 * mentors…): what was wrong, the answer itself and the question before it,
 * for an admin to review on Admin → AI safety.
 */
export const aiReports = pgTable('ai_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** Kept when the account is deleted, so the report itself isn't lost. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** Which AI: ask-sana, course-help, multi-learning, examiner, mentor:<slug>… */
  surface: text('surface').notNull(),
  /** wrong | harmful | inappropriate | unhelpful | other */
  reason: text('reason').notNull(),
  note: text('note'),
  /** The reported answer, as shown to the learner. */
  reply: text('reply').notNull(),
  /** The learner's message it answered, when known. */
  question: text('question'),
  /** The page it was reported from. */
  page: text('page'),
  /** open | reviewed | dismissed */
  status: text('status').notNull().default('open'),
  adminNote: text('admin_note'),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [index('ai_reports_status_created_idx').on(t.status, t.createdAt)])

export type AiReport = typeof aiReports.$inferSelect
