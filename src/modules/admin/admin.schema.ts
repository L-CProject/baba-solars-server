import { z } from 'zod'

export const exportQuery = z.object({ includeLeads: z.enum(['1', 'true', '0', 'false']).optional().transform((v) => v === '1' || v === 'true') })
/** A backup file (same format the old browser-only admin exported). */
export const restoreBody = z.object({
  schemaVersion: z.number().optional(),
  exportedAt: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
})
export const resetBody = z.object({ confirm: z.literal('RESET WEBSITE CONTENT', { message: 'Type RESET WEBSITE CONTENT to confirm.' }) })

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date (YYYY-MM-DD).').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Use a valid date.')
/** Dashboard filter: today, last 7 / 30 days, this month, a custom range, or all time (default). */
export const analyticsQuery = z.object({
  range: z.enum(['all', 'today', '7d', '30d', 'month', 'custom']).default('all'),
  from: isoDay.optional(),
  to: isoDay.optional(),
})
