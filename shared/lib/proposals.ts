import type { BusinessSettings, CalculatorSettings, Enquiry, FieldErrors, LineItem, Proposal, ProposalStatus } from '@/types'
import { computeTotals } from '@/lib/totals'
import { computeSubsidy } from '@/lib/subsidy'
import { calculateSolar } from '@/lib/calculator'
import { normalizeMobile } from '@/lib/enquiries'
import { stateCodeOf } from '@/lib/states'
import { addDaysISO, todayISO } from '@/lib/files'

/**
 * PROPOSAL RULES (pure functions). A proposal comes before a formal quotation: system design,
 * scope of work, indicative price and terms. It can be converted into a quotation, keeping the
 * link to the original enquiry.
 */

export const PROPOSAL_STATUSES: Array<{ value: ProposalStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'converted', label: 'Converted to quotation' },
]
export const PROPOSAL_STATUS_LABEL = Object.fromEntries(PROPOSAL_STATUSES.map((s) => [s.value, s.label])) as Record<ProposalStatus, string>

export const DEFAULT_SCOPE = [
  'Free site survey and shadow analysis',
  'System design and structural layout',
  'Supply of solar modules, inverter, mounting structure and balance of system',
  'Installation, testing and commissioning',
  'Net-metering application with the DISCOM',
  'PM Surya Ghar subsidy portal registration and follow-up (residential)',
]

export const DEFAULT_PROPOSAL_VALIDITY_DAYS = 15

/** Fields the admin edits (everything else is derived on save). */
export type ProposalInput = Omit<Proposal, 'id' | 'proposalNumber' | 'createdAt' | 'updatedAt' | 'subtotal' | 'taxableAmount' | 'taxTotal' | 'grandTotal' | 'subsidy' | 'stateSubsidy' | 'netCost' | 'annualGenerationKwh' | 'quotationId'> & {
  quotationId?: string | null
}

export function blankProposal(business?: Pick<BusinessSettings, 'quotation'> | null): ProposalInput {
  const date = todayISO()
  return {
    enquiryId: null,
    status: 'draft',
    proposalDate: date,
    validUntil: addDaysISO(date, DEFAULT_PROPOSAL_VALIDITY_DAYS),
    title: 'Roof solar power plant proposal',
    customerName: '',
    phone: '',
    email: '',
    address: '',
    city: 'Raipur',
    state: 'Chhattisgarh',
    propertyType: 'residential',
    systemType: 'on-grid',
    roofType: 'rcc',
    capacityKw: 3,
    monthlyBill: 0,
    consumerNumber: '',
    discom: 'CSPDCL',
    companyId: null,
    quality: 'normal',
    items: [],
    discount: 0,
    scope: [...DEFAULT_SCOPE],
    paymentTerms: business?.quotation.defaultPaymentTerms ?? '',
    terms: business?.quotation.defaultTerms ?? '',
    notes: '',
  }
}

/** Customer and site details copied from an enquiry. */
export function proposalFromEnquiry(e: Enquiry, business?: Pick<BusinessSettings, 'quotation'> | null): ProposalInput {
  const p = blankProposal(business)
  const est = e.estimate
  return {
    ...p,
    enquiryId: e.id,
    customerName: e.name,
    phone: e.phone,
    email: e.email,
    address: e.address ?? '',
    city: e.city || p.city,
    state: e.state || p.state,
    propertyType: est?.propertyType ?? e.propertyType ?? p.propertyType,
    systemType: est?.systemType ?? p.systemType,
    roofType: est?.roofType ?? p.roofType,
    capacityKw: est?.capacityKw ?? (e.capacityKw && e.capacityKw > 0 ? e.capacityKw : p.capacityKw),
    monthlyBill: est?.monthlyBill ?? e.monthlyBill ?? 0,
    companyId: est?.companyId ?? null,
    quality: est?.quality ?? 'normal',
    notes: [e.service, e.message].filter(Boolean).join(' — ').slice(0, 1000),
  }
}

export function validateProposal(p: ProposalInput): FieldErrors {
  const e: FieldErrors = {}
  if ((p.customerName ?? '').trim().length < 2) e.customerName = 'Enter the customer name.'
  if (!normalizeMobile(p.phone)) e.phone = 'Enter a valid 10-digit Indian mobile number.'
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) e.email = 'Enter a valid email address.'
  if (!(p.capacityKw >= 0.5 && p.capacityKw <= 10000)) e.capacityKw = 'Capacity must be between 0.5 and 10,000 kW.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.proposalDate ?? '')) e.proposalDate = 'Choose the proposal date.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.validUntil ?? '')) e.validUntil = 'Choose a validity date.'
  else if (p.validUntil < p.proposalDate) e.validUntil = 'Validity must be on or after the proposal date.'
  if (!(Number.isFinite(p.discount) && p.discount >= 0)) e.discount = 'Discount must be 0 or more.'
  ;(p.items ?? []).forEach((it: LineItem, i: number) => {
    if (!it.name?.trim()) e[`items.${i}.name`] = 'Enter an item name.'
    if (!(Number.isFinite(it.quantity) && it.quantity > 0)) e[`items.${i}.quantity`] = 'Quantity must be more than 0.'
    if (!(Number.isFinite(it.rate) && it.rate >= 0)) e[`items.${i}.rate`] = 'Rate cannot be negative.'
    if (!(Number.isFinite(it.gstRate) && it.gstRate >= 0 && it.gstRate <= 28)) e[`items.${i}.gstRate`] = 'GST must be 0–28%.'
    if (!(Number.isFinite(it.discountPct) && it.discountPct >= 0 && it.discountPct <= 100)) e[`items.${i}.discountPct`] = 'Line discount must be 0–100%.'
  })
  return e
}

/** Totals, subsidy and generation for a proposal (same engines as quotations and the calculator). */
export function deriveProposal(p: ProposalInput, ctx: { calc: CalculatorSettings; businessStateCode: string }) {
  const custState = stateCodeOf(p.state) || ctx.businessStateCode
  const supplyType = custState === ctx.businessStateCode ? 'intra' : 'inter'
  const totals = computeTotals(p.items ?? [], { supplyType, discountType: 'amount', discountValue: p.discount, roundOff: true })
  const discountError = (p.items ?? []).length > 0 && p.discount > totals.subtotal - totals.itemDiscount
  const estimate = calculateSolar(
    { monthlyBill: p.monthlyBill, tariff: 0, propertyType: p.propertyType, systemType: p.systemType, roofType: p.roofType, capacityOverride: p.capacityKw, stateCode: custState },
    ctx.calc,
  )
  const cost = (p.items ?? []).length ? totals.grandTotal : estimate.costMid
  const sub = computeSubsidy({ capacityKw: p.capacityKw, propertyType: p.propertyType, systemType: p.systemType, stateCode: custState, systemCost: Math.round(cost) }, ctx.calc)
  return {
    discountError,
    subtotal: totals.subtotal,
    taxableAmount: totals.taxableAmount,
    taxTotal: totals.taxTotal,
    grandTotal: Math.round(cost * 100) / 100,
    subsidy: sub.central,
    stateSubsidy: sub.state,
    netCost: Math.max(0, Math.round((cost - sub.total) * 100) / 100),
    annualGenerationKwh: estimate.annualUnits,
    annualSavings: estimate.annualSavings,
    paybackYears: estimate.paybackYears,
  }
}

export const isExpired = (p: Pick<Proposal, 'validUntil' | 'status'>, today = todayISO()) =>
  (p.status === 'draft' || p.status === 'sent') && p.validUntil < today
