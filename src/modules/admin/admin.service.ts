import { asc, desc, inArray, sql } from 'drizzle-orm'
import type { SiteContent } from '@/types'
import type { DataSnapshot } from '@/types/api'
import { db, tx } from '../../db/client'
import { counters, proposals, quotations, siteItems } from '../../db/schema'
import { todayIST } from '../../lib/time'
import { AppError } from '../../lib/errors'
import { catalogService } from '../catalog/catalog.service'
import { companiesService } from '../companies/companies.service'
import { contentService, invalidateSiteCache } from '../content/content.service'
import { SITE_COLLECTIONS } from '../content/content.model'
import { loadBusiness, loadContent } from '../content/settings.repo'
import { enquiriesService } from '../enquiries/enquiries.service'
import { invoicesService } from '../invoices/invoices.service'
import { proposalFromRow } from '../proposals/proposals.service'
import { quotationFromRow } from '../quotations/quotations.service'
import { importData, verifyImported } from './data-import.service'
import { bundledSeed } from './seed-data'

export const adminService = {
  /** Admin dashboard: lead pipeline, documents, billing, website counts — one request. */
  async dashboard(perms: { leads: boolean; quotations: boolean; invoices: boolean }) {
    const monthStart = `${todayIST().slice(0, 7)}-01`
    const [leads, docRows, billing, contentCounts, recentQuotes] = await Promise.all([
      perms.leads ? enquiriesService.stats() : null,
      perms.quotations
        ? db.execute<{ kind: string; open: number; open_value: number; draft: number; accepted_value: number }>(sql`
            select 'proposals' as kind, count(*) filter (where status in ('draft','sent'))::int as open,
              coalesce(sum(grand_total) filter (where status in ('draft','sent')), 0)::float8 as open_value,
              count(*) filter (where status = 'draft')::int as draft, 0::float8 as accepted_value from proposals
            union all
            select 'quotations', count(*) filter (where status in ('pending','sent'))::int,
              coalesce(sum(net_cost) filter (where status in ('pending','sent')), 0)::float8,
              count(*) filter (where status = 'pending')::int,
              coalesce(sum(net_cost) filter (where status = 'accepted'), 0)::float8 from quotations`)
        : null,
      perms.invoices ? invoicesService.summary(monthStart) : null,
      db.select({ collection: siteItems.collection, status: siteItems.status, n: sql<number>`count(*)::int` }).from(siteItems).groupBy(siteItems.collection, siteItems.status),
      perms.quotations ? db.select().from(quotations).orderBy(desc(quotations.createdAt)).limit(5) : [],
    ])
    const docs = Object.fromEntries((docRows?.rows ?? []).map((r) => [r.kind, r]))
    const website = Object.fromEntries(SITE_COLLECTIONS.map((k) => [k, {
      published: contentCounts.find((c) => c.collection === k && c.status === 'published')?.n ?? 0,
      draft: contentCounts.find((c) => c.collection === k && c.status === 'draft')?.n ?? 0,
    }]))
    return {
      leads,
      recentEnquiries: perms.leads ? (await enquiriesService.list({ page: 1, limit: 5, search: '', order: 'desc', sort: 'createdAt' }, null)).items : [],
      proposals: docs.proposals ? { open: docs.proposals.open, openValue: docs.proposals.open_value, draft: docs.proposals.draft } : null,
      quotations: docs.quotations ? { open: docs.quotations.open, pipeline: docs.quotations.open_value, pending: docs.quotations.draft, acceptedValue: docs.quotations.accepted_value } : null,
      billing,
      recentQuotations: recentQuotes.map(quotationFromRow),
      website,
    }
  },

  /** Backup in the same JSON format as before (website data; leads and documents on request). */
  async exportSnapshot(includeLeads: boolean): Promise<DataSnapshot> {
    const [content, business, companies, catalog, items] = await Promise.all([
      loadContent(), loadBusiness(), companiesService.list(), catalogService.list({ page: 1, limit: 200, search: '', order: 'asc', sort: 'name', all: '1' }),
      db.select().from(siteItems).orderBy(asc(siteItems.collection), asc(siteItems.sortOrder)),
    ])
    const data: Record<string, unknown> = { content, business, companies, catalog: catalog.items }
    for (const k of SITE_COLLECTIONS) data[k] = items.filter((i) => i.collection === k).map((i) => ({ ...i.data, id: i.id, status: i.status, order: i.sortOrder }))
    if (includeLeads) {
      const [enq, props, quotes, invRows, ctr] = await Promise.all([
        enquiriesService.byIds(), db.select().from(proposals).orderBy(desc(proposals.createdAt)), db.select().from(quotations).orderBy(desc(quotations.createdAt)),
        db.execute<{ id: string }>(sql`select id from invoices order by invoice_date desc`), db.select().from(counters),
      ])
      data.enquiries = enq
      data.proposals = props.map(proposalFromRow)
      data.quotations = quotes.map(quotationFromRow)
      data.invoices = await Promise.all(invRows.rows.map((r) => invoicesService.get(r.id)))
      data.counters = Object.fromEntries(ctr.map((c) => [c.key, c.value]))
    }
    return { schemaVersion: 7, exportedAt: new Date().toISOString(), data }
  },

  /** Restore a backup. Website data is replaced; leads/documents are only added (existing ones are never overwritten). */
  async restore(snapshot: { data: Record<string, unknown> }, userId: string) {
    if (!Object.keys(snapshot.data).length) throw new AppError('validation', 'The file contains no site data.')
    const result = await tx(async (t) => {
      const report = await importData(t, snapshot.data, { mode: 'restore', replaceWebsite: true, overwriteSettings: true, userId })
      const verification = await verifyImported(t, snapshot.data)
      return { report, verification }
    })
    await invalidateSiteCache()
    const imported = Object.keys(result.report.collections).concat(result.report.settings)
    return { imported, ...result }
  },

  /** Put the website text, lists and offers back to the original content. Leads, documents, users and billing are NOT touched. */
  async resetWebsite(userId: string) {
    const seed = bundledSeed()
    await tx(async (t) => {
      await t.delete(siteItems).where(inArray(siteItems.collection, [...SITE_COLLECTIONS]))
      await contentService.writeContentRaw(t, seed.content as SiteContent, userId)
      await importData(t, { ...seed, content: undefined, business: undefined, catalog: undefined }, { mode: 'restore', replaceWebsite: true, overwriteSettings: true, userId })
    })
    await invalidateSiteCache()
  },
}
