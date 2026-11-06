import type { Request, Response } from 'express'
import type { Offer } from '@/types'
import { idParam, noContent, ok } from '../../lib/http'
import { offerBody } from './offers.schema'
import { offersService as s } from './offers.service'

export const offersController = {
  /** ?active=1 → only live offers (what the website shows). */
  list: async (req: Request, res: Response) => ok(res, req.query.active === '1' ? await s.active() : await s.list()),
  async save(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    return ok(res, await s.save(offerBody.parse({ ...req.body, id }) as Offer, req.user!.id))
  },
  async remove(req: Request, res: Response) {
    await s.remove(idParam.parse(req.params).id, req.user!.id)
    return noContent(res)
  },
}
