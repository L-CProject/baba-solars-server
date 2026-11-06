import { and, asc, eq, sql } from 'drizzle-orm'
import type { CollectionItem, PublicCollectionKey, SiteContent } from '@/types'
import type { PublicSite } from '@/types/api'
import { mergeDefaults, normalizeCapacityPlan, normalizePricingPlan, validateContent, validateItem } from '@/lib/schemas'
import { normalizeOffer, validateOffers } from '@/lib/offers'
import { validatePlanTiers } from '@/lib/plans'
import { validateCalculatorSettings } from '@/lib/calculatorSettings'
import { withContentDefaults } from '@/data/settings-defaults'
import { db, tx, type DbOrTx, type Tx } from '../../db/client'
import { offers, siteItems } from '../../db/schema'
import { AppError, assertValid, conflict, notFound } from '../../lib/errors'
import { cache } from '../../jobs/cache'
import { companiesService } from '../companies/companies.service'
import { offerToRow } from '../offers/offers.mapper'
import { SITE_COLLECTIONS, type SiteCollection } from './content.model'
import { bumpSiteVersion, loadContent, siteVersion, writeSetting } from './settings.repo'

type ItemRow = typeof siteItems.$inferSelect
const STAMPED: SiteCollection[] = ['pricingPlans', 'capacityPlans']
const SITE_CACHE_KEY = 'site:v1'

export const itemFromRow = (r: ItemRow) => ({ ...r.data, id: r.id, status: r.status, order: r.sortOrder }) as unknown as CollectionItem<PublicCollectionKey>

export function itemToRow(collection: SiteCollection, item: Record<string, unknown>, sortOrder: number): typeof siteItems.$inferInsert {
  const { id, status, order: _o, ...data } = item
  return {
    collection, id: String(id), status: status === 'draft' ? 'draft' : 'published', sortOrder,
    slug: collection === 'services' && typeof data.slug === 'string' ? data.slug : null, data, updatedAt: new Date(),
  }
}

function normalizeItem(key: SiteCollection, item: Record<string, unknown>) {
  if (key === 'pricingPlans') return normalizePricingPlan(item as never) as unknown as Record<string, unknown>
  if (key === 'capacityPlans') return normalizeCapacityPlan(item as never) as unknown as Record<string, unknown>
  return item
}

async function afterSiteChange(t: Tx, userId: string | null) {
  await bumpSiteVersion(t, userId)
}
export const invalidateSiteCache = () => cache.del(SITE_CACHE_KEY)

