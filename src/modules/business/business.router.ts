import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { businessController as c } from './business.controller'

export const businessRouter = Router()
businessRouter.get('/', requirePermission('business:read'), handler(c.get))
businessRouter.put('/', requirePermission('business:write'), handler(c.update))
