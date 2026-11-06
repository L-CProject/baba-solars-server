import { sql } from 'drizzle-orm'
import { financialYear } from '@/lib/documents'
import type { DbOrTx } from './client'
import { counters } from './common.model'

/**
 * Next document number, e.g. BS/QT/2026-27/0007. Atomic (INSERT … ON CONFLICT DO UPDATE … RETURNING),
 * so two users saving at the same moment never get the same number.
 */
export async function nextDocumentNumber(t: DbOrTx, type: 'invoice' | 'quotation' | 'proposal', prefix: string, date: string): Promise<string> {
  const fy = financialYear(date)
  const [row] = await t
    .insert(counters)
    .values({ key: `${type}:${fy}`, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1`, updatedAt: new Date() } })
    .returning({ value: counters.value })
  return `${prefix}/${fy}/${String(row.value).padStart(4, '0')}`
}
