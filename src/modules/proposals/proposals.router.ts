import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { proposalsController as c } from './proposals.controller'

export const proposalsRouter = Router()
const read = requirePermission('quotations:read')
const write = requirePermission('quotations:write')
proposalsRouter.get('/', read, handler(c.list))
proposalsRouter.post('/', write, handler(c.create))
proposalsRouter.get('/:id', read, handler(c.get))
proposalsRouter.put('/:id', write, handler(c.update))
proposalsRouter.delete('/:id', write, handler(c.remove))
proposalsRouter.post('/:id/duplicate', write, handler(c.duplicate))
proposalsRouter.patch('/:id/status', write, handler(c.setStatus))
proposalsRouter.post('/:id/convert', write, handler(c.convert))
