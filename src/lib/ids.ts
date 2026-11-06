import { randomUUID } from 'node:crypto'

/** Same id format as the website (`enq-1a2b3c4d`), but with a full random part on the server. */
export const newId = (prefix: string) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 16)}`

/** Ids accepted from clients (existing records keep their original ids). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
