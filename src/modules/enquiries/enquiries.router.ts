import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { env } from '../../config/env'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { rateLimitHandler } from '../../middleware/security'
import { enquiriesController as c } from './enquiries.controller'

/** Public website forms (no sign-in; rate limited per IP). */
export const publicEnquiriesRouter = Router()
const submitLimiter = rateLimit({
  windowMs: 10 * 60_000, limit: env.RATE_LIMIT_ENQUIRIES, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: rateLimitHandler('Too many enquiries from this connection. Please call or WhatsApp us instead.'),
})
publicEnquiriesRouter.post('/enquiries', submitLimiter, handler(c.submitPublic))
publicEnquiriesRouter.post('/quote-requests', submitLimiter, handler(c.submitQuoteRequest))

/** Lead management (admin, sales; owner read-only). */
export const enquiriesRouter = Router()
const read = requirePermission('leads:read')
const write = requirePermission('leads:write')

enquiriesRouter.get('/', read, handler(c.list))
enquiriesRouter.get('/stats', read, handler(c.stats))
enquiriesRouter.get('/all', read, handler(c.all))
enquiriesRouter.get('/assignable-users', read, handler(c.assignable))
enquiriesRouter.post('/import', write, handler(c.importRows))
enquiriesRouter.post('/export', read, handler(c.exportRows))
enquiriesRouter.post('/', write, handler(c.create))
enquiriesRouter.get('/:id', read, handler(c.get))
enquiriesRouter.put('/:id', write, handler(c.update))
enquiriesRouter.delete('/:id', requirePermission('leads:delete'), handler(c.remove))
enquiriesRouter.patch('/:id/status', write, handler(c.setStatus))
enquiriesRouter.patch('/:id/assign', requirePermission('leads:assign'), handler(c.assign))
enquiriesRouter.post('/:id/activities', write, handler(c.logActivity))
enquiriesRouter.post('/:id/follow-ups', write, handler(c.scheduleFollowUp))
enquiriesRouter.patch('/:id/follow-ups/:followUpId', write, handler(c.completeFollowUp))
