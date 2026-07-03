import { pgTable, uuid, text, timestamp, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { learningBlocks } from './courses'

export const learningQuestionTypeEnum = pgEnum('learning_question_type', ['single', 'multi', 'scale', 'text'])
export const learningPathStatusEnum = pgEnum('learning_path_status', ['active', 'archived'])

// learningThemes — Graph A output
export const learningThemes = pgTable('learning_themes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  platformId: text('platform_id').notNull().default('ai-amplify'),
  title: text('title').notNull(),
  description: text('description'),
  order: integer('order').notNull().default(0),
  setupVersion: integer('setup_version').notNull().default(1),
  generatedAt: timestamp('generated_at').notNull().default(sql`now()`),
})

// learningThemeBlocks — theme ↔ existing learningBlocks membership
export const learningThemeBlocks = pgTable('learning_theme_blocks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  themeId: uuid('theme_id').notNull().references(() => learningThemes.id, { onDelete: 'cascade' }),
  learningBlockId: uuid('learning_block_id').notNull().references(() => learningBlocks.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
}, (table) => [
  index('learning_theme_blocks_theme_idx').on(table.themeId),
])

// learningQuestions — Graph A questionnaire
export const learningQuestions = pgTable('learning_questions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  platformId: text('platform_id').notNull().default('ai-amplify'),
  prompt: text('prompt').notNull(),
  type: learningQuestionTypeEnum('type').notNull(),
  options: text('options').array(),
  order: integer('order').notNull().default(0),
  setupVersion: integer('setup_version').notNull().default(1),
})

// userQuestionnaireAnswers — submitted answers
export const userQuestionnaireAnswers = pgTable('user_questionnaire_answers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('user_questionnaire_answers_user_idx').on(table.userId),
])

type Milestone = {
  themeId: string
  order: number
  rationale: string
  blocks: { blockId: string; order: number; reason: string }[]
}

// userLearningPath — Graph B output (header + jsonb milestones)
export const userLearningPath = pgTable('user_learning_path', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platformId: text('platform_id').notNull().default('ai-amplify'),
  status: learningPathStatusEnum('status').notNull().default('active'),
  basedOnSetupVersion: integer('based_on_setup_version').notNull().default(1),
  generatedAt: timestamp('generated_at').notNull().default(sql`now()`),
  milestones: jsonb('milestones').notNull().$type<Milestone[]>(),
}, (table) => [
  index('user_learning_path_user_idx').on(table.userId),
])

export type LearningTheme = typeof learningThemes.$inferSelect
export type InsertLearningTheme = typeof learningThemes.$inferInsert
export type LearningThemeBlock = typeof learningThemeBlocks.$inferSelect
export type InsertLearningThemeBlock = typeof learningThemeBlocks.$inferInsert
export type LearningQuestion = typeof learningQuestions.$inferSelect
export type InsertLearningQuestion = typeof learningQuestions.$inferInsert
export type UserQuestionnaireAnswer = typeof userQuestionnaireAnswers.$inferSelect
export type InsertUserQuestionnaireAnswer = typeof userQuestionnaireAnswers.$inferInsert
export type UserLearningPath = typeof userLearningPath.$inferSelect
export type InsertUserLearningPath = typeof userLearningPath.$inferInsert
