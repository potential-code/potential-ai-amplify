import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Cached translations of platform content (course names, lesson text, exam
 * questions) for the Multi Learning page. Content lives in the database in
 * English only; each string is translated once per language via potential-ai
 * and kept here, shared by every learner.
 *
 * `source` is the normalised English string (zero-width characters stripped,
 * whitespace collapsed), so the same visible text always resolves to one row.
 */
export const translationCache = pgTable(
  'translation_cache',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** 'catalogue' (names) or 'lesson' (content) — different prompt briefs. */
    domain: text('domain').notNull(),
    /** ar | hi | ur */
    lang: text('lang').notNull(),
    source: text('source').notNull(),
    target: text('target').notNull(),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [unique().on(t.domain, t.lang, t.source), index('translation_cache_lookup_idx').on(t.domain, t.lang)],
)

export type TranslationCacheRow = typeof translationCache.$inferSelect
export type InsertTranslationCacheRow = typeof translationCache.$inferInsert
