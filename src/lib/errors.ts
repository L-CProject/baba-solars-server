import type { ApiErrorCode } from '@/services/errors'

export type FieldErrors = Record<string, string>

const STATUS: Record<ApiErrorCode, number> = {
  validation: 400, bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409,
  payload_too_large: 413, rate_limited: 429, internal: 500, network: 503, timeout: 504, storage: 500, unknown: 500,
}
export const statusFor = (code: ApiErrorCode) => STATUS[code] ?? 500

/** Every expected error thrown by the API. The message is safe to show to users. */
export class AppError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly fieldErrors: FieldErrors
  constructor(code: ApiErrorCode, message: string, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = statusFor(code)
    this.fieldErrors = fieldErrors
  }
}

export const notFound = (what = 'Record') => new AppError('not_found', `${what} not found.`)
export const badRequest = (message: string) => new AppError('bad_request', message)
export const conflict = (message: string, fieldErrors: FieldErrors = {}) => new AppError('conflict', message, fieldErrors)
export const forbidden = (message = 'You do not have permission to do this.') => new AppError('forbidden', message)
export const unauthorized = (message = 'Please sign in.') => new AppError('unauthorized', message)
export const invalid = (fieldErrors: FieldErrors, message = 'Some fields need attention. Nothing was saved.') => new AppError('validation', message, fieldErrors)

/** Throw a validation error when the shared rules (src/lib) report problems. */
export function assertValid(errors: FieldErrors, message?: string) {
  if (Object.keys(errors).length) throw invalid(errors, message)
}
