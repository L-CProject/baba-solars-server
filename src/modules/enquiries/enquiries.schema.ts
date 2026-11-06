import { z } from 'zod'
import { CONTACT_OUTCOMES, ENQUIRY_SOURCES, ENQUIRY_STATUS_VALUES, LEGACY_STATUS, WEBSITE_SOURCES } from '@/lib/enquiries'
import type { EnquiryStatus } from '@/types'
import { listQuery } from '../../lib/http'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date (YYYY-MM-DD).')
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id.')
/** Optional text: missing / null → '' (trimmed, length-capped). */
const text = (max: number) => z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(max, `Use at most ${max} characters.`)).default('')
const num = (min: number, max: number) => z.number().finite().min(min).max(max)

export const statusSchema = z.preprocess(
  (v) => (typeof v === 'string' && LEGACY_STATUS[v] ? LEGACY_STATUS[v] : v),
  z.enum(ENQUIRY_STATUS_VALUES as [EnquiryStatus, ...EnquiryStatus[]], { message: 'Choose a valid status.' }),
)
const sourceSchema = z.enum(ENQUIRY_SOURCES.map((s) => s.value) as [string, ...string[]], { message: 'Choose a valid source.' })
const propertyType = z.enum(['residential', 'commercial', 'industrial', 'housing-society'])
const systemType = z.enum(['on-grid', 'hybrid', 'off-grid'])
const capacityChoice = z.enum(['custom', 'not-sure'], { message: 'Choose a valid capacity.' })


export const estimateSchema = z.object({
  capacityKw: num(0, 100000),
  systemType,
  propertyType,
  roofType: z.enum(['rcc', 'tin', 'ground']).optional(),
  monthlyBill: num(0, 1e8),
  monthlyUnits: num(0, 1e8).optional(),
  estimatedCost: num(0, 1e10),
  subsidy: num(0, 1e9),
  netCost: num(0, 1e10),
  companyId: z.string().max(64).nullable().optional(),
  quality: z.enum(['normal', 'premium']).optional(),
  stateCode: z.string().max(4).optional(),
  discomId: z.string().max(40).optional(),
  tariffVerified: z.boolean().optional(),
})

/** Admin create / edit (business rules are checked again by validateEnquiry). */
export const enquirySaveBody = z.object({
  id: id.optional(),
  name: text(120),
  phone: text(20),
  email: text(200),
  city: text(120),
  address: text(300),
  state: text(60),
  pincode: text(6),
  service: text(200),
  message: text(4000),
  source: sourceSchema.default('manual'),
  status: statusSchema.default('new'),
  propertyType: propertyType.nullish(),
  enquiryType: z.enum(['home', 'commercial']).nullish(),
  capacityKw: num(0, 100000).nullish(),
  capacityChoice: capacityChoice.nullish(),
  monthlyBill: num(0, 1e8).nullish(),
  notes: text(4000),
  followUpOn: isoDate.nullish(),
  assignedTo: id.nullish(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  estimate: estimateSchema.nullish(),
})
export type EnquirySaveBody = z.infer<typeof enquirySaveBody>

export const saveQuery = z.object({ createProposal: z.enum(['true', 'false', '1', '0']).optional().transform((v) => v === 'true' || v === '1') })

/**
 * Website contact / service / pricing forms. Every field is optional except the contact rule
 * (mobile OR email, checked in the service so both fields get the same message).
 * Empty strings and null are accepted for "not given".
 */
export const publicEnquiryBody = z.object({
  name: text(120),
  phone: text(20),
  email: text(200),
  city: text(120),
  state: text(60),
  service: text(200),
  message: text(4000),
  source: z.enum(WEBSITE_SOURCES as [string, ...string[]]).default('contact'),
  enquiryType: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(['home', 'commercial'], { message: 'Choose Home / Residential or Commercial.' }).optional()),
  propertyType: propertyType.optional(),
  capacityKw: z.preprocess((v) => (v === '' ? null : v), num(0, 100000).nullish()),
  capacityChoice: z.preprocess((v) => (v === '' ? null : v), capacityChoice.nullish()),
  monthlyBill: num(0, 1e8).nullish(),
  submissionId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).optional(),
  createdAt: z.string().max(40).optional(),
  /** Honeypot: real visitors never fill this hidden field. */
  website: z.string().max(200).optional(),
})
export type PublicEnquiryBody = z.infer<typeof publicEnquiryBody>

/** Website calculator "Request this quote" (the server prices it again). */
export const quoteRequestBody = z.object({
  customerName: z.string().trim().max(120),
  phone: z.string().trim().max(20),
  email: text(200),
  city: text(120),
  propertyType,
  systemType,
  roofType: z.enum(['rcc', 'tin', 'ground']).optional(),
  capacityKw: num(0, 10000),
  monthlyBill: num(0, 1e8).default(0),
  tariff: num(0, 100).optional(),
  companyId: z.string().max(64).nullish(),
  quality: z.enum(['normal', 'premium']).optional(),
  stateCode: z.string().max(4).optional(),
  discomId: z.string().max(40).optional(),
  monthlyUnits: num(0, 1e8).optional(),
  tariffVerified: z.boolean().optional(),
  submissionId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).optional(),
  createdAt: z.string().max(40).optional(),
  website: z.string().max(200).optional(),
})
export type QuoteRequestBody = z.infer<typeof quoteRequestBody>

export const listEnquiriesQuery = listQuery.extend({
  /** One status or several, comma-separated. `open` = every status that is not closed. */
  status: z.string().max(200).optional(),
  /** A source value, or an origin group: website | admin | import */
  source: z.string().max(20).optional(),
  /** User id, `me` or `unassigned`. */
  assignedTo: z.string().max(64).optional(),
  /** due = today or earlier, overdue = before today, today, upcoming = after today, any = has a follow-up */
  followUp: z.enum(['due', 'overdue', 'today', 'upcoming', 'any']).optional(),
  enquiryType: z.enum(['home', 'commercial']).optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'name', 'status', 'followUpOn', 'capacityKw', 'lastContactedAt']).default('createdAt'),
})
export type ListEnquiriesQuery = z.infer<typeof listEnquiriesQuery>

export const statusBody = z.object({
  status: statusSchema,
  note: text(2000),
  /** Required when the status is "Follow-up Required" and no follow-up is scheduled. */
  followUpOn: isoDate.nullish(),
})

export const assignBody = z.object({ userId: id.nullable(), note: text(500) })

export const activityBody = z.object({
  type: z.enum(['call', 'whatsapp', 'email', 'meeting', 'note']),
  outcome: z.enum(CONTACT_OUTCOMES.map((o) => o.value) as [string, ...string[]]).nullish(),
  note: text(4000),
  /** Optional status change in the same step (e.g. after a call). */
  status: statusSchema.optional(),
  /** Optional next follow-up in the same step. */
  followUpOn: isoDate.nullish(),
}).refine((a) => a.type !== 'note' || a.note.length > 0, { message: 'Write the note.', path: ['note'] })

export const followUpBody = z.object({
  dueOn: isoDate,
  note: text(2000),
  assignedTo: id.nullish(),
})
export const followUpUpdateBody = z.object({
  status: z.enum(['done', 'cancelled']),
  note: text(2000),
})
export const followUpParams = z.object({ id, followUpId: id })

export const importBody = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000) })
export const exportBody = z.object({ ids: z.array(id).max(10000).optional() })
