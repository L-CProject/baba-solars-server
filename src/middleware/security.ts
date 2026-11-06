import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import type { Logger } from 'pino'
import { env } from '../config/env'
import { logger } from '../lib/logger'

declare module 'express-serve-static-core' {
  interface Request {
    id: string
    log: Logger
  }
}

/** Request id (from Nginx `X-Request-Id` when present) + one structured log line per request. */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id')
  req.id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID()
  req.log = logger.child({ reqId: req.id })
  res.setHeader('X-Request-Id', req.id)
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    if (req.path === '/api/health') return
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    req.log[level]({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms), userId: req.user?.id }, 'request')
  })
  next()
}

/** Security headers. The API returns JSON only, so the CSP is "nothing may load". */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'same-site' },
  hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
})

/** CORS: only the configured website origins may call the API with cookies. Same-origin (via Nginx) needs no CORS. */
export const corsPolicy: RequestHandler = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true) // same-origin, curl, server-to-server
    cb(null, env.corsOrigins.includes(origin.replace(/\/+$/, '')))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
})

/** Same JSON error shape as every other API error. */
export const rateLimitHandler = (message: string) => (_req: Request, res: Response) =>
  res.status(429).json({ error: { code: 'rate_limited', message } })
