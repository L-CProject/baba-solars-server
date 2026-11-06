import { asc, eq, sql } from 'drizzle-orm'
import type { Company, Quality } from '@/types'
import type { PricedPackage } from '@/types/api'
import { packageLines, packagePrice, panelCount, snapshotOf } from '@/lib/pricing'
import { db, tx } from '../../db/client'
import { companies } from '../../db/schema'
import { assertValid, badRequest, notFound } from '../../lib/errors'
import { bumpSiteVersion, loadBusiness } from '../content/settings.repo'
import { companyFromRow, companyToRow } from './companies.mapper'

/** Same rules the admin form shows (prices, sizes, panel wattage). */
function validateCompany(c: Company) {
  const e: Record<string, string> = {}
  if (!c.name.trim()) e.name = 'Enter a company name.'
  const sizes = new Set<number>()
  c.packages.forEach((p, i) => {
    if (!(p.capacityKw > 0)) e[`packages.${i}.capacityKw`] = 'Size must be more than 0.'
    else if (sizes.has(p.capacityKw)) e[`packages.${i}.capacityKw`] = 'This size is listed twice.'
    sizes.add(p.capacityKw)
    if (!(p.normal > 0)) e[`packages.${i}.normal`] = 'Enter the Normal price.'
    if (!(p.premium > 0)) e[`packages.${i}.premium`] = 'Enter the Premium price.'
    else if (p.premium < p.normal) e[`packages.${i}.premium`] = 'Premium is usually not cheaper than Normal — check the price.'
  })
  if (!c.packages.length) e.packages = 'Add at least one package size.'
  for (const q of ['normal', 'premium'] as const)
    if (!(c.qualities[q].panelWattage >= 50 && c.qualities[q].panelWattage <= 1000)) e[`qualities.${q}.panelWattage`] = 'Panel wattage should be 50–1000 W.'
  assertValid(e)
}

export const companiesService = {
  async list(): Promise<Company[]> {
    return (await db.select().from(companies).orderBy(asc(companies.sortOrder), asc(companies.name))).map(companyFromRow)
  },
  async get(id: string): Promise<Company> {
    const [r] = await db.select().from(companies).where(eq(companies.id, id)).limit(1)
    if (!r) throw notFound('Company')
    return companyFromRow(r)
  },
  async save(c: Company, userId: string): Promise<Company> {
    validateCompany(c)
    return tx(async (t) => {
      const [exists] = await t.select({ id: companies.id }).from(companies).where(eq(companies.id, c.id)).limit(1)
      const order = exists ? c.order : (((await t.select({ m: sql<number>`coalesce(max(${companies.sortOrder}), 0)::int` }).from(companies))[0]?.m ?? 0) + 1)
      const row = companyToRow({ ...c, order, packages: [...c.packages].sort((a, b) => a.capacityKw - b.capacityKw) })
      const [saved] = await t.insert(companies).values(row).onConflictDoUpdate({ target: companies.id, set: row }).returning()
      await bumpSiteVersion(t, userId)
      return companyFromRow(saved)
    })
  },
  async remove(id: string, userId: string) {
    await tx(async (t) => {
      const res = await t.delete(companies).where(eq(companies.id, id))
      if (!res.rowCount) throw notFound('Company')
      await bumpSiteVersion(t, userId)
    })
  },
  /** Company + size + quality → price from the price list and an itemised bill of materials. */
  async priceQuote(companyId: string, capacityKw: number, quality: Quality, supplyType: 'intra' | 'inter'): Promise<PricedPackage> {
    const c = await companiesService.get(companyId)
    const p = packagePrice(c, capacityKw, quality)
    if (!p) throw badRequest('This company has no package prices yet.')
    const business = await loadBusiness()
    return {
      company: snapshotOf(c, quality), price: p.price, exact: p.exact, basis: p.basis,
      panelCount: panelCount(capacityKw, c.qualities[quality].panelWattage),
      items: packageLines(c, capacityKw, quality, p.price, business.packageBreakdown[quality], supplyType),
    }
  },
}
