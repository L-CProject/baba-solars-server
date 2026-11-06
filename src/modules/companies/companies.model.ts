import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import type { Company } from '@/types'

/** Panel/inverter companies and their package price lists (used by the calculator, proposals, quotations). */
export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Packages, quality specs, warranties (validated on save). */
  data: jsonb('data').$type<Omit<Company, 'id' | 'name' | 'isActive' | 'order' | 'updatedAt'>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('companies_order_idx').on(t.sortOrder)])
