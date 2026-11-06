import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { Role, StaffUser } from '@/types'
import { db, tx, type DbOrTx } from '../../db/client'
import { roles, sessions, users } from '../../db/schema'
import { AppError, conflict, invalid, notFound } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { hashPassword, passwordProblem } from '../../lib/password'

const select = { u: users, role: roles.key }
const toStaff = (r: { u: typeof users.$inferSelect; role: string }): StaffUser => ({
  id: r.u.id, name: r.u.name, email: r.u.email, role: r.role as Role, isActive: r.u.isActive,
  lastLoginAt: r.u.lastLoginAt?.toISOString() ?? null, createdAt: r.u.createdAt.toISOString(), updatedAt: r.u.updatedAt.toISOString(),
})

async function roleId(t: DbOrTx, key: Role) {
  const [r] = await t.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1)
  if (!r) throw new AppError('internal', `Role ${key} is missing — run npm run db:seed.`)
  return r.id
}
async function emailTaken(t: DbOrTx, email: string, exceptId?: string) {
  const [r] = await t.select({ id: users.id }).from(users).where(and(eq(sql`lower(${users.email})`, email.toLowerCase()), exceptId ? ne(users.id, exceptId) : undefined)).limit(1)
  return !!r
}
/** Never lock everyone out: at least one active admin must remain. */
async function assertAnotherAdmin(t: DbOrTx, userId: string) {
  const [r] = await t.select({ n: sql<number>`count(*)::int` }).from(users).innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(roles.key, 'admin'), eq(users.isActive, true), ne(users.id, userId)))
  if (!r.n) throw new AppError('conflict', 'At least one active admin is required.')
}

export const usersService = {
  async list(): Promise<StaffUser[]> {
    return (await db.select(select).from(users).innerJoin(roles, eq(roles.id, users.roleId)).orderBy(asc(users.name))).map(toStaff)
  },
  async get(id: string, t: DbOrTx = db): Promise<StaffUser> {
    const [r] = await t.select(select).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, id)).limit(1)
    if (!r) throw notFound('User')
    return toStaff(r)
  },
  async create(body: { name: string; email: string; role: Role; password: string; isActive: boolean }, t: DbOrTx = db): Promise<StaffUser> {
    const problem = passwordProblem(body.password)
    if (problem) throw invalid({ password: problem })
    if (await emailTaken(t, body.email)) throw conflict('A user with this email already exists.', { email: 'A user with this email already exists.' })
    const id = newId('usr')
    await t.insert(users).values({ id, name: body.name, email: body.email, passwordHash: await hashPassword(body.password), roleId: await roleId(t, body.role), isActive: body.isActive })
    return usersService.get(id, t)
  },
  async update(id: string, body: { name?: string; email?: string; role?: Role; isActive?: boolean }, actorId: string): Promise<StaffUser> {
    return tx(async (t) => {
      const current = await usersService.get(id, t)
      if (body.email && (await emailTaken(t, body.email, id))) throw conflict('A user with this email already exists.', { email: 'A user with this email already exists.' })
      const demoting = current.role === 'admin' && ((body.role && body.role !== 'admin') || body.isActive === false)
      if (demoting) await assertAnotherAdmin(t, id)
      if (id === actorId && body.isActive === false) throw new AppError('bad_request', 'You cannot deactivate your own account.')
      await t.update(users).set({
        ...(body.name ? { name: body.name } : {}), ...(body.email ? { email: body.email } : {}),
        ...(body.role ? { roleId: await roleId(t, body.role) } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        updatedAt: new Date(),
      }).where(eq(users.id, id))
      // Role / status changes take effect immediately: end the user's sessions.
      if ((body.role && body.role !== current.role) || body.isActive === false) await t.delete(sessions).where(eq(sessions.userId, id))
      return usersService.get(id, t)
    })
  },
  async resetPassword(id: string, password: string) {
    const problem = passwordProblem(password)
    if (problem) throw invalid({ password: problem })
    await tx(async (t) => {
      await usersService.get(id, t)
      await t.update(users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id))
      await t.delete(sessions).where(eq(sessions.userId, id))
    })
  },
}
