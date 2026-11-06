import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { quotationsController as c } from './quotations.controller'

export const quotationsRouter = Router()
const read = requirePermission('quotations:read')
const write = requirePermission('quotations:write')
quotationsRouter.get('/', read, handler(c.list))
quotationsRouter.get('/:id', read, handler(c.get))
quotationsRouter.put('/:id', write, handler(c.save))
quotationsRouter.delete('/:id', write, handler(c.remove))
quotationsRouter.patch('/:id/status', write, handler(c.setStatus))
quotationsRouter.post('/:id/invoice', requirePermission('invoices:write'), handler(c.toInvoice))
