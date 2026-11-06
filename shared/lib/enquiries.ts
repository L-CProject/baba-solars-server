import type { CapacityChoice, ContactOutcome, Enquiry, EnquiryActivityType, EnquiryOrigin, EnquirySource, EnquiryStatus, EnquiryType, FieldErrors, PropertyType } from '@/types'

/** Enquiry rules shared by the website forms, the admin panel and the Excel import. Pure functions. */

/**
 * Lead statuses, in pipeline order. One status per lead; every change is logged as an activity.
 * Based on common CRM practice (one mutually exclusive status, separate "needs follow-up" and
 * "closed won / lost" states, a reason when a lead is lost) plus the solar steps this business
 * already used: site visit (survey), proposal and quotation.
 */
export const ENQUIRY_STATUSES: Array<{ value: EnquiryStatus; label: string; hint: string }> = [
  { value: 'new', label: 'New', hint: 'Just received — nobody has looked at it yet.' },
  { value: 'pending', label: 'Pending', hint: 'Seen, but the customer has not been reached yet.' },
  { value: 'contacted', label: 'Contacted', hint: 'Spoke to / messaged the customer.' },
  { value: 'follow-up', label: 'Follow-up Required', hint: 'Call or message again on the follow-up date.' },
  { value: 'interested', label: 'Interested', hint: 'Customer wants to go ahead — plan a site visit or quote.' },
  { value: 'site-visit', label: 'Site Visit', hint: 'Roof survey planned or done.' },
  { value: 'proposal', label: 'Proposal Sent', hint: 'A proposal was prepared / shared.' },
  { value: 'quoted', label: 'Quotation Sent', hint: 'A formal quotation was shared.' },
  { value: 'converted', label: 'Converted', hint: 'Customer booked — order won.' },
  { value: 'not-interested', label: 'Not Interested', hint: 'Lost — note the reason.' },
  { value: 'closed', label: 'Closed', hint: 'Duplicate, invalid, or no response after several tries.' },
]
export const ENQUIRY_STATUS_LABEL = Object.fromEntries(ENQUIRY_STATUSES.map((s) => [s.value, s.label])) as Record<EnquiryStatus, string>
export const ENQUIRY_STATUS_VALUES = ENQUIRY_STATUSES.map((s) => s.value)
/** Leads that need no more work. */
export const CLOSED_STATUSES: EnquiryStatus[] = ['converted', 'not-interested', 'closed']
export const isClosedStatus = (s: EnquiryStatus) => CLOSED_STATUSES.includes(s)
/** Statuses that need a follow-up date. */
export const FOLLOW_UP_STATUSES: EnquiryStatus[] = ['follow-up']
/** Statuses written by older versions of the app → current status. */
export const LEGACY_STATUS: Record<string, EnquiryStatus> = { won: 'converted', lost: 'not-interested' }

export const ACTIVITY_LABEL: Record<EnquiryActivityType, string> = {
  created: 'Enquiry received',
  updated: 'Details updated',
  status: 'Status changed',
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  meeting: 'Meeting / site visit',
  note: 'Note',
  'follow-up-scheduled': 'Follow-up scheduled',
  'follow-up-done': 'Follow-up done',
  'follow-up-cancelled': 'Follow-up cancelled',
  assigned: 'Assigned',
  imported: 'Imported',
}
/** Activities an admin logs by hand (communication tracking). */
export const CONTACT_ACTIVITIES: Array<{ value: Extract<EnquiryActivityType, 'call' | 'whatsapp' | 'email' | 'meeting' | 'note'>; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting / site visit' },
  { value: 'note', label: 'Note only' },
]
export const CONTACT_OUTCOMES: Array<{ value: ContactOutcome; label: string; for: Array<'call' | 'whatsapp' | 'email' | 'meeting'> }> = [
  { value: 'connected', label: 'Connected / spoke', for: ['call', 'meeting'] },
  { value: 'no-answer', label: 'No answer', for: ['call', 'whatsapp', 'email'] },
  { value: 'busy', label: 'Busy / call later', for: ['call'] },
  { value: 'switched-off', label: 'Switched off / not reachable', for: ['call'] },
  { value: 'wrong-number', label: 'Wrong number', for: ['call', 'whatsapp'] },
  { value: 'callback-requested', label: 'Asked to call back', for: ['call', 'whatsapp'] },
  { value: 'message-sent', label: 'Message sent', for: ['whatsapp', 'email'] },
  { value: 'replied', label: 'Customer replied', for: ['whatsapp', 'email'] },
]
export const OUTCOME_LABEL = Object.fromEntries(CONTACT_OUTCOMES.map((o) => [o.value, o.label])) as Record<ContactOutcome, string>

