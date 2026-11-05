import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { courses } from './courses'

/**
 * One finished AI Examiner attempt (Anna's mystery-shopper role-play, graded
 * against the chosen course). Dimensions are a flexible {key: score} map, not
 * fixed columns, so the rubric can evolve without migrations.
 *
 * The scorecard is relayed by the learner's browser (the record_assessment
 * frontend tool), so this is a practice record, not a certified result. If
 * attempts ever gate certificates, write the row server-side from the agent
 * thread instead of trusting this POST.
 */
export const examinerAttempts = pgTable(
  'examiner_attempts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** text | voice | video */
    mode: text('mode').notNull(),
    /** The scene card's title, e.g. "A frustrated client calls your agency". */
    scenario: text('scenario').notNull(),
    overallScore: integer('overall_score').notNull(),
    /** {courseKnowledge, application, communication, problemSolving, professionalism} — each 0-100 */
    dimensions: jsonb('dimensions').notNull().$type<Record<string, number>>(),
    strengths: jsonb('strengths').notNull().$type<string[]>(),
    improvements: jsonb('improvements').notNull().$type<string[]>(),
    feedback: text('feedback').notNull(),
    /** [{role: 'customer' | 'learner', text}] */
    transcript: jsonb('transcript').notNull().$type<Array<{ role: string; text: string }>>(),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [index('examiner_attempts_user_created_idx').on(t.userId, t.createdAt)],
)

export type ExaminerAttempt = typeof examinerAttempts.$inferSelect
export type InsertExaminerAttempt = typeof examinerAttempts.$inferInsert
