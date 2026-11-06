import type { Request, Response } from 'express'
import type { CatalogItem } from '@/types'
import { idParam, noContent, ok } from '../../lib/http'
import { catalogBody, listCatalogQuery } from './catalog.schema'
import { catalogService as s } from './catalog.service'

export const catalogController = {
  list: async (req: Request, res: Response) => ok(res, await s.list(listCatalogQuery.parse(req.query))),
  async save(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    return ok(res, await s.save(catalogBody.parse({ ...req.body, id }) as CatalogItem))
  },
  async remove(req: Request, res: Response) {
    await s.remove(idParam.parse(req.params).id)
    return noContent(res)
  },
}
