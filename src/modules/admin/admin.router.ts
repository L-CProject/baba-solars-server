import express, { Router } from 'express'
import { handler } from '../../lib/http'
import { requireAuth, requirePermission } from '../../middleware/auth'
import { adminController as c } from './admin.controller'

export const adminRouter = Router()
adminRouter.get('/dashboard', requireAuth, handler(c.dashboard))
/** Live lead analytics for the dashboard cards, charts and recent 10 leads (?range=all|today|7d|30d|month|custom&from&to). */
adminRouter.get('/dashboard/analytics', requirePermission('leads:read'), handler(c.analytics))
adminRouter.get('/backup', requirePermission('backup:manage'), handler(c.exportBackup))
// Backups can contain images: allow a larger body for this one route.
adminRouter.post('/backup/restore', requirePermission('backup:manage'), express.json({ limit: '60mb' }), handler(c.restore))
adminRouter.post('/reset-website', requirePermission('backup:manage'), handler(c.reset))
