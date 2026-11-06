import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { env } from '../../config/env'
import { handler } from '../../lib/http'
import { requireAuth } from '../../middleware/auth'
import { rateLimitHandler } from '../../middleware/security'
import { authController as c } from './auth.controller'

export const authRouter = Router()

// Brute-force protection: per IP, failed and successful attempts alike.
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: env.RATE_LIMIT_LOGIN, standardHeaders: 'draft-8', legacyHeaders: false, handler: rateLimitHandler('Too many sign-in attempts. Wait 15 minutes and try again.') })

// Per account: failed attempts on one email from any number of IPs (successful sign-ins are not counted).
const accountLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: env.RATE_LIMIT_LOGIN, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => `acct:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase().slice(0, 200)}`,
  handler: rateLimitHandler('Too many sign-in attempts for this account. Wait 15 minutes and try again.'),
})

authRouter.post('/login', loginLimiter, accountLimiter, handler(c.login))
authRouter.get('/me', handler(c.me))
authRouter.post('/logout', handler(c.logout))
authRouter.post('/password', requireAuth, handler(c.changePassword))
