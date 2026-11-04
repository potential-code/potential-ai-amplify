import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Homepage "Stay in the loop" sign-ups. One row per address; re-subscribing is a
 * no-op. Unsubscribing sets `unsubscribedAt` rather than deleting, so the
 * opt-out is remembered.
 */
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  source: text('source').notNull().default('homepage'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  unsubscribedAt: timestamp('unsubscribed_at'),
})

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect
