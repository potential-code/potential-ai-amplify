import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Partner organisations (a ministry, university, corporate, incubator…) whose
 * learners AI Amplify tracks together. Learners join with the organisation's
 * reusable sign-up code (/sign-up?org=CODE) or an admin adds them; partner
 * contacts (users with role 'partner' and this organisation_id) see a
 * read-only dashboard of those learners.
 */
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  /** government | university | corporate | incubator | investor | other */
  type: text('type').notNull().default('other'),
  joinCode: text('join_code').notNull().unique(),
  joinEnabled: boolean('join_enabled').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  archivedAt: timestamp('archived_at'),
})

/** An emailed link for a partner contact to set up their login (like mentor setup). */
export const partnerInvites = pgTable(
  'partner_invites',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organisationId: uuid('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [index('partner_invites_org_idx').on(t.organisationId)],
)

export type Organisation = typeof organisations.$inferSelect
export type PartnerInvite = typeof partnerInvites.$inferSelect
