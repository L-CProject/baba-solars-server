import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission, requirePortal } from '../../middleware/auth'
import { ownerController as c } from './owner.controller'

/**
 * Owner portal APIs: only owner accounts signed in through the owner login (admin sessions get 403).
 * Lead lists and details use /api/enquiries (read-only for owners).
 */
export const ownerRouter = Router()
ownerRouter.use(requirePortal('owner'))
ownerRouter.get('/dashboard', requirePermission('reports:read', 'leads:read'), handler(c.dashboard))
