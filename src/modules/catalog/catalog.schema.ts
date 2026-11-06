import { z } from 'zod'
import { listQuery } from '../../lib/http'

export const catalogBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().max(200),
  sku: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2000).default(''),
  hsn: z.string().trim().max(12).default(''),
  unit: z.string().trim().max(20).default('Nos'),
  rate: z.number().finite(),
  gstRate: z.number().finite(),
  category: z.enum(['kit', 'bos', 'service', 'expense']),
})

export const listCatalogQuery = listQuery.extend({
  category: z.enum(['kit', 'bos', 'service', 'expense']).optional(),
  sort: z.enum(['name', 'rate', 'category', 'updatedAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  /** `all=1` returns every item (pickers). */
  all: z.enum(['1', 'true']).optional(),
})
export type ListCatalogQuery = z.infer<typeof listCatalogQuery>
