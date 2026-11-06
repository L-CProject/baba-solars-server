import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'
import type { Invoice, Quotation, QuotationStatus } from '@/types'
import type { QuotationSave } from '@/types/api'
import { deriveQuotation } from '@/lib/documents'
import { addDaysISO, todayISO } from '@/lib/files'
import { stateCodeOf, stateName } from '@/lib/states'
import { db, tx, type DbOrTx, type Tx } from '../../db/client'
import { nextDocumentNumber } from '../../db/counters'
import { companies, enquiries, proposals, quotations } from '../../db/schema'
import { badRequest, invalid, notFound } from '../../lib/errors'
import { paginated, searchTerms } from '../../lib/http'
import { todayIST } from '../../lib/time'
import type { AuthUser } from '../../middleware/auth'
import { companyFromRow } from '../companies/companies.mapper'
import { loadBusiness, loadContent } from '../content/settings.repo'
import { advanceStatus } from '../enquiries/enquiries.service'
import { invoicesService } from '../invoices/invoices.service'
import type { ListQuotationsQuery } from './quotations.schema'

type Row = typeof quotations.$inferSelect
export const quotationFromRow = (r: Row): Quotation => ({ ...r.data, id: r.id, quoteNumber: r.quoteNumber, status: r.status as QuotationStatus, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })
const columns = (q: Quotation) => ({
  quoteNumber: q.quoteNumber ?? null, enquiryId: q.enquiryId ?? null, proposalId: q.proposalId ?? null, status: q.status, customerName: q.customerName,
  phone: q.phone, city: q.city, capacityKw: q.capacityKw, grandTotal: q.grandTotal ?? q.estimatedCost ?? 0, netCost: q.netCost ?? 0,
  quoteDate: q.quoteDate ?? null, validUntil: q.validUntil ?? null, data: q,
})

const SORT = {
  createdAt: quotations.createdAt, quoteDate: quotations.quoteDate, customerName: sql`lower(${quotations.customerName})`, grandTotal: quotations.grandTotal,
  netCost: quotations.netCost, validUntil: quotations.validUntil, capacityKw: quotations.capacityKw,
}

async function context(t: DbOrTx) {
  const [business, content, companyRows] = await Promise.all([loadBusiness(t), loadContent(t), t.select().from(companies)])
  return { business, calc: content.calculator, companies: companyRows.map(companyFromRow) }
}

