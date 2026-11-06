import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { catalogController as c } from './catalog.controller'

export const catalogRouter = Router()
catalogRouter.get('/', requirePermission('invoices:read'), handler(c.list))
catalogRouter.put('/:id', requirePermission('invoices:write'), handler(c.save))
catalogRouter.delete('/:id', requirePermission('invoices:write'), handler(c.remove))
