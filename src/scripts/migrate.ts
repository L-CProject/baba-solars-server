/**
 * Applies pending database migrations (drizzle/*.sql) in order, inside a transaction each.
 * Safe to run on every deploy: already-applied migrations are skipped.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from '../db/client'

const here = path.dirname(fileURLToPath(import.meta.url))
// dist/migrate.js and src/scripts/migrate.ts both live below server/.
const folder = path.resolve(here, here.endsWith('dist') ? '../drizzle' : '../../drizzle')

try {
  await migrate(db, { migrationsFolder: folder, migrationsSchema: 'drizzle', migrationsTable: '__migrations' })
  console.log(`✔ Database migrations are up to date (${folder}).`)
  await pool.end()
} catch (err) {
  console.error('✖ Migration failed — nothing from the failed migration was applied.\n', err)
  await pool.end()
  process.exit(1)
}
