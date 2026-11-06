import { z } from 'zod'
import { lineItems } from '../proposals/proposals.schema'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')
const method = z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'loan', 'other'])
export const paymentBody = z.object({
  date, amount: z.number().finite(), method, reference: z.string().max(120).default(''), note: z.string().max(1000).default(''),
})

export const invoiceBody = z.object({
  documentTitle: z.enum(['Tax Invoice', 'Proforma Invoice', 'Sales Order', 'Bill of Supply']),
  reference: z.string().max(120).default(''),
  invoiceDate: date,
  dueDate: date.nullable().default(null),
  template: z.enum(['classic', 'modern', 'minimal', 'tally']),
  status: z.enum(['draft', 'issued', 'cancelled']),
  quotationId: z.string().max(64).nullable().default(null),
  customerName: z.string().max(120), phone: z.string().max(20).default(''), email: z.string().max(200).default(''),
  address: z.string().max(300).default(''), city: z.string().max(120).default(''), state: z.string().max(60).default(''),
  stateCode: z.string().max(4).default(''), gstin: z.string().max(15).default(''),
  items: lineItems,
  discountType: z.enum(['amount', 'percent']).default('amount'), discountValue: z.number().finite().default(0),
  paymentMethod: z.union([method, z.literal('')]).default(''),
  notes: z.string().max(4000).default(''), terms: z.string().max(8000).default(''),
  initialPayment: paymentBody.nullish(),
  subsidy: z.object({
    show: z.boolean(), auto: z.boolean(), capacityKw: z.number().finite(),
    propertyType: z.enum(['residential', 'commercial', 'industrial', 'housing-society']), systemType: z.enum(['on-grid', 'hybrid', 'off-grid']),
    central: z.number().finite().nullable(), state: z.number().finite().nullable(),
  }).nullish(),
})

/** Same query shape the Billing page already used (q, status, paymentStatus, from, to, page, pageSize, sort). */
export const listInvoicesQuery = z.object({
  q: z.string().trim().max(120).optional().default(''),
  status: z.enum(['draft', 'issued', 'cancelled']).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'overdue']).optional(),
  from: date.optional(), to: date.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'due_asc']).default('date_desc'),
})
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>
export const paymentParams = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), paymentId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