export const ENQUIRY_SOURCES: Array<{ value: EnquirySource; label: string; origin: EnquiryOrigin }> = [
  { value: 'contact', label: 'Website – contact form', origin: 'website' },
  { value: 'calculator', label: 'Website – calculator', origin: 'website' },
  { value: 'pricing', label: 'Website – pricing page', origin: 'website' },
  { value: 'service', label: 'Website – service page', origin: 'website' },
  { value: 'whatsapp', label: 'WhatsApp', origin: 'admin' },
  { value: 'phone', label: 'Phone call', origin: 'admin' },
  { value: 'walk-in', label: 'Walk-in / office', origin: 'admin' },
  { value: 'referral', label: 'Referral', origin: 'admin' },
  { value: 'social', label: 'Social media', origin: 'admin' },
  { value: 'other', label: 'Other external', origin: 'admin' },
  { value: 'manual', label: 'Manual entry', origin: 'admin' },
  { value: 'import', label: 'Excel import', origin: 'import' },
]
export const SOURCE_LABEL = Object.fromEntries(ENQUIRY_SOURCES.map((s) => [s.value, s.label])) as Record<EnquirySource, string>
/** Sources an admin can pick in the manual form. */
export const ADMIN_SOURCES = ENQUIRY_SOURCES.filter((s) => s.origin === 'admin')
export const WEBSITE_SOURCES: EnquirySource[] = ENQUIRY_SOURCES.filter((s) => s.origin === 'website').map((s) => s.value)

export const originOf = (source: EnquirySource): EnquiryOrigin => ENQUIRY_SOURCES.find((s) => s.value === source)?.origin ?? 'admin'

/** 10-digit Indian mobile from any common format (+91, 0-prefix, spaces). Returns '' if not valid. */
export function normalizeMobile(v: unknown): string {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : ''
}

/** Practical email check: one @, no spaces, a dot in the domain, no dot at either end of the domain. */
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
export const isValidEmail = (v: string) => EMAIL.test(v.trim())

export const ENQUIRY_TYPES: Array<{ value: EnquiryType; label: string }> = [
  { value: 'home', label: 'Home' },
  { value: 'commercial', label: 'Commercial' },
]
export const ENQUIRY_TYPE_LABEL: Record<EnquiryType, string> = { home: 'Home', commercial: 'Commercial' }

/** Home / Commercial for any enquiry. Older records (no enquiryType) fall back to their property type. */
export function enquiryTypeOf(e: Pick<Enquiry, 'enquiryType' | 'propertyType'>): EnquiryType | null {
  if (e.enquiryType) return e.enquiryType
  if (e.propertyType === 'residential' || e.propertyType === 'housing-society') return 'home'
  if (e.propertyType === 'commercial' || e.propertyType === 'industrial') return 'commercial'
  return null
}

/** Name to show in lists (the website form may leave the name empty). */
export const enquiryDisplayName = (e: Pick<Enquiry, 'name'>): string => e.name?.trim() || 'Name not given'

/** Capacity in kW from the enquiry or the attached calculator estimate (null when unknown). */
export const enquiryKw = (e: Pick<Enquiry, 'capacityKw' | 'estimate'>): number | null => e.capacityKw ?? e.estimate?.capacityKw ?? null
const PROPERTY_TYPES: PropertyType[] = ['residential', 'housing-society', 'commercial', 'industrial']

