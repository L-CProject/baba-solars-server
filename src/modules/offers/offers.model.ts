import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import type { OfferImage, OfferSlab } from '@/types'

/** Website offers (e.g. Diwali). Hidden automatically outside valid_from … valid_until (India time). */
export const offers = pgTable('offers', {
  id: text('id').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  badge: varchar('badge', { length: 60 }).notNull().default(''),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description').notNull().default(''),
  slabs: jsonb('slabs').$type<OfferSlab[]>().notNull().default([]),
  images: jsonb('images').$type<OfferImage[]>().notNull().default([]),
  bookingAmount: integer('booking_amount'),
  luckyDrawText: text('lucky_draw_text').notNull().default(''),
  ctaLabel: varchar('cta_label', { length: 60 }).notNull().default(''),
  validFrom: date('valid_from', { mode: 'string' }),
  validUntil: date('valid_until', { mode: 'string' }),
  terms: text('terms').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('offers_active_idx').on(t.enabled, t.validUntil),
  check('offers_dates_ck', sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validFrom} <= ${t.validUntil}`),
  check('offers_booking_ck', sql`${t.bookingAmount} is null or ${t.bookingAmount} >= 0`),
])
