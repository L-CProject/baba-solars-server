import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { CatalogItem } from '@/types'
import { validateCatalogItem } from '@/lib/catalog'
import { db } from '../../db/client'
import { catalogItems } from '../../db/schema'
import { assertValid, notFound } from '../../lib/errors'
import { paginated, searchTerms } from '../../lib/http'
import type { ListCatalogQuery } from './catalog.schema'

type Row = typeof catalogItems.$inferSelect
export const catalogFromRow = (r: Row): CatalogItem => ({
  id: r.id, name: r.name, ...(r.sku ? { sku: r.sku } : {}), description: r.description, hsn: r.hsn, unit: r.unit, rate: r.rate, gstRate: r.gstRate,
  category: r.category as CatalogItem['category'],
})
export const catalogToRow = (i: CatalogItem): typeof catalogItems.$inferInsert => ({
  id: i.id, name: i.name.trim(), sku: i.sku ?? '', description: i.description, hsn: i.hsn, unit: i.unit, rate: i.rate, gstRate: i.gstRate, category: i.category, updatedAt: new Date(),
})

const SORT = { name: sql`lower(${catalogItems.name})`, rate: catalogItems.rate, category: catalogItems.category, updatedAt: catalogItems.updatedAt }

export const catalogService = {
  async list(q: ListCatalogQuery) {
    const where: SQL[] = []
    if (q.category) where.push(eq(catalogItems.category, q.category))
    for (const term of searchTerms(q.search))
      where.push(sql`lower(${catalogItems.name} || ' ' || ${catalogItems.sku} || ' ' || ${catalogItems.hsn} || ' ' || ${catalogItems.description}) like ${term}`)
    const w = where.length ? and(...where) : undefined
    const dir = q.order === 'asc' ? asc : desc
    const base = db.select().from(catalogItems).where(w).orderBy(dir(SORT[q.sort] as never), asc(catalogItems.id))
    if (q.all) {
      const rows = await base
      return paginated(rows.map(catalogFromRow), rows.length, { page: 1, limit: Math.max(1, rows.length) })
    }
    const [rows, [{ count }]] = await Promise.all([
      base.limit(q.limit).offset((q.page - 1) * q.limit),
      db.select({ count: sql<number>`count(*)::int` }).from(catalogItems).where(w),
    ])
    return paginated(rows.map(catalogFromRow), count, q)
  },
  async save(item: CatalogItem): Promise<CatalogItem> {
    assertValid(validateCatalogItem(item), 'Some fields need attention.')
    const row = catalogToRow(item)
    const [saved] = await db.insert(catalogItems).values(row).onConflictDoUpdate({ target: catalogItems.id, set: row }).returning()
    return catalogFromRow(saved)
  },
  async remove(id: string) {
    const res = await db.delete(catalogItems).where(eq(catalogItems.id, id))
    if (!res.rowCount) throw notFound('Item')
  },
}
