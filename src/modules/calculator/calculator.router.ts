import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { handler } from '../../lib/http'
import { rateLimitHandler } from '../../middleware/security'
import { calculatorController as c } from './calculator.controller'

export const calculatorRouter = Router()
calculatorRouter.post('/estimate', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, handler: rateLimitHandler('Too many requests. Try again in a minute.') }), handler(c.estimate))
