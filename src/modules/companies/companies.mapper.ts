import type { Company } from '@/types'
import type { companies } from './companies.model'

type Row = typeof companies.$inferSelect

export const companyFromRow = (r: Row): Company => ({ ...r.data, id: r.id, name: r.name, isActive: r.isActive, order: r.sortOrder, updatedAt: r.updatedAt.toISOString() })

export function companyToRow(c: Company): typeof companies.$inferInsert {
  const { id, name, isActive, order, updatedAt: _u, ...data } = c
  return { id, name, isActive, sortOrder: order, data, updatedAt: new Date() }
}