export const quotationsService = {
  async list(q: ListQuotationsQuery) {
    const where: Array<SQL | undefined> = []
    if (q.status === 'open') where.push(inArray(quotations.status, ['pending', 'sent']))
    else if (q.status === 'expired') where.push(inArray(quotations.status, ['pending', 'sent']), lt(quotations.validUntil, todayIST()))
    else if (q.status) where.push(eq(quotations.status, q.status))
    if (q.enquiryId) where.push(eq(quotations.enquiryId, q.enquiryId))
    if (q.from) where.push(gte(quotations.quoteDate, q.from))
    if (q.to) where.push(sql`${quotations.quoteDate} <= ${q.to}`)
    for (const term of searchTerms(q.search)) where.push(sql`lower(coalesce(${quotations.quoteNumber}, '') || ' ' || ${quotations.customerName} || ' ' || ${quotations.phone} || ' ' || ${quotations.city}) like ${term}`)
    const w = where.length ? and(...where) : undefined
    const dir = q.order === 'asc' ? asc : desc
    const base = db.select().from(quotations).where(w).orderBy(sql`${dir(SORT[q.sort] as never)} nulls last`, desc(quotations.createdAt), asc(quotations.id))
    if (q.all) {
      const rows = await base
      return paginated(rows.map(quotationFromRow), rows.length, { page: 1, limit: Math.max(1, rows.length) })
    }
    const [rows, [{ count }]] = await Promise.all([
      base.limit(q.limit).offset((q.page - 1) * q.limit),
      db.select({ count: sql<number>`count(*)::int` }).from(quotations).where(w),
    ])
    return paginated(rows.map(quotationFromRow), count, q)
  },

  async get(id: string, t: DbOrTx = db): Promise<Quotation> {
    const [r] = await t.select().from(quotations).where(eq(quotations.id, id)).limit(1)
    if (!r) throw notFound('Quotation')
    return quotationFromRow(r)
  },

  save: (id: string, input: QuotationSave, user: AuthUser) => tx((t) => quotationsService.saveTx(t, id, input, user)),

  /** Create (numbered once) or update. Totals, GST and subsidy come from the shared rules. */
  async saveTx(t: Tx, id: string, input: QuotationSave, user: AuthUser): Promise<Quotation> {
    const [existingRow] = await t.select().from(quotations).where(eq(quotations.id, id)).for('update').limit(1)
    const existing = existingRow ? quotationFromRow(existingRow) : undefined
    const ctx = await context(t)
    const derived = deriveQuotation(input, { ...ctx, existing })
    if (input.enquiryId && !existing) {
      const [e] = await t.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.id, input.enquiryId)).limit(1)
      if (!e) throw invalid({ enquiryId: 'The linked enquiry no longer exists.' })
    }
    if (input.proposalId) {
      const [p] = await t.select({ id: proposals.id }).from(proposals).where(eq(proposals.id, input.proposalId)).limit(1)
      if (!p) input = { ...input, proposalId: null }
    }
    const now = new Date().toISOString()
    if (existing) {
      const next: Quotation = { ...existing, ...input, ...derived, validUntil: input.validUntil ?? existing.validUntil, updatedAt: now }
      await t.update(quotations).set({ ...columns(next), updatedAt: new Date() }).where(eq(quotations.id, id))
      return next
    }
    const date = input.quoteDate || todayISO()
    const q: Quotation = {
      ...input, ...derived, id, source: 'admin', quoteDate: date,
      quoteNumber: await nextDocumentNumber(t, 'quotation', ctx.business.quotation.prefix, date),
      validUntil: input.validUntil ?? addDaysISO(date, ctx.business.quotation.validityDays),
      paymentTerms: input.paymentTerms || ctx.business.quotation.defaultPaymentTerms,
      terms: input.terms || ctx.business.quotation.defaultTerms, notes: input.notes, createdAt: now, updatedAt: now,
    }
    await t.insert(quotations).values({ id, ...columns(q) })
    if (q.enquiryId)
      await advanceStatus(t, q.enquiryId, 'quoted', ['new', 'pending', 'contacted', 'follow-up', 'interested', 'site-visit', 'proposal'], { id: user.id, name: user.name }, `Quotation ${q.quoteNumber} created.`)
    return q
  },

  async setStatus(id: string, status: QuotationStatus): Promise<Quotation> {
    return tx(async (t) => {
      const q = await quotationsService.get(id, t)
      const next = { ...q, status, updatedAt: new Date().toISOString() }
      await t.update(quotations).set({ status, data: next, updatedAt: new Date() }).where(eq(quotations.id, id))
      return next
    })
  },

  /** Quotation → invoice (same items), quotation marked accepted; one transaction. */
  async convertToInvoice(id: string, user: AuthUser): Promise<Invoice> {
    return tx(async (t) => {
      const q = await quotationsService.get(id, t)
      if (!q.items?.length) throw badRequest('Price the quotation first (choose a company, size and quality) before converting it to an invoice.')
      const business = await loadBusiness(t)
      const stateCode = (q.gstin && /^\d{2}/.test(q.gstin) ? q.gstin.slice(0, 2) : '') || stateCodeOf(q.state ?? '') || business.stateCode
      const inv = await invoicesService.createTx(t, {
        documentTitle: 'Tax Invoice', reference: q.quoteNumber ?? '', invoiceDate: todayISO(), dueDate: null, template: business.invoice.defaultTemplate,
        status: 'issued', quotationId: q.id, customerName: q.customerName, phone: q.phone, email: q.email, address: q.address ?? '', city: q.city,
        state: stateName(stateCode) || (q.state ?? ''), stateCode, gstin: q.gstin ?? '', items: structuredClone(q.items), discountType: 'amount',
        discountValue: q.discount ?? 0, paymentMethod: '', notes: `Against quotation ${q.quoteNumber ?? ''}. ${business.invoice.defaultNotes}`.trim(), terms: '',
        initialPayment: null,
        subsidy: {
          show: business.quotation.showSubsidy && q.subsidy + (q.stateSubsidy ?? 0) > 0, auto: q.subsidyAuto ?? false, capacityKw: q.capacityKw,
          propertyType: q.propertyType, systemType: q.systemType, central: q.subsidy, state: q.stateSubsidy ?? 0,
        },
      }, user)
      const next = { ...q, status: 'accepted' as const, updatedAt: new Date().toISOString() }
      await t.update(quotations).set({ status: 'accepted', data: next, updatedAt: new Date() }).where(eq(quotations.id, id))
      if (q.enquiryId) await advanceStatus(t, q.enquiryId, 'converted', ['new', 'pending', 'contacted', 'follow-up', 'interested', 'site-visit', 'proposal', 'quoted'], { id: user.id, name: user.name }, `Invoice ${inv.invoiceNumber} raised from quotation ${q.quoteNumber ?? ''}.`)
      return inv
    })
  },

  async remove(id: string) {
    await tx(async (t) => {
      const res = await t.delete(quotations).where(eq(quotations.id, id))
      if (!res.rowCount) throw notFound('Quotation')
      await t.execute(sql`update proposals set quotation_id = null, data = jsonb_set(data, '{quotationId}', 'null'::jsonb) where quotation_id = ${id}`)
    })
  },
}
