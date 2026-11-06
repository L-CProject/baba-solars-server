import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

/** Document number sequences per type + financial year, e.g. "quotation:2026-27" → 14 (atomic increments). */
export const counters = pgTable('counters', {
  key: varchar('key', { length: 60 }).primaryKey(),
  value: integer('value').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** One row per data import (bundled website data, browser backups) with its verification report. */
export const dataMigrations = pgTable('data_migrations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 80 }).notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull(),
  source: text('source').notNull().default(''),
  report: jsonb('report').notNull(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('data_migrations_uq').on(t.name, t.checksum)])
