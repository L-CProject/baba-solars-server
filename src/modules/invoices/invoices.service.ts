import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import type { Invoice, InvoiceInput, Payment } from '@/types'
import { deriveInvoice, isOverdue, paymentState } from '@/lib/documents'
import { addDaysISO } from '@/lib/files'
import { db, tx, type DbOrTx, type Tx } from '../../db/client'
import { nextDocumentNumber } from '../../db/counters'
import { invoicePayments, invoices } from '../../db/schema'
import { badRequest, invalid, notFound } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { searchTerms } from '../../lib/http'
import { todayIST } from '../../lib/time'
import type { AuthUser } from '../../middleware/auth'
import { loadBusiness, loadContent } from '../content/settings.repo'
import type { ListInvoicesQuery } from './invoices.schema'

type Row = typeof invoices.$inferSelect
type PayRow = typeof invoicePayments.$inferSelect

const toPayment = (p: PayRow): Payment => ({ id: p.id, date: p.date, amount: p.amount, method: p.method as Payment['method'], reference: p.reference, note: p.note })
function toInvoice(r: Row, pays: PayRow[]): Invoice {
  const inv = { ...r.data, id: r.id, invoiceNumber: r.invoiceNumber, payments: pays.map(toPayment), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() } as Invoice
  return { ...inv, isOverdue: isOverdue(inv) }
}
function columns(inv: Invoice) {
  const { payments: _p, isOverdue: _o, ...data } = inv
  return {
    invoiceNumber: inv.invoiceNumber, quotationId: inv.quotationId, status: inv.status, paymentStatus: inv.paymentStatus, customerName: inv.customerName,
    phone: inv.phone, gstin: inv.gstin, city: inv.city, reference: inv.reference, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate,
    grandTotal: inv.grandTotal, amountPaid: inv.amountPaid, amountDue: inv.amountDue, data,
  }
}
async function paymentsOf(t: DbOrTx, ids: string[]) {
  if (!ids.length) return new Map<string, PayRow[]>()
  const rows = await t.select().from(invoicePayments).where(inArray(invoicePayments.invoiceId, ids)).orderBy(asc(invoicePayments.date), asc(invoicePayments.createdAt))
  const map = new Map<string, PayRow[]>()
  for (const p of rows) map.set(p.invoiceId, [...(map.get(p.invoiceId) ?? []), p])
  return map
}

const overdueSql = (today: string) => sql`(${invoices.status} = 'issued' and ${invoices.amountDue} > 0 and ${invoices.dueDate} is not null and ${invoices.dueDate} < ${today})`

