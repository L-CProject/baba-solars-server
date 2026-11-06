import type { Request, Response } from 'express'
import type { Company } from '@/types'
import { idParam, noContent, ok } from '../../lib/http'
import { companyBody, priceQuoteBody } from './companies.schema'
import { companiesService as s } from './companies.service'

export const companiesController = {
  list: async (_req: Request, res: Response) => ok(res, await s.list()),
  async save(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const body = companyBody.parse({ ...req.body, id })
    return ok(res, await s.save(body as Company, req.user!.id))
  },
  async remove(req: Request, res: Response) {
    await s.remove(idParam.parse(req.params).id, req.user!.id)
    return noContent(res)
  },
  async price(req: Request, res: Response) {
    const b = priceQuoteBody.parse(req.body)
    return ok(res, await s.priceQuote(idParam.parse(req.params).id, b.capacityKw, b.quality, b.supplyType))
  },
}
