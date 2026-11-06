import type { BusinessSettings } from '@/types'
import { mergeDefaults } from '@/lib/schemas'
import { tx } from '../../db/client'
import { assertValid } from '../../lib/errors'
import { loadBusiness, writeSetting } from '../content/settings.repo'

export function validateBusiness(next: BusinessSettings) {
  const e: Record<string, string> = {}
  if (!next.legalName?.trim()) e.legalName = 'Enter the legal business name.'
  if (next.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(next.gstin)) e.gstin = 'Enter a valid 15-character GSTIN, e.g. 22AAAAA0000A1Z5.'
  if (next.gstin && next.gstin.slice(0, 2) !== next.stateCode) e.gstin = 'GSTIN state code does not match the business state.'
  if (next.bank?.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(next.bank.ifsc)) e['bank.ifsc'] = 'Enter a valid IFSC, e.g. SBIN0001234.'
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(next.invoice.prefix)) e['invoice.prefix'] = 'Use letters, numbers, / and - only.'
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(next.quotation.prefix)) e['quotation.prefix'] = 'Use letters, numbers, / and - only.'
  for (const q of ['normal', 'premium'] as const) {
    const total = next.packageBreakdown[q].reduce((s, r) => s + Number(r.share || 0), 0)
    if (Math.abs(total - 100) > 0.5) e[`packageBreakdown.${q}`] = `${q === 'normal' ? 'Normal' : 'Premium'} shares add up to ${total.toFixed(1)}% — they must total 100%.`
  }
  assertValid(e)
}

export const businessService = {
  get: () => loadBusiness(),
  async update(patch: Partial<BusinessSettings>, userId: string): Promise<BusinessSettings> {
    return tx(async (t) => {
      const current = await loadBusiness(t)
      const next = mergeDefaults(current, patch) as BusinessSettings
      if (patch.packageBreakdown) next.packageBreakdown = patch.packageBreakdown
      validateBusiness(next)
      next.updatedAt = new Date().toISOString()
      await writeSetting(t, 'business', next, userId)
      return next
    })
  },
}