/** Solar capacity options on the website contact form (all optional). */
export const CAPACITY_KW_OPTIONS = [1, 2, 3, 5, 6, 8, 10, 15, 20, 25, 30] as const
export const CAPACITY_CHOICES: CapacityChoice[] = ['custom', 'not-sure']
export const CAPACITY_CHOICE_LABEL: Record<CapacityChoice, string> = { custom: 'Other / Custom', 'not-sure': 'Not sure yet' }

/** Capacity as a short label for tables: "5 kW", "Other / Custom", "Not sure yet" or "" (not given). */
export function capacityLabel(e: Pick<Enquiry, 'capacityKw' | 'estimate' | 'capacityChoice'>): string {
  const kw = enquiryKw(e)
  if (kw) return `${kw} kW`
  return e.capacityChoice ? CAPACITY_CHOICE_LABEL[e.capacityChoice] : ''
}

/** Validation used by the admin form, the import preview and the API. */
/** Message shown when neither a mobile number nor an email was given. */
export const CONTACT_REQUIRED_MESSAGE = 'Please provide a mobile number or an email address so we can contact you.'

/**
 * Contact rule shared by the website form, the admin form, the import and the API:
 * mobile OR email is required (either one is enough); whatever is filled in must be valid.
 * Every other field is optional.
 */
export function validateContactMethod(phone: unknown, email: unknown): FieldErrors {
  const out: FieldErrors = {}
  const rawPhone = String(phone ?? '').trim()
  const rawEmail = String(email ?? '').trim()
  if (!rawPhone && !rawEmail) {
    out.phone = CONTACT_REQUIRED_MESSAGE
    out.email = CONTACT_REQUIRED_MESSAGE
    return out
  }
  if (rawPhone && !normalizeMobile(rawPhone)) out.phone = 'Enter a valid 10-digit Indian mobile number (e.g. 98765 43210).'
  if (rawEmail && (rawEmail.length > 200 || !EMAIL.test(rawEmail))) out.email = 'Enter a valid email address (e.g. name@example.com).'
  return out
}

export function validateEnquiry(e: Partial<Enquiry>): FieldErrors {
  // Name, city, service, message and capacity are optional; only a way to contact the customer is required.
  const out: FieldErrors = { ...validateContactMethod(e.phone, e.email) }
  if (e.enquiryType && !ENQUIRY_TYPES.some((t) => t.value === e.enquiryType)) out.enquiryType = 'Choose Home or Commercial.'
  if (e.capacityChoice != null && !CAPACITY_CHOICES.includes(e.capacityChoice)) out.capacityKw = 'Choose a valid capacity.'
  if (e.status && !ENQUIRY_STATUSES.some((s) => s.value === e.status) && !LEGACY_STATUS[e.status]) out.status = 'Choose a valid status.'
  if (e.status === 'follow-up' && !e.followUpOn) out.followUpOn = 'Pick the follow-up date.'
  if (e.source && !ENQUIRY_SOURCES.some((s) => s.value === e.source)) out.source = 'Choose a valid source.'
  if (e.propertyType && !PROPERTY_TYPES.includes(e.propertyType)) out.propertyType = 'Choose a valid property type.'
  if (e.capacityKw != null && !(Number.isFinite(e.capacityKw) && e.capacityKw >= 0 && e.capacityKw <= 100000)) out.capacityKw = 'Capacity must be between 0 and 100,000 kW.'
  if (e.monthlyBill != null && !(Number.isFinite(e.monthlyBill) && e.monthlyBill >= 0)) out.monthlyBill = 'Bill must be 0 or more.'
  if (e.pincode && !/^\d{6}$/.test(e.pincode)) out.pincode = 'PIN code must be 6 digits.'
  if (e.followUpOn && !/^\d{4}-\d{2}-\d{2}$/.test(e.followUpOn)) out.followUpOn = 'Use a valid date.'
  return out
}

