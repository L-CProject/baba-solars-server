import { Router } from 'express'
import { handler } from '../../lib/http'
import { requirePermission } from '../../middleware/auth'
import { contentController as c } from './content.controller'

/** Website content: public reads, writes need content:write. */
export const contentRouter = Router()
contentRouter.get('/site', handler(c.site))
contentRouter.get('/content', handler(c.content))
contentRouter.put('/content', requirePermission('content:write'), handler(c.updateContent))
contentRouter.get('/collections/:key', handler(c.collection))
contentRouter.put('/collections/:key/order', requirePermission('content:write'), handler(c.reorder))
contentRouter.put('/collections/:key/:id', requirePermission('content:write'), handler(c.upsertItem))
contentRouter.delete('/collections/:key/:id', requirePermission('content:write'), handler(c.removeItem))
