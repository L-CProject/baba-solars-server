import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { companiesController as c } from './companies.controller'

/** Company price lists: public read (calculator, pricing page); writes need companies:write. */
export const companiesRouter = Router()
companiesRouter.get('/', handler(c.list))
companiesRouter.post('/:id/price', requirePermission('quotations:read'), handler(c.price))
companiesRouter.put('/:id', requirePermission('companies:write'), handler(c.save))
companiesRouter.delete('/:id', requirePermission('companies:write'), handler(c.remove))
