import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// ── Enums ────────────────────────────────────────────────────────────────────

export const codContentTypeEnum = pgEnum('cod_content_type', ['youtube', 'article'])
export const codContentStatusEnum = pgEnum('cod_content_status', ['active', 'unavailable'])
export const codPathStatusEnum = pgEnum('cod_path_status', ['building', 'active', 'completed', 'failed'])
export const codContentProgressStatusEnum = pgEnum('cod_content_progress_status', ['not_started', 'in_progress', 'completed'])
export const codQuizTypeEnum = pgEnum('cod_quiz_type', ['pretest', 'posttest'])

// ── Shared content pool (written once per unique URL, reused across paths) ───

export const codContentPool = pgTable('cod_content_pool', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  url: text('url').notNull().unique(),
  type: codContentTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  sourceQuery: text('source_query').notNull(),
  youtubeVideoId: text('youtube_video_id'),
  channelTitle: text('channel_title'),
  durationSeconds: integer('duration_seconds'),
  articleText: text('article_text'),
  publishedAt: timestamp('published_at'),
  qualityScore: integer('quality_score').default(0),
  status: codContentStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
})

// ── Per-user COD path ────────────────────────────────────────────────────────

type CodMilestone = { milestoneId: string; title: string; rationale: string; order: number }
type CodDiscoveryProfile = { goals: string; topics: string[]; experienceLevel: string; learningStyle: string }

export const codUserPaths = pgTable('cod_user_paths', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platformId: text('platform_id').notNull().default('ai-amplify'),
  discoveryProfile: jsonb('discovery_profile').$type<CodDiscoveryProfile>(),
  milestones: jsonb('milestones').notNull().$type<CodMilestone[]>().default(sql`'[]'::jsonb`),
  status: codPathStatusEnum('status').notNull().default('building'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('cod_user_paths_user_idx').on(table.userId),
])

// ── Per-user content selection (personalization layer) ───────────────────────

export const codPathContentRefs = pgTable('cod_path_content_refs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  codUserPathId: uuid('cod_user_path_id').notNull().references(() => codUserPaths.id, { onDelete: 'cascade' }),
  contentPoolId: uuid('content_pool_id').notNull().references(() => codContentPool.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').notNull(),
  orderInMilestone: integer('order_in_milestone').notNull().default(0),
  rationale: text('rationale'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('cod_path_content_refs_path_idx').on(table.codUserPathId),
  index('cod_path_content_refs_milestone_idx').on(table.codUserPathId, table.milestoneId),
])

// ── AI-generated quizzes (per milestone, stored once per path) ───────────────

type QuizQuestion = {
  question: string
  options: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  explanation: string
}

export const codMilestoneAssessments = pgTable('cod_milestone_assessments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  codUserPathId: uuid('cod_user_path_id').notNull().references(() => codUserPaths.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').notNull(),
  milestoneTitle: text('milestone_title').notNull(),
  pretestQuestions: jsonb('pretest_questions').$type<QuizQuestion[]>(),
  questions: jsonb('questions').notNull().$type<QuizQuestion[]>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => [
  unique().on(table.codUserPathId, table.milestoneId),
])

// ── Quiz results (per attempt, per user) ─────────────────────────────────────

export const codUserQuizResults = pgTable('cod_user_quiz_results', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codUserPathId: uuid('cod_user_path_id').notNull().references(() => codUserPaths.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').notNull(),
  quizType: codQuizTypeEnum('quiz_type').notNull().default('posttest'),
  score: integer('score').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  passed: boolean('passed').notNull(),
  attemptNumber: integer('attempt_number').notNull().default(1),
  answers: jsonb('answers').$type<number[]>(),
  completedAt: timestamp('completed_at').notNull().default(sql`now()`),
}, (table) => [
  index('cod_quiz_results_user_path_idx').on(table.userId, table.codUserPathId),
])

// ── Per-user content progress ────────────────────────────────────────────────

export const codUserContentProgress = pgTable('cod_user_content_progress', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contentPoolId: uuid('content_pool_id').notNull().references(() => codContentPool.id, { onDelete: 'cascade' }),
  codUserPathId: uuid('cod_user_path_id').notNull().references(() => codUserPaths.id, { onDelete: 'cascade' }),
  status: codContentProgressStatusEnum('status').notNull().default('not_started'),
  videoWatchPct: integer('video_watch_pct').default(0),
  completedAt: timestamp('completed_at'),
}, (table) => [
  unique().on(table.userId, table.contentPoolId, table.codUserPathId),
])

// ── Exported types ────────────────────────────────────────────────────────────

export type CodContentPool = typeof codContentPool.$inferSelect
export type InsertCodContentPool = typeof codContentPool.$inferInsert
export type CodUserPath = typeof codUserPaths.$inferSelect
export type InsertCodUserPath = typeof codUserPaths.$inferInsert
export type CodPathContentRef = typeof codPathContentRefs.$inferSelect
export type InsertCodPathContentRef = typeof codPathContentRefs.$inferInsert
export type CodMilestoneAssessment = typeof codMilestoneAssessments.$inferSelect
export type InsertCodMilestoneAssessment = typeof codMilestoneAssessments.$inferInsert
export type CodUserQuizResult = typeof codUserQuizResults.$inferSelect
export type InsertCodUserQuizResult = typeof codUserQuizResults.$inferInsert
export type CodUserContentProgress = typeof codUserContentProgress.$inferSelect
export type InsertCodUserContentProgress = typeof codUserContentProgress.$inferInsert
export type CodQuizType = 'pretest' | 'posttest'
export type { CodMilestone, CodDiscoveryProfile, QuizQuestion }
