import { asc, eq } from 'drizzle-orm'
import type { BusinessSettings, SiteContent } from '@/types'
import { withContentDefaults } from '@/data/settings-defaults'
import { mergeDefaults } from '@/lib/schemas'
import { normalizeOffer } from '@/lib/offers'
import { seedBusiness } from '@/mocks/seed/business'
import type { DbOrTx } from '../../db/client'
import { db } from '../../db/client'
import { offers, siteSettings } from '../../db/schema'
import { offerFromRow } from '../offers/offers.mapper'

/** Low-level reads/writes of the settings documents (shared by several modules). */
export async function readSetting<T>(key: string, t: DbOrTx = db): Promise<T | null> {
  const [row] = await t.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1)
  return (row?.value as T) ?? null
}
export async function writeSetting(t: DbOrTx, key: string, value: unknown, userId: string | null) {
  await t.insert(siteSettings).values({ key, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } })
}

/** Website content with defaults for any field added since it was saved, and offers from their table. */
export async function loadContent(t: DbOrTx = db): Promise<SiteContent> {
  const stored = (await readSetting<Partial<SiteContent>>('content', t)) ?? {}
  const rows = await t.select().from(offers).orderBy(asc(offers.sortOrder), asc(offers.createdAt))
  const content = withContentDefaults(stored as SiteContent)
  content.offers = rows.map((r, i) => normalizeOffer(offerFromRow(r), i))
  return content
}

export async function loadBusiness(t: DbOrTx = db): Promise<BusinessSettings> {
  return mergeDefaults(seedBusiness, (await readSetting<Partial<BusinessSettings>>('business', t)) ?? {})
}

/** Published version: changes whenever anything the public website shows changes. */
export async function siteVersion(t: DbOrTx = db): Promise<string> {
  return (await readSetting<string>('site_version', t)) ?? 'seed'
}
export async function bumpSiteVersion(t: DbOrTx, userId: string | null = null) {
  await writeSetting(t, 'site_version', new Date().toISOString(), userId)
}