/** Trim, drop control characters (keeps line breaks and tabs) and cap the length. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const str = (v: unknown, max: number) => String(v ?? '').replace(CONTROL, '').trim().slice(0, max)

/** Fill fields that older records (schema ≤ 5) don't have and clean values. */
export function normalizeEnquiry(e: Partial<Enquiry> & { id: string }): Enquiry {
  const source = (ENQUIRY_SOURCES.some((s) => s.value === e.source) ? e.source : 'other') as EnquirySource
  const rawStatus = LEGACY_STATUS[String(e.status)] ?? e.status
  const status = (ENQUIRY_STATUSES.some((s) => s.value === rawStatus) ? rawStatus : 'new') as EnquiryStatus
  const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    id: e.id,
    name: str(e.name, 120),
    phone: normalizeMobile(e.phone) || str(e.phone, 20),
    email: str(e.email, 200),
    city: str(e.city, 120),
    service: str(e.service, 200),
    message: str(e.message, 4000),
    source,
    status,
    createdAt: e.createdAt || new Date().toISOString(),
    origin: e.origin ?? originOf(source),
    address: str(e.address, 300),
    state: str(e.state, 60),
    pincode: str(e.pincode, 6),
    propertyType: e.propertyType && PROPERTY_TYPES.includes(e.propertyType) ? e.propertyType : undefined,
    capacityKw: num(e.capacityKw),
    monthlyBill: num(e.monthlyBill),
    notes: str(e.notes, 4000),
    followUpOn: e.followUpOn || null,
    estimate: e.estimate ?? null,
    updatedAt: e.updatedAt ?? e.createdAt,
    // Integrations release: kept when present; older records simply don't have them.
    ...(e.submissionId ? { submissionId: str(e.submissionId, 64) } : {}),
    ...(e.enquiryType === 'home' || e.enquiryType === 'commercial' ? { enquiryType: e.enquiryType } : {}),
    // A number wins over "Other / Custom" / "Not sure yet".
    ...(e.capacityChoice && CAPACITY_CHOICES.includes(e.capacityChoice) && num(e.capacityKw) == null ? { capacityChoice: e.capacityChoice } : {}),
    ...(e.assignedTo !== undefined ? { assignedTo: e.assignedTo } : {}),
    ...(e.assignedToName !== undefined ? { assignedToName: e.assignedToName } : {}),
    ...(e.lastContactedAt !== undefined ? { lastContactedAt: e.lastContactedAt } : {}),
    ...(e.contactCount !== undefined ? { contactCount: e.contactCount } : {}),
  }
}

export interface DuplicateMatch {
  /** Index of the row in the incoming list */
  index: number
  /** Why it looks like a duplicate */
  reason: string
  existingId?: string
}

/**
 * Possible duplicates: same mobile as an existing enquiry or as an earlier row in the same
 * import, or the same email. Returns one match per incoming row at most.
 */
export function findDuplicates(incoming: Array<Pick<Enquiry, 'phone' | 'email' | 'name'>>, existing: Array<Pick<Enquiry, 'id' | 'phone' | 'email' | 'name'>>): DuplicateMatch[] {
  const byPhone = new Map<string, Pick<Enquiry, 'id' | 'name'>>()
  const byEmail = new Map<string, Pick<Enquiry, 'id' | 'name'>>()
  for (const e of existing) {
    const p = normalizeMobile(e.phone)
    if (p) byPhone.set(p, e)
    if (e.email) byEmail.set(e.email.trim().toLowerCase(), e)
  }
  const seenPhone = new Map<string, number>()
  const seenEmail = new Map<string, number>()
  const out: DuplicateMatch[] = []
  incoming.forEach((row, index) => {
    const p = normalizeMobile(row.phone)
    const m = (row.email ?? '').trim().toLowerCase()
    const hit = (p && byPhone.get(p)) || (m && byEmail.get(m))
    if (hit) out.push({ index, reason: `Same ${p && byPhone.get(p) ? 'mobile' : 'email'} as existing enquiry from ${hit.name}`, existingId: hit.id })
    else if (p && seenPhone.has(p)) out.push({ index, reason: `Same mobile as row ${seenPhone.get(p)! + 1} in this file` })
    else if (m && seenEmail.has(m)) out.push({ index, reason: `Same email as row ${seenEmail.get(m)! + 1} in this file` })
    if (p && !seenPhone.has(p)) seenPhone.set(p, index)
    if (m && !seenEmail.has(m)) seenEmail.set(m, index)
  })
  return out
}
