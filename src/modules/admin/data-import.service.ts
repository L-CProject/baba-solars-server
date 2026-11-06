import { and, eq, inArray, sql } from 'drizzle-orm'
import type { BusinessSettings, CatalogItem, Company, Enquiry, Invoice, Proposal, Quotation, SiteContent } from '@/types'
import { normalizeEnquiry, isClosedStatus } from '@/lib/enquiries'
import { mergeDefaults, normalizeCapacityPlan, normalizePricingPlan } from '@/lib/schemas'
import { normalizeOffer } from '@/lib/offers'
import { migrateCompanyContacts } from '@/config/company'
import { withContentDefaults } from '@/data/settings-defaults'
import { seedBusiness } from '@/mocks/seed/business'
import type { Tx } from '../../db/client'
import {
  catalogItems, companies, counters, enquiries, enquiryActivities, followUps, invoicePayments, invoices, proposals, quotations, siteItems,
} from '../../db/schema'
import { newId } from '../../lib/ids'
import { catalogToRow } from '../catalog/catalog.service'
import { companyToRow } from '../companies/companies.mapper'
import { SITE_COLLECTIONS, type SiteCollection } from '../content/content.model'
import { itemToRow } from '../content/content.service'
import { bumpSiteVersion, loadBusiness, loadContent, readSetting, writeSetting } from '../content/settings.repo'
import { offerToRow } from '../offers/offers.mapper'
import { uploadsService } from '../uploads/uploads.service'
import { offers } from '../offers/offers.model'

/**
 * Imports website data into PostgreSQL: the bundled seed (first run) and JSON backups exported
 * from the old browser-only admin panel (Site content → Backup & restore, "include leads").
 *
 *  • Never duplicates: every record keeps its original id; enquiries are also matched by submissionId.
 *  • Never overwrites newer server data for business records (enquiries, proposals, quotations,
 *    invoices): existing ids are skipped and reported.
 *  • Images stored inside the backup as data: URLs are written to UPLOAD_DIR and replaced by /uploads/… links.
 *  • Everything runs in ONE transaction: a failure leaves the database unchanged.
 */

export interface CollectionReport { inFile: number; inserted: number; updated: number; skipped: number; failed: Array<{ id: string; reason: string }> }
export interface ImportReport {
  mode: 'seed' | 'backup' | 'restore'
  collections: Record<string, CollectionReport>
  settings: string[]
  imagesConverted: number
  warnings: string[]
}

export interface ImportOptions {
  mode: 'seed' | 'backup' | 'restore'
  /** Website lists in the file replace the lists in the database (restore). Otherwise only missing items are added. */
  replaceWebsite: boolean
  /** Overwrite content/business settings that already exist in the database. */
  overwriteSettings: boolean
  userId: string | null
}

const blank = (n = 0): CollectionReport => ({ inFile: n, inserted: 0, updated: 0, skipped: 0, failed: [] })
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => isObj(x) && typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 64) as Array<Record<string, unknown>> : [])
const ts = (v: unknown, fallback = new Date()) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v) : fallback)
const date10 = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

/** Replace embedded data: images anywhere in a value with uploaded files. */
async function externalizeImages(t: Tx, value: unknown, counter: { n: number }): Promise<unknown> {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) {
      const url = await uploadsService.saveDataUrl(value, t)
      if (url !== value) counter.n++
      return url
    }
    return value
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => externalizeImages(t, v, counter)))
  if (isObj(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await externalizeImages(t, v, counter)
    return out
  }
  return value
}

