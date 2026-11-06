import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from '../users/users.model'

/**
 * Server-side sessions. The browser holds a random token in an HttpOnly cookie; only its SHA-256
 * is stored here, so a database leak does not expose live sessions. Logout / deactivation deletes rows.
 */
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(), // sha256(token) hex
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  portal: varchar('portal', { length: 10 }).notNull(), // 'admin' | 'owner'
  csrfToken: varchar('csrf_token', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  ip: varchar('ip', { length: 64 }).notNull().default(''),
  userAgent: varchar('user_agent', { length: 300 }).notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)])
