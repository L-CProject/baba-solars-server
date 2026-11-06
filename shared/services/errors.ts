import type { FieldErrors } from '@/types'

/** One error type for the whole app (mock today, HTTP API later). */
export type ApiErrorCode =
  | 'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited'
  | 'payload_too_large' | 'bad_request' | 'network' | 'timeout' | 'storage' | 'internal' | 'unknown'

export class ApiError extends Error {
  readonly fieldErrors: FieldErrors
  readonly code: ApiErrorCode
  readonly status: number
  constructor(message: string, opts: { fieldErrors?: FieldErrors; code?: ApiErrorCode; status?: number } = {}) {
    super(message)
    this.name = 'ApiError'
    this.fieldErrors = opts.fieldErrors ?? {}
    this.code = opts.code ?? 'unknown'
    this.status = opts.status ?? 0
  }
}

/** Fired when the session ends (AuthContext signs the user out). */
export const AUTH_EXPIRED_EVENT = 'baba:auth-expired'
