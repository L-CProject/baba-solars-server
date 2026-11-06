import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { and, eq, gt } from 'drizzle-orm'
import type { Permission, Role } from '@/types'
import { db } from '../db/client'
import { roles, sessions, users } from '../db/schema'
import { env } from '../config/env'
import { forbidden, unauthorized } from '../lib/errors'
import { can, permissionsFor } from '../lib/access'

export const SESSION_COOKIE = 'bs_session'
export const CSRF_COOKIE = 'bs_csrf'
export const CSRF_HEADER = 'x-csrf-token'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  permissions: Permission[]
  sessionId: string
  portal: 'admin' | 'owner'
  csrfToken: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const TTL_MS = () => env.SESSION_TTL_HOURS * 3600_000

/**
 * Reads the session cookie on every request (no error when missing). Sessions slide: each use
 * at least a minute after the last one extends the expiry.
 */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return next()
  try {
    const id = hashToken(token)
    const [row] = await db
      .select({ s: sessions, u: users, role: roles.key })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
      .limit(1)
    if (row && row.u.isActive) {
      const role = row.role as Role
      req.user = {
        id: row.u.id, name: row.u.name, email: row.u.email, role, permissions: permissionsFor(role),
        sessionId: id, portal: row.s.portal as 'admin' | 'owner', csrfToken: row.s.csrfToken,
      }
      if (Date.now() - row.s.lastSeenAt.getTime() > 60_000) {
        await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS()) }).where(eq(sessions.id, id))
      }
    }
    next()
  } catch (e) {
    next(e)
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized())
  next()
}

/** Signed in AND the role has every listed permission. */
export const requirePermission = (...perms: Permission[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized())
  if (!perms.every((p) => can(req.user!.role, p))) return next(forbidden())
  next()
}

/**
 * Signed in through the given portal. Admin-panel sessions cannot call owner-portal APIs and
 * owner-portal sessions cannot call admin-panel APIs, whatever their permissions say.
 * The owner portal additionally requires the owner role.
 */
export const requirePortal = (portal: 'admin' | 'owner') => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized())
  if (req.user.portal !== portal) return next(forbidden())
  if (portal === 'owner' && req.user.role !== 'owner') return next(forbidden())
  if (portal === 'admin' && req.user.role === 'owner') return next(forbidden())
  next()
}

/**
 * CSRF protection for cookie-authenticated writes (double submit, bound to the session):
 * the token is readable by our pages only (same-site cookie + returned by /auth/me) and must be
 * echoed in the X-CSRF-Token header. Cross-site forms cannot set that header.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.user) return next()
  const sent = String(req.get(CSRF_HEADER) ?? '')
  const expected = req.user.csrfToken
  const okToken = sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
  if (!okToken) return next(forbidden('Your session security token is missing or out of date. Reload the page and try again.'))
  next()
}

export const sessionTtlMs = TTL_MS
