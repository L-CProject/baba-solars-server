import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '@/services/errors'
import { env } from '../config/env'
import { AppError, statusFor, type FieldErrors } from '../lib/errors'

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: `No API route for ${req.method} ${req.path}.`, requestId: req.id } })
}

function zodFieldErrors(e: ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of e.issues) {
    const key = issue.path.map(String).join('.') || '_'
    out[key] ??= issue.message
  }
  return out
}

/**
 * One place that turns errors into responses: { error: { code, message, fieldErrors?, requestId } }.
 * Unexpected errors are logged with their stack and returned as a generic 500 — no internals leak.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500
  let code = 'internal'
  let message = 'Something went wrong on our side. Please try again.'
  let fieldErrors: FieldErrors | undefined

  if (err instanceof AppError) {
    ;({ status, code, message } = err)
    fieldErrors = Object.keys(err.fieldErrors).length ? err.fieldErrors : undefined
  } else if (err instanceof ApiError) {
    // Thrown by the shared business rules (src/lib/*).
    code = err.code
    status = err.status || statusFor(err.code)
    message = err.message
    fieldErrors = Object.keys(err.fieldErrors).length ? err.fieldErrors : undefined
  } else if (err instanceof ZodError) {
    status = 400
    code = 'validation'
    fieldErrors = zodFieldErrors(err)
    message = 'Some fields need attention. Nothing was saved.'
  } else if (isHttpError(err)) {
    status = err.status
    code = status === 413 ? 'payload_too_large' : 'bad_request'
    message = status === 413
      ? (req.path.startsWith('/api/uploads') ? `Images must be ${env.UPLOAD_MAX_MB} MB or smaller.` : 'The request is too large.')
      : 'The request could not be read (invalid JSON).'
  } else if (isPgError(err) && err.code === '23505') {
    status = 409
    code = 'conflict'
    message = 'This record already exists (duplicate).'
  } else if (isPgError(err) && (err.code === '23503' || err.code === '23514')) {
    status = 409
    code = 'conflict'
    message = err.code === '23503' ? 'This record is linked to other records.' : 'A value is not allowed.'
  }

  if (status >= 500) req.log?.error({ err }, 'unhandled error')
  if (res.headersSent) return
  res.status(status).json({
    error: {
      code, message, ...(fieldErrors ? { fieldErrors } : {}), requestId: req.id,
      // Only in development: helps debugging; never in production.
      ...(!env.isProd && status >= 500 && err instanceof Error ? { debug: err.message } : {}),
    },
  })
}

const isHttpError = (e: unknown): e is { status: number; type?: string } =>
  typeof e === 'object' && e !== null && 'status' in e && typeof (e as { status: unknown }).status === 'number' && (e as { status: number }).status >= 400 && (e as { status: number }).status < 500 && 'type' in e
const isPgError = (e: unknown): e is { code: string } =>
  typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' && /^\d{5}$/.test((e as { code: string }).code)
