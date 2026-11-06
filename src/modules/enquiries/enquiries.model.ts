import { sql } from 'drizzle-orm'
import { check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import type { EnquiryEstimate } from '@/types'
import { users } from '../users/users.model'

export const ENQUIRY_STATUS_SQL = `'new','pending','contacted','follow-up','interested','site-visit','proposal','quoted','converted','not-interested','closed'`
const SOURCES_SQL = `'contact','calculator','pricing','service','whatsapp','phone','walk-in','referral','social','other','manual','import'`
const ACTIVITY_SQL = `'created','updated','status','call','whatsapp','email','meeting','note','follow-up-scheduled','follow-up-done','follow-up-cancelled','assigned','imported'`

/** Leads from the website forms, calculator, admin entry and Excel import. Soft-deleted (deleted_at) so nothing is lost. */
export const enquiries = pgTable('enquiries', {
  id: text('id').primaryKey(),
  /** Website submission UUID — one enquiry per submission, even on double clicks and retries. */
  submissionId: varchar('submission_id', { length: 64 }),
  /** Optional on the website form (mobile OR email is the only requirement). */
  name: varchar('name', { length: 120 }).notNull().default(''),
  phone: varchar('phone', { length: 20 }).notNull().default(''),
  email: varchar('email', { length: 200 }).notNull().default(''),
  city: varchar('city', { length: 120 }).notNull().default(''),
  address: varchar('address', { length: 300 }).notNull().default(''),
  state: varchar('state', { length: 60 }).notNull().default(''),
  pincode: varchar('pincode', { length: 6 }).notNull().default(''),
  service: varchar('service', { length: 200 }).notNull().default(''),
  message: text('message').notNull().default(''),
  source: varchar('source', { length: 20 }).notNull(),
  origin: varchar('origin', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('new'),
  enquiryType: varchar('enquiry_type', { length: 12 }),
  propertyType: varchar('property_type', { length: 20 }),
  capacityKw: numeric('capacity_kw', { precision: 10, scale: 2, mode: 'number' }),
  /** Capacity answer that is not a number: 'custom' (Other / Custom) or 'not-sure' (Not sure yet). */
  capacityChoice: varchar('capacity_choice', { length: 12 }),
  monthlyBill: integer('monthly_bill'),
  notes: text('notes').notNull().default(''),
  estimate: jsonb('estimate').$type<EnquiryEstimate | null>(),
  /** Earliest pending follow-up (kept in sync with follow_ups). */
  followUpOn: date('follow_up_on', { mode: 'string' }),
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
  contactCount: integer('contact_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('enquiries_submission_uq').on(t.submissionId),
  index('enquiries_status_idx').on(t.status).where(sql`${t.deletedAt} is null`),
  index('enquiries_created_idx').on(t.createdAt.desc()).where(sql`${t.deletedAt} is null`),
  index('enquiries_follow_up_idx').on(t.followUpOn).where(sql`${t.deletedAt} is null and ${t.followUpOn} is not null`),
  index('enquiries_assigned_idx').on(t.assignedTo),
  index('enquiries_source_idx').on(t.source),
  index('enquiries_phone_idx').on(t.phone),
  index('enquiries_type_idx').on(t.enquiryType).where(sql`${t.deletedAt} is null`),
  index('enquiries_search_trgm').using('gin', sql`(lower(${t.name} || ' ' || ${t.phone} || ' ' || ${t.email} || ' ' || ${t.city} || ' ' || ${t.address} || ' ' || ${t.service} || ' ' || ${t.message} || ' ' || ${t.notes})) gin_trgm_ops`),
  check('enquiries_status_ck', sql.raw(`status in (${ENQUIRY_STATUS_SQL})`)),
  check('enquiries_source_ck', sql.raw(`source in (${SOURCES_SQL})`)),
  check('enquiries_origin_ck', sql.raw(`origin in ('website','admin','import')`)),
  check('enquiries_contact_ck', sql`${t.phone} <> '' or ${t.email} <> ''`),
  check('enquiries_capacity_choice_ck', sql`${t.capacityChoice} is null or ${t.capacityChoice} in ('custom','not-sure')`),
  check('enquiries_capacity_ck', sql`${t.capacityKw} is null or (${t.capacityKw} >= 0 and ${t.capacityKw} <= 100000)`),
])

/** Full history of a lead: status changes, calls, WhatsApp, notes, assignments, follow-ups. Append-only. */
export const enquiryActivities = pgTable('enquiry_activities', {
  id: text('id').primaryKey(),
  enquiryId: text('enquiry_id').notNull().references(() => enquiries.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 24 }).notNull(),
  outcome: varchar('outcome', { length: 24 }),
  fromStatus: varchar('from_status', { length: 20 }),
  toStatus: varchar('to_status', { length: 20 }),
  note: text('note').notNull().default(''),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  /** Kept even if the user is deleted later. */
  actorName: varchar('actor_name', { length: 120 }).notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('enquiry_activities_enquiry_idx').on(t.enquiryId, t.createdAt.desc()),
  index('enquiry_activities_type_idx').on(t.type, t.createdAt.desc()),
  index('enquiry_activities_actor_idx').on(t.actorId),
  check('enquiry_activities_type_ck', sql.raw(`type in (${ACTIVITY_SQL})`)),
])

/** Scheduled follow-ups. At most one pending follow-up per enquiry (rescheduling replaces it). */
export const followUps = pgTable('follow_ups', {
  id: text('id').primaryKey(),
  enquiryId: text('enquiry_id').notNull().references(() => enquiries.id, { onDelete: 'cascade' }),
  dueOn: date('due_on', { mode: 'string' }).notNull(),
  note: text('note').notNull().default(''),
  status: varchar('status', { length: 10 }).notNull().default('pending'),
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('follow_ups_one_pending_uq').on(t.enquiryId).where(sql`${t.status} = 'pending'`),
  index('follow_ups_due_idx').on(t.status, t.dueOn),
  index('follow_ups_assigned_idx').on(t.assignedTo),
  check('follow_ups_status_ck', sql`${t.status} in ('pending','done','cancelled')`),
])
