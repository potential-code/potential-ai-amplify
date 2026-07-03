import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// ── Enums ────────────────────────────────────────────────────────────────────

export const bothContentTypeEnum = pgEnum('both_content_type', ['youtube', 'article'])
export const bothContentStatusEnum = pgEnum('both_content_status', ['active', 'unavailable'])
export const bothPathStatusEnum = pgEnum('both_path_status', ['building', 'active', 'completed', 'failed'])
export const bothItemProgressStatusEnum = pgEnum('both_item_progress_status', ['not_started', 'in_progress', 'completed'])
export const bothItemTypeEnum = pgEnum('both_item_type', ['external', 'internal'])
export const bothQuizTypeEnum = pgEnum('both_quiz_type', ['pretest', 'posttest'])

// ── Shared external content pool (written once per unique URL, reused across paths) ──

export const bothContentPool = pgTable('both_content_pool', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  url: text('url').notNull().unique(),
  type: bothContentTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  sourceQuery: text('source_query').notNull(),
  youtubeVideoId: text('youtube_video_id'),
  channelTitle: text('channel_title'),
  durationSeconds: integer('duration_seconds'),
  articleText: text('article_text'),
  publishedAt: timestamp('published_at'),
  qualityScore: integer('quality_score').default(0),
  status: bothContentStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
})

// ── Per-user Both path header ─────────────────────────────────────────────────

/** Stored milestone shape inside the jsonb column. */
type BothMilestone = { milestoneId: string; title: string; rationale: string; order: number }

/** Stored discovery profile shape inside the jsonb column. */
type BothDiscoveryProfile = { goals: string; topics: string[]; experienceLevel: string; learningStyle: string }

export const bothUserPaths = pgTable('both_user_paths', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platformId: text('platform_id').notNull().default('ai-amplify'),
  discoveryProfile: jsonb('discovery_profile').$type<BothDiscoveryProfile>(),
  milestones: jsonb('milestones').notNull().$type<BothMilestone[]>().default(sql`'[]'::jsonb`),
  status: bothPathStatusEnum('status').notNull().default('building'),
  /** Count of internal SMEEP blocks included in this path (populated after build). */
  internalBlockCount: integer('internal_block_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('both_user_paths_user_idx').on(table.userId),
])

// ── Per-user external content selection (personalization layer) ───────────────

export const bothPathContentRefs = pgTable('both_path_content_refs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bothUserPathId: uuid('both_user_path_id').notNull().references(() => bothUserPaths.id, { onDelete: 'cascade' }),
  contentPoolId: uuid('content_pool_id').notNull().references(() => bothContentPool.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').notNull(),
  orderInMilestone: integer('order_in_milestone').notNull().default(0),
  rationale: text('rationale'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('both_path_content_refs_path_idx').on(table.bothUserPathId),
  index('both_path_content_refs_milestone_idx').on(table.bothUserPathId, table.milestoneId),
])

// ── Per-user internal SMEEP block refs ───────────────────────────────────────
//
// No FK to learning_blocks because this is a cross-schema polymorphic reference.
// The blockId is validated at the service layer when building the path.

export const bothPathBlockRefs = pgTable('both_path_block_refs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bothUserPathId: uuid('both_user_path_id').notNull().references(() => bothUserPaths.id, { onDelete: 'cascade' }),
  /** References learning_blocks.id — no FK (cross-schema, polymorphic). */
  blockId: uuid('block_id').notNull(),
  milestoneId: text('milestone_id').notNull(),
  orderInMilestone: integer('order_in_milestone').notNull().default(0),
  rationale: text('rationale'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('both_path_block_refs_path_idx').on(table.bothUserPathId),
  index('both_path_block_refs_milestone_idx').on(table.bothUserPathId, table.milestoneId),
])

// ── AI-generated quizzes (per milestone, stored once per path) ────────────────

type QuizQuestion = {
  question: string
  options: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  explanation: string
}

export const bothMilestoneAssessments = pgTable('both_milestone_assessments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bothUserPathId: uuid('both_user_path_id').notNull().references(() => bothUserPaths.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').notNull(),
  milestoneTitle: text('milestone_title').notNull(),
  pretestQuestions: jsonb('pretest_questions').$type<QuizQuestion[]>(),
  questions: jsonb('questions').notNull().$type<QuizQuestion[]>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => [
  unique().on(table.bothUserPathId, table.milestoneId),
])

// ── Quiz results (per attempt, per user) ──────────────────────────────────────

export const bothUserQuizResults = pgTable('both_user_quiz_results', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bothUserPathId: uuid('both_user_path_id').notNull().references(() => bothUserPaths.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').notNull(),
  quizType: bothQuizTypeEnum('quiz_type').notNull().default('posttest'),
  score: integer('score').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  passed: boolean('passed').notNull(),
  attemptNumber: integer('attempt_number').notNull().default(1),
  answers: jsonb('answers').$type<number[]>(),
  completedAt: timestamp('completed_at').notNull().default(sql`now()`),
}, (table) => [
  index('both_quiz_results_user_path_idx').on(table.userId, table.bothUserPathId),
])

// ── Unified item progress (external content + internal blocks in one table) ───
//
// itemType discriminates: 'external' → itemId = contentPoolId from both_content_pool
//                         'internal' → itemId = blockId from learning_blocks
// No FK on itemId to support the polymorphic reference safely.

export const bothUserItemProgress = pgTable('both_user_item_progress', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Discriminates the item: 'external' = content pool entry, 'internal' = learning block. */
  itemType: bothItemTypeEnum('item_type').notNull(),
  /** contentPoolId (external) or blockId (internal) — no FK (polymorphic). */
  itemId: uuid('item_id').notNull(),
  bothUserPathId: uuid('both_user_path_id').notNull().references(() => bothUserPaths.id, { onDelete: 'cascade' }),
  milestoneId: text('milestone_id').notNull(),
  status: bothItemProgressStatusEnum('status').notNull().default('not_started'),
  videoWatchPct: integer('video_watch_pct').default(0),
  completedAt: timestamp('completed_at'),
}, (table) => [
  unique().on(table.userId, table.itemType, table.itemId, table.bothUserPathId),
])

// ── Exported types ─────────────────────────────────────────────────────────────

export type BothContentPool = typeof bothContentPool.$inferSelect
export type InsertBothContentPool = typeof bothContentPool.$inferInsert
export type BothUserPath = typeof bothUserPaths.$inferSelect
export type InsertBothUserPath = typeof bothUserPaths.$inferInsert
export type BothPathContentRef = typeof bothPathContentRefs.$inferSelect
export type InsertBothPathContentRef = typeof bothPathContentRefs.$inferInsert
export type BothPathBlockRef = typeof bothPathBlockRefs.$inferSelect
export type InsertBothPathBlockRef = typeof bothPathBlockRefs.$inferInsert
export type BothMilestoneAssessment = typeof bothMilestoneAssessments.$inferSelect
export type InsertBothMilestoneAssessment = typeof bothMilestoneAssessments.$inferInsert
export type BothUserQuizResult = typeof bothUserQuizResults.$inferSelect
export type InsertBothUserQuizResult = typeof bothUserQuizResults.$inferInsert
export type BothUserItemProgress = typeof bothUserItemProgress.$inferSelect
export type InsertBothUserItemProgress = typeof bothUserItemProgress.$inferInsert
export type BothQuizType = 'pretest' | 'posttest'
export type { BothMilestone, BothDiscoveryProfile, QuizQuestion as BothQuizQuestion }
