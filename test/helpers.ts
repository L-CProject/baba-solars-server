/**
 * Test harness: runs the real Express app (createApp) on a random port against a dedicated
 * PostgreSQL TEST database. The database name must contain "test" — the suite truncates tables.
 *
 *   cp .env.test.example .env.test   (point TEST_DATABASE_URL at an empty database)
 *   npm test
 */
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
process.env.TRUST_PROXY ??= '1'
process.env.LOG_LEVEL ??= 'silent'
process.env.RATE_LIMIT_LOGIN ??= '5'
process.env.RATE_LIMIT_ENQUIRIES ??= '5'
process.env.RATE_LIMIT_API ??= '100000'
process.env.UPLOAD_MAX_MB ??= '1'
process.env.UPLOAD_DIR ??= './.test-uploads'
process.env.REDIS_URL = ''

const dbName = (() => { try { return new URL(process.env.DATABASE_URL!).pathname.slice(1) } catch { return '' } })()
if (!/test/i.test(dbName)) {
  console.error(`Refusing to run tests: TEST_DATABASE_URL must point to a database whose name contains "test" (got "${dbName || 'none'}").`)
  process.exit(1)
}

const { createApp } = await import('../src/app')
const { db, pool } = await import('../src/db/client')
const { migrate } = await import('drizzle-orm/node-postgres/migrator')
const { sql } = await import('drizzle-orm')
const { ROLES } = await import('../shared/lib/rbac')
const schema = await import('../src/db/schema')
const { usersService } = await import('../src/modules/users/users.service')

export { db, pool, sql, schema }

export const PASSWORDS = { admin: 'AdminPass123', owner: 'OwnerPass123', sales: 'SalesPass123', editor: 'EditorPass123' } as const
export type TestRole = keyof typeof PASSWORDS
export const emailOf = (role: TestRole) => `${role}@test.local`

let server: Server
export let BASE = ''

/** Migrate, wipe test data, create one user per role and start the API. */
export async function setup() {
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname, migrationsSchema: 'drizzle', migrationsTable: '__migrations' })
  await db.execute(sql`truncate enquiry_activities, follow_ups, enquiries, sessions, uploads, users, roles restart identity cascade`)
  for (const r of ROLES) await db.insert(schema.roles).values({ key: r.value, name: r.label, description: r.description })
  for (const role of Object.keys(PASSWORDS) as TestRole[]) {
    await usersService.create({ name: `Test ${role}`, email: emailOf(role), role, password: PASSWORDS[role], isActive: true })
  }
  server = createApp().listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

export async function teardown() {
  await new Promise((r) => server.close(r))
  await pool.end()
}

let ipCounter = 1
/** A fresh client IP per call (TRUST_PROXY=1), so per-IP rate limits don't leak between tests. */
export const freshIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`

export interface Res<T = any> { status: number; body: T; headers: Headers }

/** Tiny cookie-aware client (one per signed-in user). */
export class Client {
  cookies = new Map<string, string>()
  ip = freshIp()
  async req<T = any>(method: string, path: string, body?: unknown, opts: { raw?: Buffer; type?: string; csrf?: boolean } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { 'x-forwarded-for': this.ip }
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    if (method !== 'GET' && opts.csrf !== false && this.cookies.get('bs_csrf')) headers['x-csrf-token'] = decodeURIComponent(this.cookies.get('bs_csrf')!)
    let payload: BodyInit | undefined
    if (opts.raw) { payload = new Uint8Array(opts.raw); headers['content-type'] = opts.type ?? 'application/octet-stream' }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json' }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      const k = pair.slice(0, i)
      const v = pair.slice(i + 1)
      if (!v || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k)
      else this.cookies.set(k, v)
    }
    const text = await res.text()
    let parsed: unknown = text
    try { parsed = text ? JSON.parse(text) : null } catch { /* not JSON */ }
    return { status: res.status, body: parsed as T, headers: res.headers }
  }
  get = <T = any>(p: string) => this.req<T>('GET', p)
  post = <T = any>(p: string, b?: unknown) => this.req<T>('POST', p, b)
  put = <T = any>(p: string, b?: unknown) => this.req<T>('PUT', p, b)
  login(role: TestRole, portal: 'admin' | 'owner' = role === 'owner' ? 'owner' : 'admin') {
    return this.post('/api/auth/login', { email: emailOf(role), password: PASSWORDS[role], portal })
  }
}

export async function signedIn(role: TestRole) {
  const c = new Client()
  const r = await c.login(role)
  if (r.status !== 200) throw new Error(`login ${role} failed: ${r.status} ${JSON.stringify(r.body)}`)
  return c
}
