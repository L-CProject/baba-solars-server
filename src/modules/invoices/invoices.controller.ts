import type { Request, Response } from 'express'
import type { InvoiceInput } from '@/types'
import { idParam, noContent, ok } from '../../lib/http'
import { invoiceBody, listInvoicesQuery, paymentBody, paymentParams } from './invoices.schema'
import { invoicesService as s } from './invoices.service'

export const invoicesController = {
  list: async (req: Request, res: Response) => ok(res, await s.list(listInvoicesQuery.parse(req.query))),
  get: async (req: Request, res: Response) => ok(res, await s.get(idParam.parse(req.params).id)),
  create: async (req: Request, res: Response) => ok(res, await s.create(invoiceBody.parse(req.body) as InvoiceInput, req.user!), 201),
  update: async (req: Request, res: Response) => ok(res, await s.update(idParam.parse(req.params).id, invoiceBody.parse(req.body) as InvoiceInput)),
  async remove(req: Request, res: Response) {
    await s.remove(idParam.parse(req.params).id)
    return noContent(res)
  },
  addPayment: async (req: Request, res: Response) => ok(res, await s.addPayment(idParam.parse(req.params).id, paymentBody.parse(req.body), req.user!), 201),
  removePayment: async (req: Request, res: Response) => {
    const p = paymentParams.parse(req.params)
    return ok(res, await s.removePayment(p.id, p.paymentId))
  },
}
