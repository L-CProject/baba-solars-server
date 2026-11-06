import { sql } from 'drizzle-orm'
import { check, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { Invoice } from '@/types'
import { quotations } from '../quotations/quotations.model'
import { users } from '../users/users.model'

/** Invoices. Payments are rows in invoice_payments (never lost when an invoice is edited). */
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 40 }).notNull(),
  quotationId: text('quotation_id').references(() => quotations.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 12 }).notNull(),
  paymentStatus: varchar('payment_status', { length: 10 }).notNull(),
  customerName: varchar('customer_name', { length: 120 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull().default(''),
  gstin: varchar('gstin', { length: 15 }).notNull().default(''),
  city: varchar('city', { length: 120 }).notNull().default(''),
  reference: varchar('reference', { length: 120 }).notNull().default(''),
  invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  grandTotal: numeric('grand_total', { precision: 14, scale: 2, mode: 'number' }).notNull(),
  amountPaid: numeric('amount_paid', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
  amountDue: numeric('amount_due', { precision: 14, scale: 2, mode: 'number' }).notNull(),
  /** Full invoice document without payments. */
  data: jsonb('data').$type<Omit<Invoice, 'payments' | 'isOverdue'>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('invoices_number_uq').on(t.invoiceNumber),
  index('invoices_date_idx').on(t.invoiceDate.desc()),
  index('invoices_status_idx').on(t.status, t.paymentStatus),
  index('invoices_due_idx').on(t.dueDate),
  index('invoices_quotation_idx').on(t.quotationId),
  index('invoices_search_trgm').using('gin', sql`(lower(${t.invoiceNumber} || ' ' || ${t.customerName} || ' ' || ${t.phone} || ' ' || ${t.gstin} || ' ' || ${t.city} || ' ' || ${t.reference})) gin_trgm_ops`),
  check('invoices_status_ck', sql`${t.status} in ('draft','issued','cancelled')`),
  check('invoices_payment_ck', sql`${t.paymentStatus} in ('unpaid','partial','paid')`),
  check('invoices_amounts_ck', sql`${t.amountPaid} >= 0 and ${t.amountDue} >= 0`),
])

export const invoicePayments = pgTable('invoice_payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  amount: numeric('amount', { precision: 14, scale: 2, mode: 'number' }).notNull(),
  method: varchar('method', { length: 20 }).notNull(),
  reference: varchar('reference', { length: 120 }).notNull().default(''),
  note: text('note').notNull().default(''),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('invoice_payments_invoice_idx').on(t.invoiceId, t.date),
  check('invoice_payments_amount_ck', sql`${t.amount} > 0`),
  check('invoice_payments_method_ck', sql`${t.method} in ('cash','upi','bank_transfer','cheque','card','loan','other')`),
])
