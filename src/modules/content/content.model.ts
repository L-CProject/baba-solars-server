import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { users } from '../users/users.model'

/**
 * Singleton settings documents: 'content' (website text, SEO, calculator, plans — everything in
 * SiteContent except offers, which have their own table) and 'business' (GST, bank, numbering).
 * Plus 'site_version', bumped on every website change (published version for cache/prerender).
 */
export const siteSettings = pgTable('site_settings', {
  key: varchar('key', { length: 40 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const SITE_COLLECTIONS = ['pricingPlans', 'capacityPlans', 'services', 'projects', 'testimonials', 'faqs', 'heroSlides', 'gallery'] as const
export type SiteCollection = (typeof SITE_COLLECTIONS)[number]

/**
 * Website content lists (pricing plans, services, projects, reviews, FAQs, banner slides, gallery).
 * The card fields vary per list and are only ever edited as a whole, so they are stored as a
 * validated JSON document; the columns used for publishing, ordering and URLs are real columns.
 */
export const siteItems = pgTable('site_items', {
  collection: varchar('collection', { length: 20 }).notNull(),
  id: text('id').notNull(),
  status: varchar('status', { length: 10 }).notNull().default('published'),
  sortOrder: integer('sort_order').notNull().default(0),
  slug: varchar('slug', { length: 120 }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.collection, t.id] }),
  uniqueIndex('site_items_slug_uq').on(t.collection, t.slug),
  index('site_items_list_idx').on(t.collection, t.status, t.sortOrder),
  check('site_items_collection_ck', sql.raw(`collection in ('pricingPlans','capacityPlans','services','projects','testimonials','faqs','heroSlides','gallery')`)),
  check('site_items_status_ck', sql`${t.status} in ('published','draft')`),
])
