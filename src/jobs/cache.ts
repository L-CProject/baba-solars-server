import { Redis } from 'ioredis'
import { env } from '../config/env'
import { logger } from '../lib/logger'

/**
 * Optional Redis cache. Without REDIS_URL every call is a no-op and the API reads from PostgreSQL,
 * so nothing depends on Redis being installed.
 */
let client: Redis | null = null
/** Connect on first use (CLI scripts that never touch the cache never open a connection). */
export function connectCache() {
  if (client || !env.REDIS_URL || env.isTest) return
  client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
  client.on('error', (err) => logger.warn({ err: err.message }, 'redis cache unavailable (continuing without cache)'))
}

const ready = () => { connectCache(); return client?.status === 'ready' }

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!ready()) return null
    try {
      const raw = await client!.get(`bs:${key}`)
      return raw ? (JSON.parse(raw) as T) : null
    } catch { return null }
  },
  async set(key: string, value: unknown, ttlSeconds: number) {
    if (!ready()) return
    try { await client!.set(`bs:${key}`, JSON.stringify(value), 'EX', ttlSeconds) } catch { /* cache is best-effort */ }
  },
  async del(key: string) {
    if (!ready()) return
    try { await client!.del(`bs:${key}`) } catch { /* ignore */ }
  },
  status: () => (client ? client.status : 'disabled'),
  async close() { if (client) await client.quit().catch(() => client?.disconnect()); client = null },
}
