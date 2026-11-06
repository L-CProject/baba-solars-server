import type { Request, Response } from 'express'
import type { QuotationSave } from '@/types/api'
import { idParam, noContent, ok } from '../../lib/http'
import { listQuotationsQuery, quotationBody, quotationStatusBody } from './quotations.schema'
import { quotationsService as s } from './quotations.service'

export const quotationsController = {
  list: async (req: Request, res: Response) => ok(res, await s.list(listQuotationsQuery.parse(req.query))),
  get: async (req: Request, res: Response) => ok(res, await s.get(idParam.parse(req.params).id)),
  /** PUT with the client-chosen id: creates or updates (idempotent on retries). */
  save: async (req: Request, res: Response) => ok(res, await s.save(idParam.parse(req.params).id, quotationBody.parse(req.body) as unknown as QuotationSave, req.user!)),
  setStatus: async (req: Request, res: Response) => ok(res, await s.setStatus(idParam.parse(req.params).id, quotationStatusBody.parse(req.body).status)),
  toInvoice: async (req: Request, res: Response) => ok(res, await s.convertToInvoice(idParam.parse(req.params).id, req.user!), 201),
  async remove(req: Request, res: Response) {
    await s.remove(idParam.parse(req.params).id)
    return noContent(res)
  },
}
