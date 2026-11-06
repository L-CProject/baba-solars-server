import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { invoicesController as c } from './invoices.controller'

export const invoicesRouter = Router()
const read = requirePermission('invoices:read')
const write = requirePermission('invoices:write')
invoicesRouter.get('/', read, handler(c.list))
invoicesRouter.post('/', write, handler(c.create))
invoicesRouter.get('/:id', read, handler(c.get))
invoicesRouter.put('/:id', write, handler(c.update))
invoicesRouter.delete('/:id', requirePermission('invoices:delete'), handler(c.remove))
invoicesRouter.post('/:id/payments', write, handler(c.addPayment))
invoicesRouter.delete('/:id/payments/:paymentId', write, handler(c.removePayment))