/** Replace the offers table with the edited list (one transaction; ids are kept). */
async function saveOffers(t: Tx, list: SiteContent['offers']) {
  const ids = list.map((o) => o.id)
  if (new Set(ids).size !== ids.length) throw conflict('Two offers have the same id.')
  await t.delete(offers).where(ids.length ? sql`${offers.id} not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql`true`)
  for (const [i, o] of list.entries()) {
    const row = offerToRow(o, i + 1)
    await t.insert(offers).values(row).onConflictDoUpdate({ target: offers.id, set: row })
  }
}

export const contentService = {
  /** Everything a visitor needs, in one response (cached in Redis when configured). */
  async loadSite(staff: boolean): Promise<PublicSite> {
    if (!staff) {
      const hit = await cache.get<PublicSite>(SITE_CACHE_KEY)
      if (hit) return hit
    }
    const [content, companies, version, rows] = await Promise.all([
      loadContent(), companiesService.list(), siteVersion(),
      db.select().from(siteItems).where(staff ? undefined : eq(siteItems.status, 'published')).orderBy(asc(siteItems.collection), asc(siteItems.sortOrder), asc(siteItems.id)),
    ])
    const site = { version, content, companies } as unknown as Record<string, unknown>
    for (const k of SITE_COLLECTIONS) site[k] = rows.filter((r) => r.collection === k).map(itemFromRow)
    if (!staff) await cache.set(SITE_CACHE_KEY, site, 300)
    return site as unknown as PublicSite
  },

  getContent: () => loadContent(),

  async getCollection(key: SiteCollection, staff: boolean) {
    const rows = await db.select().from(siteItems)
      .where(staff ? eq(siteItems.collection, key) : and(eq(siteItems.collection, key), eq(siteItems.status, 'published')))
      .orderBy(asc(siteItems.sortOrder), asc(siteItems.id))
    return rows.map(itemFromRow)
  },

  async upsertItem(key: SiteCollection, raw: Record<string, unknown>, userId: string) {
    const item = normalizeItem(key, raw)
    assertValid(validateItem(key as PublicCollectionKey, item as never))
    const saved = await tx(async (t) => {
      const [existing] = await t.select().from(siteItems).where(and(eq(siteItems.collection, key), eq(siteItems.id, String(item.id)))).for('update').limit(1)
      const merged = { ...(existing ? itemFromRow(existing) : {}), ...item } as Record<string, unknown>
      if (STAMPED.includes(key)) merged.updatedAt = new Date().toISOString()
      if (key === 'services') {
        const [clash] = await t.select({ id: siteItems.id }).from(siteItems)
          .where(and(eq(siteItems.collection, 'services'), eq(siteItems.slug, String(merged.slug)), sql`${siteItems.id} <> ${String(merged.id)}`)).limit(1)
        if (clash) throw conflict('Another service already uses this URL slug.', { slug: 'Another service already uses this URL slug.' })
      }
      let order = typeof merged.order === 'number' ? merged.order : existing?.sortOrder
      if (order === undefined) {
        const [{ m }] = await t.select({ m: sql<number>`coalesce(max(${siteItems.sortOrder}), 0)::int` }).from(siteItems).where(eq(siteItems.collection, key))
        order = m + 1
      }
      const row = itemToRow(key, merged, order)
      const [out] = await t.insert(siteItems).values(row).onConflictDoUpdate({ target: [siteItems.collection, siteItems.id], set: row }).returning()
      await afterSiteChange(t, userId)
      return itemFromRow(out)
    })
    await invalidateSiteCache()
    return saved
  },

  async removeItem(key: SiteCollection, id: string, userId: string) {
    await tx(async (t) => {
      const res = await t.delete(siteItems).where(and(eq(siteItems.collection, key), eq(siteItems.id, id)))
      if (!res.rowCount) throw notFound('Item')
      await afterSiteChange(t, userId)
    })
    await invalidateSiteCache()
  },

  async reorder(key: SiteCollection, ids: string[], userId: string) {
    const out = await tx(async (t) => {
      const rows = await t.select().from(siteItems).where(eq(siteItems.collection, key)).for('update')
      const same = ids.length === rows.length && new Set(ids).size === ids.length && rows.every((r) => ids.includes(r.id))
      if (!same) throw new AppError('conflict', 'The list changed in another tab. It has been refreshed — please try again.')
      for (const [i, id] of ids.entries()) await t.update(siteItems).set({ sortOrder: i + 1, updatedAt: new Date() }).where(and(eq(siteItems.collection, key), eq(siteItems.id, id)))
      await afterSiteChange(t, userId)
      return (await t.select().from(siteItems).where(eq(siteItems.collection, key)).orderBy(asc(siteItems.sortOrder))).map(itemFromRow)
    })
    await invalidateSiteCache()
    return out
  },

  /** Partial update of top-level sections, deep-merged like the admin panel expects. Offers go to their own table. */
  async updateContent(patch: Partial<SiteContent>, userId: string): Promise<SiteContent> {
    const saved = await tx(async (t) => {
      const current = await loadContent(t)
      const next = { ...current } as Record<string, unknown>
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'updatedAt') continue
        const cur = (current as unknown as Record<string, unknown>)[k]
        next[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' ? mergeDefaults(cur, v) : v
      }
      const content = withContentDefaults(next as unknown as SiteContent)
      if (patch.whatsapp !== undefined) content.whatsapp = String(patch.whatsapp).replace(/\D/g, '')
      const touched = new Set(Object.keys(patch))
      const errors = Object.fromEntries(Object.entries(validateContent(content)).filter(([p]) => touched.has(p.split('.')[0])))
      if (patch.offers !== undefined) {
        content.offers = (Array.isArray(patch.offers) ? patch.offers : []).map((o, i) => ({ ...normalizeOffer(o, i), updatedAt: new Date().toISOString() }))
        Object.assign(errors, validateOffers(content.offers))
      }
      if (patch.plans) for (const [k, v] of Object.entries(validatePlanTiers(content.plans))) errors[`plans.${k}`] = v
      if (patch.calculator) Object.assign(errors, validateCalculatorSettings(content.calculator))
      assertValid(errors)
      content.updatedAt = new Date().toISOString()
      const { offers: offerList, ...rest } = content
      await writeSetting(t, 'content', rest, userId)
      if (patch.offers !== undefined) await saveOffers(t, offerList)
      await afterSiteChange(t, userId)
      return loadContent(t)
    })
    await invalidateSiteCache()
    return saved
  },

  /** Seed / restore helpers (data migration and backups). */
  async writeContentRaw(t: DbOrTx, content: SiteContent, userId: string | null) {
    const { offers: offerList, ...rest } = content
    await writeSetting(t, 'content', rest, userId)
    await saveOffers(t as Tx, offerList ?? [])
  },
}
