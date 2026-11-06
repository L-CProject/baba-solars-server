import { sql } from 'drizzle-orm'
import { check, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { Quotation } from '@/types'
import { enquiries } from '../enquiries/enquiries.model'
import { proposals } from '../proposals/proposals.model'

export const quotations = pgTable('quotations', {
  id: text('id').primaryKey(),
  quoteNumber: varchar('quote_number', { length: 40 }),
  enquiryId: text('enquiry_id').references(() => enquiries.id, { onDelete: 'set null' }),
  proposalId: text('proposal_id').references(() => proposals.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 12 }).notNull(),
  customerName: varchar('customer_name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull().default(''),
  city: varchar('city', { length: 120 }).notNull().default(''),
  capacityKw: numeric('capacity_kw', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  grandTotal: numeric('grand_total', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
  netCost: numeric('net_cost', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
  quoteDate: date('quote_date', { mode: 'string' }),
  validUntil: date('valid_until', { mode: 'string' }),
  data: jsonb('data').$type<Quotation>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('quotations_number_uq').on(t.quoteNumber),
  index('quotations_status_idx').on(t.status),
  index('quotations_enquiry_idx').on(t.enquiryId),
  index('quotations_proposal_idx').on(t.proposalId),
  index('quotations_created_idx').on(t.createdAt.desc()),
  index('quotations_search_trgm').using('gin', sql`(lower(coalesce(${t.quoteNumber}, '') || ' ' || ${t.customerName} || ' ' || ${t.phone} || ' ' || ${t.city})) gin_trgm_ops`),
  check('quotations_status_ck', sql`${t.status} in ('pending','sent','accepted','rejected')`),
])
