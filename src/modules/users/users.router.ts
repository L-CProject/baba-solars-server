import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { usersController as c } from './users.controller'

/** Staff accounts (admin only). Users are deactivated, never deleted, so lead history keeps their names. */
export const usersRouter = Router()
usersRouter.use(requirePermission('users:manage'))
usersRouter.get('/', handler(c.list))
usersRouter.post('/', handler(c.create))
usersRouter.patch('/:id', handler(c.update))
usersRouter.put('/:id/password', handler(c.resetPassword))
