import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'
import type { Proposal, ProposalStatus, Quotation } from '@/types'
import type { QuotationSave } from '@/types/api'
import { DEFAULT_SCOPE, deriveProposal, validateProposal, type ProposalInput } from '@/lib/proposals'
import { normalizeMobile } from '@/lib/enquiries'
import { addDaysISO, todayISO } from '@/lib/files'
import { stateName } from '@/lib/states'
import { db, tx, type Tx } from '../../db/client'
import { nextDocumentNumber } from '../../db/counters'
import { enquiries, proposals, quotations } from '../../db/schema'
import { AppError, assertValid, badRequest, invalid, notFound } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { paginated, searchTerms } from '../../lib/http'
import { todayIST } from '../../lib/time'
import type { AuthUser } from '../../middleware/auth'
import { loadBusiness, loadContent } from '../content/settings.repo'
import { advanceStatus, toEnquiry, type Actor } from '../enquiries/enquiries.service'
import { quotationsService } from '../quotations/quotations.service'
import type { ListProposalsQuery } from './proposals.schema'

type Row = typeof proposals.$inferSelect
export const proposalFromRow = (r: Row): Proposal => ({ ...r.data, id: r.id, proposalNumber: r.proposalNumber, quotationId: r.quotationId, status: r.status as ProposalStatus, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })
const proposalColumns = (p: Proposal) => ({
  proposalNumber: p.proposalNumber, enquiryId: p.enquiryId, quotationId: p.quotationId, status: p.status, customerName: p.customerName,
  phone: p.phone, city: p.city, capacityKw: p.capacityKw, grandTotal: p.grandTotal, proposalDate: p.proposalDate, validUntil: p.validUntil || null, data: p,
})

/** Totals, subsidy and number (assigned once, on create). */
async function buildProposal(t: Tx, id: string, input: ProposalInput, existing: Proposal | undefined): Promise<Proposal> {
  const [content, business] = await Promise.all([loadContent(t), loadBusiness(t)])
  const derived = deriveProposal(input, { calc: content.calculator, businessStateCode: business.stateCode })
  if (derived.discountError) throw invalid({ discount: 'Discount cannot be more than the proposal value.' })
  const { discountError: _d, annualSavings: _s, paybackYears: _p, ...totals } = derived
  const ts = new Date().toISOString()
  return {
    ...input, ...totals, id,
    phone: normalizeMobile(input.phone) || input.phone,
    quotationId: input.quotationId ?? existing?.quotationId ?? null,
    proposalNumber: existing?.proposalNumber ?? (await nextDocumentNumber(t, 'proposal', business.proposal?.prefix || 'BS/PRP', input.proposalDate || todayISO())),
    createdAt: existing?.createdAt ?? ts, updatedAt: ts,
  }
}

const SORT = {
  createdAt: proposals.createdAt, proposalDate: proposals.proposalDate, customerName: sql`lower(${proposals.customerName})`,
  grandTotal: proposals.grandTotal, validUntil: proposals.validUntil, capacityKw: proposals.capacityKw,
}

