import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * One AI answer and the learner's message before it, saved only for learners
 * who belong to an organisation (their partner can read them; learners are
 * told at sign-up and on their profile). Covers Anna, the course helper, the
 * tutor, the journeys and the AI mentors. Nothing is saved for anyone else.
 */
export const aiTurns = pgTable('ai_turns', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Which AI: ask-sana, course-help, multi-learning, mentor:<slug>… */
  surface: text('surface').notNull(),
  /** The chat's id for the answer, so the same answer is saved once. */
  messageId: text('message_id').notNull(),
  question: text('question'),
  answer: text('answer').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  uniqueIndex('ai_turns_user_message_idx').on(t.userId, t.messageId),
  index('ai_turns_user_created_idx').on(t.userId, t.createdAt),
])

export type AiTurn = typeof aiTurns.$inferSelect
