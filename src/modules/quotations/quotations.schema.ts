import { z } from 'zod'
import { listQuery } from '../../lib/http'
import { lineItems } from '../proposals/proposals.schema'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** Quotation input (numbers, totals, GST split and subsidy are computed by the server). */
export const quotationBody = z.object({
  enquiryId: z.string().max(64).nullish(),
  proposalId: z.string().max(64).nullish(),
  status: z.enum(['pending', 'sent', 'accepted', 'rejected']).default('pending'),
  quoteDate: date,
  validUntil: date.nullable().default(null),
  customerName: z.string().max(120), phone: z.string().max(20).default(''), email: z.string().max(200).default(''),
  city: z.string().max(120).default(''), address: z.string().max(300).optional(), state: z.string().max(60).optional(),
  gstin: z.string().max(15).optional(), consumerNumber: z.string().max(60).optional(), discom: z.string().max(60).optional(),
  sanctionedLoadKw: z.number().finite().nullish(),
  propertyType: z.enum(['residential', 'commercial', 'industrial', 'housing-society']),
  systemType: z.enum(['on-grid', 'hybrid', 'off-grid']),
  roofType: z.enum(['rcc', 'tin', 'ground']).optional(),
  capacityKw: z.number().finite(), monthlyBill: z.number().finite().default(0),
  companyId: z.string().max(64).nullish(), quality: z.enum(['normal', 'premium']).optional(), packagePrice: z.number().finite().nullish(),
  items: lineItems.default([]), discount: z.number().finite().default(0),
  subsidy: z.number().finite().nullable(), stateSubsidy: z.number().finite().nullable(), annualGenerationKwh: z.number().finite().nullable(),
  stateSubsidyScheme: z.string().max(200).nullish(), subsidyAuto: z.boolean().optional(),
  paymentTerms: z.string().max(4000).optional(), terms: z.string().max(8000).optional(), notes: z.string().max(4000).default(''),
}).catchall(z.unknown())

export const quotationStatusBody = z.object({ status: z.enum(['pending', 'sent', 'accepted', 'rejected']) })

export const listQuotationsQuery = listQuery.extend({
  status: z.enum(['pending', 'sent', 'accepted', 'rejected', 'open', 'expired']).optional(),
  enquiryId: z.string().max(64).optional(),
  sort: z.enum(['createdAt', 'quoteDate', 'customerName', 'grandTotal', 'netCost', 'validUntil', 'capacityKw']).default('createdAt'),
  all: z.enum(['1', 'true']).optional(),
})
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuery>
