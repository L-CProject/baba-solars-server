import { randomBytes } from 'node:crypto'
import { and, eq, lt, ne, sql } from 'drizzle-orm'
import type { Role } from '@/types'
import { db } from '../../db/client'
import { roles, sessions, users } from '../../db/schema'
import { invalid, unauthorized } from '../../lib/errors'
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from '../../lib/password'
import { permissionsFor, portalFor } from '../../lib/access'
import { hashToken, sessionTtlMs, type AuthUser } from '../../middleware/auth'
import type { LoginBody } from './auth.schema'

export const profileOf = (u: Pick<AuthUser, 'id' | 'name' | 'email' | 'role'>) => ({
  user: { id: u.id, name: u.name, email: u.email, role: u.role },
  permissions: permissionsFor(u.role),
})

export const authService = {
  async login(body: LoginBody, meta: { ip: string; userAgent: string }) {
    const [row] = await db
      .select({ u: users, role: roles.key })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(sql`lower(${users.email})`, body.email))
      .limit(1)
    // Always run one hash check so unknown emails take as long as wrong passwords.
    const valid = await verifyPassword(body.password, row?.u.passwordHash ?? DUMMY_HASH)
    const role = row?.role as Role | undefined
    // An account used on the wrong sign-in page gets the same answer as a wrong password:
    // the admin page never mentions the owner portal and neither page reveals which accounts exist.
    if (!row || !valid || !row.u.isActive || !role || portalFor(role) !== body.portal) throw unauthorized('Incorrect email or password.')
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(24).toString('base64url')
    const now = new Date()
    await db.transaction(async (t) => {
      await t.insert(sessions).values({
        id: hashToken(token), userId: row.u.id, portal: body.portal, csrfToken,
        expiresAt: new Date(now.getTime() + sessionTtlMs()), ip: meta.ip.slice(0, 64), userAgent: meta.userAgent.slice(0, 300),
      })
      await t.update(users).set({ lastLoginAt: now }).where(eq(users.id, row.u.id))
      // Housekeeping: expired sessions of this user.
      await t.delete(sessions).where(and(eq(sessions.userId, row.u.id), lt(sessions.expiresAt, now)))
    })
    return { token, csrfToken, profile: profileOf({ id: row.u.id, name: row.u.name, email: row.u.email, role }) }
  },

  async logout(sessionId: string) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
  },

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
    if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) throw invalid({ currentPassword: 'Current password is not correct.' })
    const problem = passwordProblem(newPassword)
    if (problem) throw invalid({ newPassword: problem })
    await db.transaction(async (t) => {
      await t.update(users).set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id))
      // Sign out every other device.
      await t.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)))
    })
  },

  async purgeExpired() {
    const res = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
    return res.rowCount ?? 0
  },
}
