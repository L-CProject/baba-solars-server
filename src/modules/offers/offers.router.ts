import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { offersController as c } from './offers.controller'

export const offersRouter = Router()
offersRouter.get('/', handler(c.list))
offersRouter.put('/:id', requirePermission('content:write'), handler(c.save))
offersRouter.delete('/:id', requirePermission('content:write'), handler(c.remove))
