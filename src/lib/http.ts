import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import type { Paginated } from '@/types'

/** Express 5 forwards rejected promises to the error handler; this keeps controller types tidy. */
export const handler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json(data)
export const noContent = (res: Response) => res.status(204).end()

/** Route params `:id` */
export const idParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id.') })

/** Shared list query: page, limit, search, sort, order, date range. Each module extends it with its own filters. */
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(120).optional().default(''),
  order: z.enum(['asc', 'desc']).default('desc'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
export type ListQuery = z.infer<typeof listQuery>

export function paginated<T>(items: T[], total: number, q: { page: number; limit: number }): Paginated<T> {
  return { items, total, page: q.page, pageSize: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) }
}

/** Words of a search box → LIKE patterns (wildcards in user input are escaped). */
export const searchTerms = (s: string) =>
  s.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6).map((w) => `%${w.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
