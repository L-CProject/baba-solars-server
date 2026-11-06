/**
 * First-run setup: roles, plus the first admin and owner accounts from SEED_* environment
 * variables. Idempotent — existing roles/users are left as they are (passwords are never reset).
 *   SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… SEED_OWNER_EMAIL=… SEED_OWNER_PASSWORD=… npm run db:seed
 */
import { eq, sql } from 'drizzle-orm'
import { ROLES } from '@/lib/rbac'
import { env } from '../config/env'
import { db, pool } from '../db/client'
import { roles, users } from '../db/schema'
import { usersService } from '../modules/users/users.service'

async function ensureUser(kind: 'admin' | 'owner', email: string | undefined, password: string | undefined, name: string) {
  if (!email || !password) {
    console.log(`• ${kind}: SEED_${kind.toUpperCase()}_EMAIL / SEED_${kind.toUpperCase()}_PASSWORD not set — skipped.`)
    return
  }
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase())).limit(1)
  if (exists) return console.log(`• ${kind}: ${email} already exists — unchanged.`)
  await usersService.create({ name, email: email.toLowerCase(), role: kind, password, isActive: true })
  console.log(`✔ ${kind} account created: ${email}`)
}

try {
  for (const r of ROLES) {
    await db.insert(roles).values({ key: r.value, name: r.label, description: r.description })
      .onConflictDoUpdate({ target: roles.key, set: { name: r.label, description: r.description } })
  }
  console.log(`✔ Roles: ${ROLES.map((r) => r.value).join(', ')}`)
  await ensureUser('admin', env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD, env.SEED_ADMIN_NAME)
  await ensureUser('owner', env.SEED_OWNER_EMAIL, env.SEED_OWNER_PASSWORD, env.SEED_OWNER_NAME)
  await pool.end()
} catch (err) {
  console.error('✖ Seed failed:', err instanceof Error ? err.message : err)
  await pool.end()
  process.exit(1)
}
