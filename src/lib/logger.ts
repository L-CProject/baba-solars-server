import { pino } from 'pino'
import { env } from '../config/env'

/** Structured JSON logs (one line per event) — PM2 collects them; pipe through pino-pretty in development. */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'baba-solars-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', '*.password', '*.passwordHash', 'password'],
    censor: '[redacted]',
  },
})
