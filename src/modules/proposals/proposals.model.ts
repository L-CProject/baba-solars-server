import { sql } from 'drizzle-orm'
import { check, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { Proposal } from '@/types'
import { enquiries } from '../enquiries/enquiries.model'

/** Proposals. Searchable/filterable fields are columns; the full document (items, scope, terms) is in `data`. */
export const proposals = pgTable('proposals', {
  id: text('id').primaryKey(),
  proposalNumber: varchar('proposal_number', { length: 40 }).notNull(),
  enquiryId: text('enquiry_id').references(() => enquiries.id, { onDelete: 'set null' }),
  /** Quotation made from this proposal (app-level link; the quotation holds the foreign key). */
  quotationId: text('quotation_id'),
  status: varchar('status', { length: 12 }).notNull(),
  customerName: varchar('customer_name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull().default(''),
  city: varchar('city', { length: 120 }).notNull().default(''),
  capacityKw: numeric('capacity_kw', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  grandTotal: numeric('grand_total', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
  proposalDate: date('proposal_date', { mode: 'string' }).notNull(),
  validUntil: date('valid_until', { mode: 'string' }),
  data: jsonb('data').$type<Proposal>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('proposals_number_uq').on(t.proposalNumber),
  index('proposals_status_idx').on(t.status),
  index('proposals_enquiry_idx').on(t.enquiryId),
  index('proposals_created_idx').on(t.createdAt.desc()),
  index('proposals_search_trgm').using('gin', sql`(lower(${t.proposalNumber} || ' ' || ${t.customerName} || ' ' || ${t.phone} || ' ' || ${t.city})) gin_trgm_ops`),
  check('proposals_status_ck', sql`${t.status} in ('draft','sent','accepted','rejected','converted')`),
])