export const proposalsService = {
  async list(q: ListProposalsQuery) {
    const where: Array<SQL | undefined> = []
    const today = todayIST()
    if (q.status === 'open') where.push(inArray(proposals.status, ['draft', 'sent']))
    else if (q.status === 'expired') where.push(inArray(proposals.status, ['draft', 'sent']), lt(proposals.validUntil, today))
    else if (q.status) where.push(eq(proposals.status, q.status))
    if (q.enquiryId) where.push(eq(proposals.enquiryId, q.enquiryId))
    if (q.from) where.push(gte(proposals.proposalDate, q.from))
    if (q.to) where.push(sql`${proposals.proposalDate} <= ${q.to}`)
    for (const term of searchTerms(q.search)) where.push(sql`lower(${proposals.proposalNumber} || ' ' || ${proposals.customerName} || ' ' || ${proposals.phone} || ' ' || ${proposals.city}) like ${term}`)
    const w = where.length ? and(...where) : undefined
    const dir = q.order === 'asc' ? asc : desc
    const base = db.select().from(proposals).where(w).orderBy(sql`${dir(SORT[q.sort] as never)} nulls last`, desc(proposals.createdAt), asc(proposals.id))
    if (q.all) {
      const rows = await base
      return paginated(rows.map(proposalFromRow), rows.length, { page: 1, limit: Math.max(1, rows.length) })
    }
    const [rows, [{ count }]] = await Promise.all([
      base.limit(q.limit).offset((q.page - 1) * q.limit),
      db.select({ count: sql<number>`count(*)::int` }).from(proposals).where(w),
    ])
    return paginated(rows.map(proposalFromRow), count, q)
  },

  async get(id: string, t: Tx | typeof db = db): Promise<Proposal> {
    const [r] = await t.select().from(proposals).where(eq(proposals.id, id)).limit(1)
    if (!r) throw notFound('Proposal')
    return proposalFromRow(r)
  },

  async save(id: string | null, input: ProposalInput, user: AuthUser): Promise<Proposal> {
    assertValid(validateProposal(input))
    return tx(async (t) => {
      const [existingRow] = id ? await t.select().from(proposals).where(eq(proposals.id, id)).for('update').limit(1) : []
      if (id && !existingRow) throw notFound('Proposal')
      const existing = existingRow ? proposalFromRow(existingRow) : undefined
      if (input.enquiryId && !existing) {
        const [enq] = await t.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.id, input.enquiryId)).limit(1)
        if (!enq) throw invalid({ enquiryId: 'The linked enquiry no longer exists.' })
      }
      const saved = await buildProposal(t, existing?.id ?? newId('prp'), input, existing)
      if (existing) await t.update(proposals).set({ ...proposalColumns(saved), updatedAt: new Date() }).where(eq(proposals.id, saved.id))
      else await t.insert(proposals).values({ id: saved.id, ...proposalColumns(saved) })
      if (!existing && saved.enquiryId)
        await advanceStatus(t, saved.enquiryId, 'proposal', ['new', 'pending', 'contacted', 'follow-up', 'interested', 'site-visit'], { id: user.id, name: user.name }, `Proposal ${saved.proposalNumber} created.`)
      return saved
    })
  },

  /** Manual enquiries can start a draft proposal straight away (details copied). */
  async createFromEnquiryTx(t: Tx, enquiryId: string, actor: Actor): Promise<Proposal | null> {
    const [exists] = await t.select({ id: proposals.id }).from(proposals).where(eq(proposals.enquiryId, enquiryId)).limit(1)
    if (exists) return null
    const [row] = await t.select().from(enquiries).where(eq(enquiries.id, enquiryId)).limit(1)
    if (!row) throw notFound('Enquiry')
    const e = toEnquiry(row)
    const business = await loadBusiness(t)
    const date = todayISO()
    const est = e.estimate
    const input: ProposalInput = {
      enquiryId: e.id, status: 'draft', proposalDate: date, validUntil: addDaysISO(date, business.proposal?.validityDays ?? 15),
      title: 'Roof solar power plant proposal', customerName: e.name, phone: e.phone, email: e.email, address: e.address ?? '', city: e.city,
      state: e.state || stateName(business.stateCode), propertyType: est?.propertyType ?? e.propertyType ?? 'residential', systemType: est?.systemType ?? 'on-grid',
      roofType: est?.roofType ?? 'rcc', capacityKw: est?.capacityKw ?? (e.capacityKw && e.capacityKw >= 0.5 ? e.capacityKw : 3), monthlyBill: est?.monthlyBill ?? e.monthlyBill ?? 0,
      consumerNumber: '', discom: business.stateCode === '22' ? 'CSPDCL' : '', companyId: est?.companyId ?? null, quality: est?.quality ?? 'normal',
      items: [], discount: 0, scope: [...DEFAULT_SCOPE], paymentTerms: business.quotation.defaultPaymentTerms, terms: business.quotation.defaultTerms,
      notes: [e.service, e.message].filter(Boolean).join(' — ').slice(0, 1000),
    }
    const p = await buildProposal(t, newId('prp'), input, undefined)
    await t.insert(proposals).values({ id: p.id, ...proposalColumns(p) })
    await advanceStatus(t, enquiryId, 'proposal', ['new', 'pending', 'contacted', 'follow-up', 'interested', 'site-visit'], actor, `Draft proposal ${p.proposalNumber} created.`)
    return p
  },

  async duplicate(id: string): Promise<Proposal> {
    return tx(async (t) => {
      const src = await proposalsService.get(id, t)
      const business = await loadBusiness(t)
      const date = todayISO()
      const { id: _i, proposalNumber: _n, createdAt: _c, updatedAt: _u, ...rest } = src
      const copy = await buildProposal(t, newId('prp'), {
        ...structuredClone(rest), status: 'draft', quotationId: null, proposalDate: date,
        validUntil: addDaysISO(date, business.proposal?.validityDays ?? 15), items: rest.items.map((it) => ({ ...it, id: newId('ln') })),
      } as ProposalInput, undefined)
      await t.insert(proposals).values({ id: copy.id, ...proposalColumns(copy) })
      return copy
    })
  },

  async setStatus(id: string, status: ProposalStatus): Promise<Proposal> {
    return tx(async (t) => {
      const p = await proposalsService.get(id, t)
      if (status === 'converted' && !p.quotationId) throw badRequest('Use “Convert to quotation” to mark a proposal as converted.')
      const next = { ...p, status, updatedAt: new Date().toISOString() }
      await t.update(proposals).set({ status, data: next, updatedAt: new Date() }).where(eq(proposals.id, id))
      return next
    })
  },

  /** Proposal → new numbered quotation with the same customer, system and items (one transaction). */
  async convert(id: string, user: AuthUser): Promise<Quotation> {
    return tx(async (t) => {
      const [row] = await t.select().from(proposals).where(eq(proposals.id, id)).for('update').limit(1)
      if (!row) throw notFound('Proposal')
      const p = proposalFromRow(row)
      if (p.quotationId) {
        const [q] = await t.select({ id: quotations.id }).from(quotations).where(eq(quotations.id, p.quotationId)).limit(1)
        if (q) throw new AppError('conflict', 'This proposal was already converted. Open the quotation to edit it.')
      }
      const q = await quotationsService.saveTx(t, newId('qt'), {
        enquiryId: p.enquiryId, proposalId: p.id, status: 'pending', quoteDate: todayISO(), validUntil: null,
        customerName: p.customerName, phone: normalizeMobile(p.phone) || p.phone, email: p.email, city: p.city, address: p.address, state: p.state,
        gstin: '', consumerNumber: p.consumerNumber, discom: p.discom, sanctionedLoadKw: null, propertyType: p.propertyType, systemType: p.systemType,
        roofType: p.roofType, capacityKw: p.capacityKw, monthlyBill: p.monthlyBill, companyId: p.companyId, quality: p.quality, packagePrice: null,
        items: structuredClone(p.items).map((it) => ({ ...it, id: newId('ln') })), discount: p.discount, subsidy: null, stateSubsidy: null,
        annualGenerationKwh: p.annualGenerationKwh || null, paymentTerms: p.paymentTerms, terms: p.terms,
        notes: `From proposal ${p.proposalNumber}.${p.notes ? ' ' + p.notes : ''}`.slice(0, 2000), subsidyAuto: true,
      } as QuotationSave, user)
      const next = { ...p, quotationId: q.id, status: 'converted' as const, updatedAt: new Date().toISOString() }
      await t.update(proposals).set({ quotationId: q.id, status: 'converted', data: next, updatedAt: new Date() }).where(eq(proposals.id, id))
      return q
    })
  },

  async remove(id: string) {
    await tx(async (t) => {
      const res = await t.delete(proposals).where(eq(proposals.id, id))
      if (!res.rowCount) throw notFound('Proposal')
      // quotations.proposal_id is ON DELETE SET NULL; keep the JSON copy consistent too.
      await t.execute(sql`update quotations set data = jsonb_set(data, '{proposalId}', 'null'::jsonb) where data->>'proposalId' = ${id}`)
    })
  },
}