export const invoicesService = {
  async list(q: ListInvoicesQuery) {
    const today = todayIST()
    const where: Array<SQL | undefined> = []
    if (q.status) where.push(eq(invoices.status, q.status))
    if (q.paymentStatus === 'overdue') where.push(overdueSql(today))
    else if (q.paymentStatus) where.push(eq(invoices.paymentStatus, q.paymentStatus))
    if (q.from) where.push(gte(invoices.invoiceDate, q.from))
    if (q.to) where.push(lte(invoices.invoiceDate, q.to))
    for (const term of searchTerms(q.q)) where.push(sql`lower(${invoices.invoiceNumber} || ' ' || ${invoices.customerName} || ' ' || ${invoices.phone} || ' ' || ${invoices.gstin} || ' ' || ${invoices.city} || ' ' || ${invoices.reference}) like ${term}`)
    const w = where.length ? and(...where) : undefined
    const order = {
      date_desc: [desc(invoices.invoiceDate), desc(invoices.createdAt)], date_asc: [asc(invoices.invoiceDate), asc(invoices.createdAt)],
      amount_desc: [desc(invoices.grandTotal)], amount_asc: [asc(invoices.grandTotal)], due_asc: [sql`${invoices.dueDate} asc nulls last`],
    }[q.sort]
    const [rows, [agg]] = await Promise.all([
      db.select().from(invoices).where(w).orderBy(...order, asc(invoices.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      db.select({
        total: sql<number>`count(*)::int`,
        count: sql<number>`count(*) filter (where ${invoices.status} <> 'cancelled')::int`,
        billed: sql<number>`coalesce(sum(${invoices.grandTotal}) filter (where ${invoices.status} <> 'cancelled'), 0)::float8`,
        paid: sql<number>`coalesce(sum(${invoices.amountPaid}) filter (where ${invoices.status} <> 'cancelled'), 0)::float8`,
        due: sql<number>`coalesce(sum(${invoices.amountDue}) filter (where ${invoices.status} <> 'cancelled'), 0)::float8`,
      }).from(invoices).where(w),
    ])
    const pays = await paymentsOf(db, rows.map((r) => r.id))
    const r2 = (n: number) => Math.round(n * 100) / 100
    return {
      items: rows.map((r) => toInvoice(r, pays.get(r.id) ?? [])), total: agg.total, page: q.page, pageSize: q.pageSize,
      totalPages: Math.max(1, Math.ceil(agg.total / q.pageSize)),
      summary: { count: agg.count, billed: r2(agg.billed), paid: r2(agg.paid), due: r2(agg.due) },
    }
  },

  async get(id: string, t: DbOrTx = db): Promise<Invoice> {
    const [r] = await t.select().from(invoices).where(eq(invoices.id, id)).limit(1)
    if (!r) throw notFound('Invoice')
    return toInvoice(r, (await paymentsOf(t, [id])).get(id) ?? [])
  },

  create: (input: InvoiceInput, user: AuthUser) => tx((t) => invoicesService.createTx(t, input, user)),

  async createTx(t: Tx, input: InvoiceInput, user: AuthUser): Promise<Invoice> {
    const [business, content] = await Promise.all([loadBusiness(t), loadContent(t)])
    const payments: Payment[] = input.initialPayment ? [{ id: newId('pay'), ...input.initialPayment }] : []
    const derived = deriveInvoice(input, payments, business, content.calculator)
    const { initialPayment: _ip, ...rest } = input
    const now = new Date().toISOString()
    const inv: Invoice = {
      ...rest, ...derived, id: newId('inv'), payments,
      invoiceNumber: await nextDocumentNumber(t, 'invoice', business.invoice.prefix, input.invoiceDate),
      dueDate: input.dueDate ?? addDaysISO(input.invoiceDate, business.invoice.defaultDueDays),
      terms: input.terms || business.invoice.defaultTerms, paymentMethod: input.paymentMethod || payments[0]?.method || '',
      isOverdue: false, createdAt: now, updatedAt: now,
    }
    await t.insert(invoices).values({ id: inv.id, ...columns(inv) })
    for (const p of payments) await t.insert(invoicePayments).values({ ...p, invoiceId: inv.id, createdBy: user.id })
    return invoicesService.get(inv.id, t)
  },

  async update(id: string, input: InvoiceInput): Promise<Invoice> {
    if (input.initialPayment) throw badRequest('Payments cannot be added through invoice edits. Record them from the invoice payment panel.')
    return tx(async (t) => {
      const existing = await invoicesService.get(id, t)
      const [business, content] = await Promise.all([loadBusiness(t), loadContent(t)])
      const derived = deriveInvoice(input, existing.payments, business, content.calculator)
      const { initialPayment: _ip, ...rest } = input
      const next: Invoice = { ...existing, ...rest, ...derived, payments: existing.payments, updatedAt: new Date().toISOString() }
      await t.update(invoices).set({ ...columns(next), updatedAt: new Date() }).where(eq(invoices.id, id))
      return invoicesService.get(id, t)
    })
  },

  async remove(id: string) {
    const res = await db.delete(invoices).where(eq(invoices.id, id))
    if (!res.rowCount) throw notFound('Invoice')
  },

  /** Recompute paid / due / status from the payment rows (single source of truth). */
  async refreshPayments(t: Tx, id: string) {
    const inv = await invoicesService.get(id, t)
    const state = paymentState(inv.grandTotal, inv.payments)
    const next = { ...inv, ...state, updatedAt: new Date().toISOString() }
    await t.update(invoices).set({ ...columns(next), updatedAt: new Date() }).where(eq(invoices.id, id))
    return invoicesService.get(id, t)
  },

  async addPayment(id: string, p: Omit<Payment, 'id'>, user: AuthUser): Promise<Invoice> {
    return tx(async (t) => {
      const [row] = await t.select().from(invoices).where(eq(invoices.id, id)).for('update').limit(1)
      if (!row) throw notFound('Invoice')
      if (row.status === 'cancelled') throw badRequest('This invoice is cancelled.')
      if (!(p.amount > 0)) throw invalid({ amount: 'Enter the amount received.' })
      if (p.amount > row.amountDue + 0.001) throw badRequest(`Amount is more than the balance due (₹${row.amountDue}).`)
      await t.insert(invoicePayments).values({ id: newId('pay'), invoiceId: id, ...p, createdBy: user.id })
      await t.update(invoices).set({ data: { ...row.data, paymentMethod: p.method } }).where(eq(invoices.id, id))
      return invoicesService.refreshPayments(t, id)
    })
  },

  async removePayment(id: string, paymentId: string): Promise<Invoice> {
    return tx(async (t) => {
      const [row] = await t.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id)).for('update').limit(1)
      if (!row) throw notFound('Invoice')
      await t.delete(invoicePayments).where(and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, id)))
      return invoicesService.refreshPayments(t, id)
    })
  },

  /** Billing figures for dashboards. */
  async summary(from?: string) {
    const today = todayIST()
    const [r] = await db.select({
      billed: sql<number>`coalesce(sum(${invoices.grandTotal}) filter (where ${invoices.status} <> 'cancelled'${from ? sql` and ${invoices.invoiceDate} >= ${from}` : sql``}), 0)::float8`,
      due: sql<number>`coalesce(sum(${invoices.amountDue}) filter (where ${invoices.status} <> 'cancelled'), 0)::float8`,
      overdue: sql<number>`count(*) filter (where ${overdueSql(today)})::int`,
    }).from(invoices)
    return r
  },
}
