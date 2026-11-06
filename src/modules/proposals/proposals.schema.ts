import { z } from 'zod'
import { listQuery } from '../../lib/http'

const lineItem = z.object({
  id: z.string().max(64), name: z.string().max(300), sku: z.string().max(60).optional(), description: z.string().max(2000).default(''),
  hsn: z.string().max(12).default(''), unit: z.string().max(20).default('Nos'), quantity: z.number().finite(), rate: z.number().finite(),
  discountPct: z.number().finite().default(0), gstRate: z.number().finite(),
})
export const lineItems = z.array(lineItem).max(300)

/** Proposal input (totals, numbers and timestamps are always computed by the server). */
export const proposalBody = z.object({
  enquiryId: z.string().max(64).nullable().default(null),
  quotationId: z.string().max(64).nullable().optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'converted']).default('draft'),
  proposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200),
  customerName: z.string().max(120), phone: z.string().max(20).default(''), email: z.string().max(200).default(''),
  address: z.string().max(300).default(''), city: z.string().max(120).default(''), state: z.string().max(60).default(''),
  propertyType: z.enum(['residential', 'commercial', 'industrial', 'housing-society']),
  systemType: z.enum(['on-grid', 'hybrid', 'off-grid']),
  roofType: z.enum(['rcc', 'tin', 'ground']),
  capacityKw: z.number().finite(), monthlyBill: z.number().finite().default(0),
  consumerNumber: z.string().max(60).default(''), discom: z.string().max(60).default(''),
  companyId: z.string().max(64).nullable().default(null), quality: z.enum(['normal', 'premium']).default('normal'),
  items: lineItems.default([]), discount: z.number().finite().default(0),
  scope: z.array(z.string().max(500)).max(50).default([]),
  paymentTerms: z.string().max(4000).default(''), terms: z.string().max(8000).default(''), notes: z.string().max(4000).default(''),
}).catchall(z.unknown())

export const proposalStatusBody = z.object({ status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'converted']) })

export const listProposalsQuery = listQuery.extend({
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'converted', 'open', 'expired']).optional(),
  enquiryId: z.string().max(64).optional(),
  sort: z.enum(['createdAt', 'proposalDate', 'customerName', 'grandTotal', 'validUntil', 'capacityKw']).default('createdAt'),
  all: z.enum(['1', 'true']).optional(),
})
export type ListProposalsQuery = z.infer<typeof listProposalsQuery>
