import express, { Router } from 'express'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import { env } from './config/env'
import { pingDb } from './db/client'
import { cache } from './jobs/cache'
import { csrfProtection, loadSession, requireAuth, requirePortal } from './middleware/auth'
import { errorHandler, notFoundHandler } from './middleware/error'
import { corsPolicy, rateLimitHandler, requestContext, securityHeaders } from './middleware/security'
import { adminRouter } from './modules/admin/admin.router'
import { authRouter } from './modules/auth/auth.router'
import { businessRouter } from './modules/business/business.router'
import { calculatorRouter } from './modules/calculator/calculator.router'
import { catalogRouter } from './modules/catalog/catalog.router'
import { companiesRouter } from './modules/companies/companies.router'
import { contentRouter } from './modules/content/content.router'
import { enquiriesRouter, publicEnquiriesRouter } from './modules/enquiries/enquiries.router'
import { invoicesRouter } from './modules/invoices/invoices.router'
import { offersRouter } from './modules/offers/offers.router'
import { ownerRouter } from './modules/owner/owner.router'
import { proposalsRouter } from './modules/proposals/proposals.router'
import { quotationsRouter } from './modules/quotations/quotations.router'
import { uploadsRouter, uploadsStatic } from './modules/uploads/uploads.router'
import { usersRouter } from './modules/users/users.router'

export const startedAt = new Date()
let shuttingDown = false
export const markShuttingDown = () => { shuttingDown = true }

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', env.TRUST_PROXY)
  app.set('etag', 'strong')

  app.use(requestContext)
  app.use(securityHeaders)
  app.use(corsPolicy)

  // Liveness/readiness for PM2, Nginx and uptime monitors (no auth, no rate limit).
  app.get('/api/health', async (_req, res) => {
    const dbOk = await pingDb()
    const healthy = dbOk && !shuttingDown
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : shuttingDown ? 'shutting-down' : 'degraded',
      db: dbOk ? 'ok' : 'down', redis: cache.status(), uptimeSeconds: Math.round(process.uptime()), startedAt: startedAt.toISOString(),
    })
  })

  app.use('/uploads', uploadsStatic)

  // JSON bodies (10 MB: content may hold compressed images). The backup restore route has its own, larger limit.
  const json = express.json({ limit: '10mb', strict: true })
  app.use((req, res, next) => (req.path === '/api/admin/backup/restore' ? next() : json(req, res, next)))
  app.use(cookieParser())
  app.use('/api', rateLimit({ windowMs: 60_000, limit: env.RATE_LIMIT_API, standardHeaders: 'draft-8', legacyHeaders: false, handler: rateLimitHandler('Too many requests. Slow down and try again in a minute.') }))
  app.use('/api', loadSession)
  app.use('/api', csrfProtection)

  const api = Router()
  api.use('/auth', authRouter)
  api.use('/public', publicEnquiriesRouter)
  api.use('/calculator', calculatorRouter)
  api.use('/', contentRouter) // /site, /content, /collections/:key
  api.use('/offers', offersRouter)
  api.use('/companies', companiesRouter)
  // Leads: admin-panel staff and the owner portal (read-only), by permission.
  api.use('/enquiries', requireAuth, enquiriesRouter)
  // Owner portal only (owner role + owner sign-in).
  api.use('/owner', requireAuth, ownerRouter)
  // Admin panel only (staff signed in through the admin login), then per-permission checks.
  const staff = requirePortal('admin')
  api.use('/proposals', requireAuth, staff, proposalsRouter)
  api.use('/quotations', requireAuth, staff, quotationsRouter)
  api.use('/invoices', requireAuth, staff, invoicesRouter)
  api.use('/catalog', requireAuth, staff, catalogRouter)
  api.use('/business', requireAuth, staff, businessRouter)
  api.use('/uploads', requireAuth, staff, uploadsRouter)
  api.use('/users', requireAuth, staff, usersRouter)
  api.use('/admin', requireAuth, staff, adminRouter)
  app.use('/api', api)

  app.use('/api', notFoundHandler)
  app.use(errorHandler)
  return app
}
