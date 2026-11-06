import { asc, eq, sql } from 'drizzle-orm'
import type { Offer } from '@/types'
import { activeOffers, normalizeOffer, validateOffer } from '@/lib/offers'
import { db, tx } from '../../db/client'
import { offers } from '../../db/schema'
import { assertValid, notFound } from '../../lib/errors'
import { bumpSiteVersion } from '../content/settings.repo'
import { invalidateSiteCache } from '../content/content.service'
import { offerFromRow, offerToRow } from './offers.mapper'

export const offersService = {
  async list(): Promise<Offer[]> {
    return (await db.select().from(offers).orderBy(asc(offers.sortOrder), asc(offers.createdAt))).map((r, i) => normalizeOffer(offerFromRow(r), i))
  },
  /** Live offers only (enabled and within their dates, India time). */
  async active(): Promise<Offer[]> {
    return activeOffers(await offersService.list())
  },
  async save(input: Offer, userId: string): Promise<Offer> {
    const offer = normalizeOffer(input)
    assertValid(validateOffer(offer))
    const saved = await tx(async (t) => {
      const [existing] = await t.select({ sortOrder: offers.sortOrder }).from(offers).where(eq(offers.id, offer.id)).limit(1)
      const order = existing?.sortOrder ?? ((await t.select({ m: sql<number>`coalesce(max(${offers.sortOrder}), 0)::int` }).from(offers))[0].m + 1)
      const row = offerToRow(offer, order)
      const [r] = await t.insert(offers).values(row).onConflictDoUpdate({ target: offers.id, set: row }).returning()
      await bumpSiteVersion(t, userId)
      return offerFromRow(r)
    })
    await invalidateSiteCache()
    return saved
  },
  async remove(id: string, userId: string) {
    await tx(async (t) => {
      const res = await t.delete(offers).where(eq(offers.id, id))
      if (!res.rowCount) throw notFound('Offer')
      await bumpSiteVersion(t, userId)
    })
    await invalidateSiteCache()
  },
}
