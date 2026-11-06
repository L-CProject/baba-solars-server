import { z } from 'zod'

export const ownerDashboardQuery = z.object({
  /** How many recent items to return. */
  limit: z.coerce.number().int().min(1).max(50).default(10),
})
