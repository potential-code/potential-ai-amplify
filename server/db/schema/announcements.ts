import { pgTable, uuid, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Announcements from the AI Amplify team: shown as a banner on the audience's
 * dashboard (until `bannerUntil`), and optionally sent as a bell notification
 * and as an email to people who haven't turned announcement emails off.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    title: text('title').notNull(),
    body: text('body').notNull(),
    linkUrl: text('link_url'),
    linkLabel: text('link_label'),
    /** learners | mentors | all */
    audience: text('audience').notNull().default('learners'),
    showBanner: boolean('show_banner').notNull().default(true),
    bannerUntil: timestamp('banner_until'),
    notified: boolean('notified').notNull().default(false),
    emailed: boolean('emailed').notNull().default(false),
    emailRecipients: integer('email_recipients').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
    /** Set when an admin takes the banner down early. */
    archivedAt: timestamp('archived_at'),
  },
  (t) => [index('announcements_created_idx').on(t.createdAt)],
)

export type Announcement = typeof announcements.$inferSelect
