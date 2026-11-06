import { sql } from 'drizzle-orm'
import { check, index, numeric, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

/** Products, materials, services and charges used in proposals, quotations and invoices. */
export const catalogItems = pgTable('catalog_items', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  sku: varchar('sku', { length: 60 }).notNull().default(''),
  description: text('description').notNull().default(''),
  hsn: varchar('hsn', { length: 12 }).notNull().default(''),
  unit: varchar('unit', { length: 20 }).notNull().default('Nos'),
  rate: numeric('rate', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2, mode: 'number' }).notNull().default(18),
  category: varchar('category', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('catalog_category_idx').on(t.category),
  index('catalog_name_trgm').using('gin', sql`(lower(${t.name} || ' ' || ${t.sku} || ' ' || ${t.hsn} || ' ' || ${t.description})) gin_trgm_ops`),
  check('catalog_category_ck', sql`${t.category} in ('kit','bos','service','expense')`),
  check('catalog_rate_ck', sql`${t.rate} >= 0 and ${t.gstRate} >= 0 and ${t.gstRate} <= 28`),
])
