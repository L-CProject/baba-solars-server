import type { CookieOptions, Request, Response } from 'express'
import { env } from '../../config/env'
import { CSRF_COOKIE, SESSION_COOKIE, sessionTtlMs } from '../../middleware/auth'
import { noContent, ok } from '../../lib/http'
import { unauthorized } from '../../lib/errors'
import { changePasswordBody, loginBody } from './auth.schema'
import { authService, profileOf } from './auth.service'

const base = (): CookieOptions => ({
  secure: env.cookieSecure, sameSite: 'lax', path: '/', domain: env.COOKIE_DOMAIN || undefined,
})

function setSessionCookies(res: Response, token: string, csrf: string) {
  res.cookie(SESSION_COOKIE, token, { ...base(), httpOnly: true, maxAge: sessionTtlMs() })
  // Readable by the website's JavaScript (double-submit CSRF); useless without the HttpOnly session.
  res.cookie(CSRF_COOKIE, csrf, { ...base(), httpOnly: false, maxAge: sessionTtlMs() })
}
function clearSessionCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...base(), httpOnly: true })
  res.clearCookie(CSRF_COOKIE, { ...base() })
}

export const authController = {
  async login(req: Request, res: Response) {
    const body = loginBody.parse(req.body)
    const { token, csrfToken, profile } = await authService.login(body, { ip: req.ip ?? '', userAgent: req.get('user-agent') ?? '' })
    setSessionCookies(res, token, csrfToken)
    req.log?.info({ userId: profile.user.id, portal: body.portal }, 'login')
    return ok(res, { ...profile, csrfToken })
  },
  async me(req: Request, res: Response) {
    if (!req.user) throw unauthorized()
    return ok(res, { ...profileOf(req.user), portal: req.user.portal, csrfToken: req.user.csrfToken })
  },
  async logout(req: Request, res: Response) {
    if (req.user) await authService.logout(req.user.sessionId)
    clearSessionCookies(res)
    return noContent(res)
  },
  async changePassword(req: Request, res: Response) {
    const body = changePasswordBody.parse(req.body)
    await authService.changePassword(req.user!, body.currentPassword, body.newPassword)
    return noContent(res)
  },
}
