import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../config/env'
import { logger } from '../lib/logger'
import * as schema from './schema'

// DATE columns come back as 'YYYY-MM-DD' strings (no timezone shifts); NUMERIC is mapped by Drizzle.
pg.types.setTypeParser(1082, (v) => v)

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: env.databaseSsl ? { rejectUnauthorized: true } : undefined,
  application_name: 'baba-solars-api',
})
pool.on('error', (err) => logger.error({ err }, 'postgres pool error'))

export const db = drizzle(pool, { schema, casing: undefined })
export type Db = NodePgDatabase<typeof schema>
/** A transaction handle (same query API as `db`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

/** Run work in a transaction: all writes succeed together or none do. */
export const tx = <T>(fn: (t: Tx) => Promise<T>) => db.transaction(fn)

export async function pingDb(): Promise<boolean> {
  try {
    await pool.query('select 1')
    return true
  } catch {
    return false
  }
}