export async function importData(t: Tx, raw: Record<string, unknown>, opts: ImportOptions): Promise<ImportReport> {
  const report: ImportReport = { mode: opts.mode, collections: {}, settings: [], imagesConverted: 0, warnings: [] }
  const counter = { n: 0 }
  const data = (await externalizeImages(t, raw, counter)) as Record<string, unknown>
  report.imagesConverted = counter.n
  let websiteChanged = false

  // ─── Settings ────────────────────────────────────────────────────────────
  if (isObj(data.content)) {
    const exists = await readSetting('content', t)
    if (!exists || opts.overwriteSettings) {
      const current = exists ? await loadContent(t) : withContentDefaults({} as SiteContent)
      const merged = migrateCompanyContacts(mergeDefaults(withContentDefaults(current), withContentDefaults(data.content as unknown as SiteContent)))
      const offerList = (Array.isArray((data.content as unknown as SiteContent).offers) ? (data.content as unknown as SiteContent).offers : merged.offers).map((o, i) => normalizeOffer(o, i))
      const { offers: _o, ...rest } = merged
      await writeSetting(t, 'content', rest, opts.userId)
      await t.delete(offers)
      for (const [i, o] of offerList.entries()) await t.insert(offers).values(offerToRow(o, i + 1))
      report.collections.offers = { ...blank(offerList.length), inserted: offerList.length }
      report.settings.push('content')
      websiteChanged = true
    } else report.warnings.push('Website content already exists in the database — kept (use --overwrite-settings to replace).')
  }
  if (isObj(data.business)) {
    const exists = await readSetting('business', t)
    if (!exists || opts.overwriteSettings) {
      const base = exists ? await loadBusiness(t) : seedBusiness
      await writeSetting(t, 'business', migrateCompanyContacts(mergeDefaults(base, data.business) as BusinessSettings), opts.userId)
      report.settings.push('business')
    } else report.warnings.push('Business settings already exist in the database — kept (use --overwrite-settings to replace).')
  }

  // ─── Website lists ───────────────────────────────────────────────────────
  for (const key of SITE_COLLECTIONS) {
    if (data[key] === undefined) continue
    const items = list(data[key])
    const r = (report.collections[key] = blank(Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0))
    r.failed.push(...(Array.isArray(data[key]) ? (data[key] as unknown[]).length - items.length : 0) > 0 ? [{ id: '?', reason: 'Item without a valid id' }] : [])
    if (opts.replaceWebsite) {
      const ids = items.map((i) => String(i.id))
      await t.delete(siteItems).where(and(eq(siteItems.collection, key), ids.length ? sql`${siteItems.id} not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql`true`))
    }
    const seenSlugs = new Set<string>()
    for (const [i, rawItem] of items.entries()) {
      let item: Record<string, unknown> = { status: 'published', ...rawItem }
      if (key === 'pricingPlans') item = normalizePricingPlan(item as never) as unknown as Record<string, unknown>
      if (key === 'capacityPlans') item = normalizeCapacityPlan(item as never) as unknown as Record<string, unknown>
      if (key === 'services') {
        const slug = String(item.slug ?? '')
        if (seenSlugs.has(slug)) { r.failed.push({ id: String(item.id), reason: `Duplicate service slug "${slug}"` }); continue }
        seenSlugs.add(slug)
      }
      const row = itemToRow(key as SiteCollection, item, typeof item.order === 'number' ? item.order : i + 1)
      const res = opts.replaceWebsite
        ? await t.insert(siteItems).values(row).onConflictDoUpdate({ target: [siteItems.collection, siteItems.id], set: row }).returning({ id: siteItems.id })
        : await t.insert(siteItems).values(row).onConflictDoNothing().returning({ id: siteItems.id })
      if (res.length) { if (opts.replaceWebsite) r.updated++; else r.inserted++ } else r.skipped++
    }
    websiteChanged = true
  }

  // ─── Companies & catalog (upsert by id) ──────────────────────────────────
  if (data.companies !== undefined) {
    const items = list(data.companies) as unknown as Company[]
    const r = (report.collections.companies = blank(items.length))
    for (const [i, c] of items.entries()) {
      const row = companyToRow({ ...c, order: typeof c.order === 'number' ? c.order : i + 1 })
      const [exists] = await t.select({ id: companies.id }).from(companies).where(eq(companies.id, c.id)).limit(1)
      if (exists && !opts.overwriteSettings && opts.mode !== 'restore') { r.skipped++; continue }
      await t.insert(companies).values(row).onConflictDoUpdate({ target: companies.id, set: row })
      if (exists) r.updated++; else r.inserted++
    }
    websiteChanged = true
  }
  if (data.catalog !== undefined) {
    const items = list(data.catalog) as unknown as CatalogItem[]
    const r = (report.collections.catalog = blank(items.length))
    for (const c of items) {
      if (!c.name || !['kit', 'bos', 'service', 'expense'].includes(c.category)) { r.failed.push({ id: c.id, reason: 'Missing name or category' }); continue }
      const res = await t.insert(catalogItems).values(catalogToRow(c)).onConflictDoNothing().returning({ id: catalogItems.id })
      if (res.length) r.inserted++; else r.skipped++
    }
  }

  // ─── Enquiries (never duplicated: id and submissionId) ───────────────────
  const enquiryIds = new Set<string>()
  if (data.enquiries !== undefined) {
    const items = list(data.enquiries)
    const r = (report.collections.enquiries = blank(items.length))
    for (const rawE of items) {
      const e: Enquiry = normalizeEnquiry(rawE as unknown as Enquiry)
      if (!e.name || (!e.phone && !e.email) || !e.service) { r.failed.push({ id: e.id, reason: 'Missing name, contact or requirement' }); continue }
      const [byId] = await t.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.id, e.id)).limit(1)
      const [bySub] = e.submissionId ? await t.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.submissionId, e.submissionId)).limit(1) : []
      if (byId || bySub) { r.skipped++; enquiryIds.add((byId ?? bySub).id); continue }
      await t.insert(enquiries).values({
        id: e.id, submissionId: e.submissionId ?? null, name: e.name, phone: e.phone, email: e.email, city: e.city, address: e.address ?? '', state: e.state ?? '',
        pincode: /^\d{6}$/.test(e.pincode ?? '') ? e.pincode! : '', service: e.service, message: e.message, source: e.source, origin: e.origin ?? 'admin', status: e.status,
        enquiryType: e.enquiryType ?? null, propertyType: e.propertyType ?? null, capacityKw: e.capacityKw ?? null,
        monthlyBill: e.monthlyBill == null ? null : Math.round(e.monthlyBill), notes: e.notes ?? '', estimate: e.estimate ?? null,
        followUpOn: !isClosedStatus(e.status) ? date10(e.followUpOn) : null, createdAt: ts(e.createdAt), updatedAt: ts(e.updatedAt ?? e.createdAt),
      })
      await t.insert(enquiryActivities).values({ id: newId('act'), enquiryId: e.id, type: 'imported', toStatus: e.status, note: `Migrated from the browser data (${opts.mode}).`, actorName: 'Data migration', createdAt: ts(e.createdAt) })
      const due = !isClosedStatus(e.status) ? date10(e.followUpOn) : null
      if (due) await t.insert(followUps).values({ id: newId('fu'), enquiryId: e.id, dueOn: due, note: 'Migrated follow-up date.' })
      enquiryIds.add(e.id)
      r.inserted++
    }
  }
  const linkable = async (id: unknown) => {
    if (typeof id !== 'string' || !id) return null
    if (enquiryIds.has(id)) return id
    const [x] = await t.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.id, id)).limit(1)
    return x ? id : null
  }

  // ─── Proposals, quotations, invoices (insert missing only) ───────────────
  if (data.proposals !== undefined) {
    const items = list(data.proposals) as unknown as Proposal[]
    const r = (report.collections.proposals = blank(items.length))
    for (const p of items) {
      if (!p.proposalNumber || !p.customerName) { r.failed.push({ id: p.id, reason: 'Missing number or customer' }); continue }
      const [clash] = await t.select({ id: proposals.id }).from(proposals).where(sql`${proposals.id} = ${p.id} or ${proposals.proposalNumber} = ${p.proposalNumber}`).limit(1)
      if (clash) { r.skipped++; continue }
      const enquiryId = await linkable(p.enquiryId)
      const doc = { ...p, enquiryId }
      await t.insert(proposals).values({
        id: p.id, proposalNumber: p.proposalNumber, enquiryId, quotationId: p.quotationId ?? null, status: p.status, customerName: p.customerName,
        phone: p.phone ?? '', city: p.city ?? '', capacityKw: Number(p.capacityKw) || 0, grandTotal: Number(p.grandTotal) || 0,
        proposalDate: date10(p.proposalDate) ?? date10(p.createdAt) ?? new Date().toISOString().slice(0, 10), validUntil: date10(p.validUntil), data: doc,
        createdAt: ts(p.createdAt), updatedAt: ts(p.updatedAt ?? p.createdAt),
      })
      r.inserted++
    }
  }
  if (data.quotations !== undefined) {
    const items = list(data.quotations) as unknown as Quotation[]
    const r = (report.collections.quotations = blank(items.length))
    for (const q of items) {
      if (!q.customerName) { r.failed.push({ id: q.id, reason: 'Missing customer' }); continue }
      const [clash] = await t.select({ id: quotations.id }).from(quotations).where(q.quoteNumber ? sql`${quotations.id} = ${q.id} or ${quotations.quoteNumber} = ${q.quoteNumber}` : eq(quotations.id, q.id)).limit(1)
      if (clash) { r.skipped++; continue }
      const enquiryId = await linkable(q.enquiryId)
      const [prop] = q.proposalId ? await t.select({ id: proposals.id }).from(proposals).where(eq(proposals.id, q.proposalId)).limit(1) : []
      const doc = { ...q, enquiryId, proposalId: prop ? q.proposalId! : null }
      await t.insert(quotations).values({
        id: q.id, quoteNumber: q.quoteNumber ?? null, enquiryId, proposalId: doc.proposalId, status: q.status, customerName: q.customerName, phone: q.phone ?? '',
        city: q.city ?? '', capacityKw: Number(q.capacityKw) || 0, grandTotal: Number(q.grandTotal ?? q.estimatedCost) || 0, netCost: Number(q.netCost) || 0,
        quoteDate: date10(q.quoteDate), validUntil: date10(q.validUntil), data: doc, createdAt: ts(q.createdAt), updatedAt: ts(q.updatedAt ?? q.createdAt),
      })
      r.inserted++
    }
  }
  if (data.invoices !== undefined) {
    const items = list(data.invoices) as unknown as Invoice[]
    const r = (report.collections.invoices = blank(items.length))
    const pr = (report.collections.invoicePayments = blank(items.reduce((n, i) => n + (Array.isArray(i.payments) ? i.payments.length : 0), 0)))
    for (const inv of items) {
      if (!inv.invoiceNumber || !inv.customerName) { r.failed.push({ id: inv.id, reason: 'Missing number or customer' }); continue }
      const [clash] = await t.select({ id: invoices.id }).from(invoices).where(sql`${invoices.id} = ${inv.id} or ${invoices.invoiceNumber} = ${inv.invoiceNumber}`).limit(1)
      if (clash) { r.skipped++; pr.skipped += inv.payments?.length ?? 0; continue }
      const [quo] = inv.quotationId ? await t.select({ id: quotations.id }).from(quotations).where(eq(quotations.id, inv.quotationId)).limit(1) : []
      const { payments = [], isOverdue: _o, ...rest } = inv
      await t.insert(invoices).values({
        id: inv.id, invoiceNumber: inv.invoiceNumber, quotationId: quo ? inv.quotationId : null, status: inv.status, paymentStatus: inv.paymentStatus,
        customerName: inv.customerName, phone: inv.phone ?? '', gstin: inv.gstin ?? '', city: inv.city ?? '', reference: inv.reference ?? '',
        invoiceDate: date10(inv.invoiceDate) ?? new Date().toISOString().slice(0, 10), dueDate: date10(inv.dueDate), grandTotal: Number(inv.grandTotal) || 0,
        amountPaid: Number(inv.amountPaid) || 0, amountDue: Number(inv.amountDue) || 0, data: { ...rest, quotationId: quo ? inv.quotationId : null },
        createdAt: ts(inv.createdAt), updatedAt: ts(inv.updatedAt ?? inv.createdAt),
      })
      r.inserted++
      for (const p of payments) {
        if (!(Number(p.amount) > 0)) { pr.failed.push({ id: p.id, reason: 'Amount must be more than 0' }); continue }
        await t.insert(invoicePayments).values({ id: p.id && p.id.length <= 64 ? p.id : newId('pay'), invoiceId: inv.id, date: date10(p.date) ?? inv.invoiceDate, amount: Number(p.amount), method: p.method, reference: p.reference ?? '', note: p.note ?? '' }).onConflictDoNothing()
        pr.inserted++
      }
    }
  }

  // ─── Number counters: never go backwards ─────────────────────────────────
  if (isObj(data.counters)) {
    for (const [key, value] of Object.entries(data.counters)) {
      if (!/^(invoice|quotation|proposal):\d{4}-\d{2}$/.test(key) || !Number.isInteger(value)) continue
      await t.insert(counters).values({ key, value: value as number }).onConflictDoUpdate({ target: counters.key, set: { value: sql`greatest(${counters.value}, ${value as number})` } })
    }
    report.settings.push('counters')
  }

  if (websiteChanged) await bumpSiteVersion(t, opts.userId)
  return report
}

/** Ids from the file that must now exist in the database (verification after import). */
export async function verifyImported(t: Tx, raw: Record<string, unknown>): Promise<Record<string, { expected: number; found: number; missing: string[] }>> {
  const out: Record<string, { expected: number; found: number; missing: string[] }> = {}
  const check = async (name: string, ids: string[], query: (ids: string[]) => Promise<Array<{ id: string }>>) => {
    if (!ids.length) return
    const found = new Set((await query(ids)).map((r) => r.id))
    out[name] = { expected: ids.length, found: found.size, missing: ids.filter((i) => !found.has(i)).slice(0, 50) }
  }
  const idsOf = (k: string) => list(raw[k]).map((x) => String(x.id))
  for (const key of SITE_COLLECTIONS) await check(key, idsOf(key), (ids) => t.select({ id: siteItems.id }).from(siteItems).where(and(eq(siteItems.collection, key), inArray(siteItems.id, ids))))
  await check('companies', idsOf('companies'), (ids) => t.select({ id: companies.id }).from(companies).where(inArray(companies.id, ids)))
  await check('catalog', idsOf('catalog'), (ids) => t.select({ id: catalogItems.id }).from(catalogItems).where(inArray(catalogItems.id, ids)))
  // Enquiries may have matched an existing record by submissionId (counted as found).
  const enq = list(raw.enquiries)
  if (enq.length) {
    const ids = enq.map((e) => String(e.id))
    const subs = enq.map((e) => (typeof e.submissionId === 'string' ? e.submissionId : '')).filter(Boolean)
    const rows = await t.select({ id: enquiries.id, sub: enquiries.submissionId }).from(enquiries).where(sql`${enquiries.id} in ${ids} ${subs.length ? sql`or ${enquiries.submissionId} in ${subs}` : sql``}`)
    const foundIds = new Set(rows.map((r) => r.id))
    const foundSubs = new Set(rows.map((r) => r.sub))
    const missing = enq.filter((e) => !foundIds.has(String(e.id)) && !(e.submissionId && foundSubs.has(String(e.submissionId)))).map((e) => String(e.id))
    out.enquiries = { expected: enq.length, found: enq.length - missing.length, missing: missing.slice(0, 50) }
  }
  await check('proposals', idsOf('proposals'), (ids) => t.select({ id: proposals.id }).from(proposals).where(inArray(proposals.id, ids)))
  await check('quotations', idsOf('quotations'), (ids) => t.select({ id: quotations.id }).from(quotations).where(inArray(quotations.id, ids)))
  await check('invoices', idsOf('invoices'), (ids) => t.select({ id: invoices.id }).from(invoices).where(inArray(invoices.id, ids)))
  return out
}
