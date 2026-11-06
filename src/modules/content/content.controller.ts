import type { Request, Response } from 'express'
import type { SiteContent } from '@/types'
import { noContent, ok } from '../../lib/http'
import { can } from '../../lib/access'
import { collectionItemSchemas, collectionParam, contentPatch, itemBody, itemParams, reorderBody } from './content.schema'
import { contentService as s } from './content.service'

/** Staff with content access see hidden (draft) items too. */
const isStaff = (req: Request) => !!req.user && can(req.user.role, 'content:read')

export const contentController = {
  site: async (req: Request, res: Response) => {
    const staff = isStaff(req)
    // Visitors may cache briefly; staff always get fresh data. Vary: Cookie stops a browser from reusing
    // the cached visitor copy (without drafts) right after signing in.
    res.vary('Cookie')
    res.setHeader('Cache-Control', staff ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=300')
    return ok(res, await s.loadSite(staff))
  },
  content: async (_req: Request, res: Response) => ok(res, await s.getContent()),
  collection: async (req: Request, res: Response) => res.vary('Cookie') && ok(res, await s.getCollection(collectionParam.parse(req.params).key, isStaff(req))),
  async upsertItem(req: Request, res: Response) {
    const { key, id } = itemParams.parse(req.params)
    const body = itemBody.parse({ ...req.body, id })
    collectionItemSchemas[key].parse(body)
    return ok(res, await s.upsertItem(key, body as Record<string, unknown>, req.user!.id))
  },
  async removeItem(req: Request, res: Response) {
    const { key, id } = itemParams.parse(req.params)
    await s.removeItem(key, id, req.user!.id)
    return noContent(res)
  },
  async reorder(req: Request, res: Response) {
    const { key } = collectionParam.parse(req.params)
    return ok(res, await s.reorder(key, reorderBody.parse(req.body).ids, req.user!.id))
  },
  updateContent: async (req: Request, res: Response) => ok(res, await s.updateContent(contentPatch.parse(req.body) as Partial<SiteContent>, req.user!.id)),
}
