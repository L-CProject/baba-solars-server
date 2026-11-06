import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client, PASSWORDS, db, emailOf, setup, signedIn, sql, teardown } from './helpers'

before(setup)
after(teardown)

describe('Sign-in', () => {
  test('admin signs in on the admin login; cookies are HttpOnly + SameSite', async () => {
    const c = new Client()
    const r = await c.login('admin', 'admin')
    assert.equal(r.status, 200)
    assert.equal(r.body.user.role, 'admin')
    assert.equal(r.body.user.passwordHash, undefined)
    const setCookie = r.headers.getSetCookie().join('\n')
    assert.match(setCookie, /bs_session=[^;]+;.*HttpOnly/i)
    assert.match(setCookie, /SameSite=Lax/i)
    const me = await c.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.portal, 'admin')
  })

  test('owner signs in on the owner login', async () => {
    const c = new Client()
    const r = await c.login('owner', 'owner')
    assert.equal(r.status, 200)
    assert.equal(r.body.user.role, 'owner')
    assert.equal((await c.get('/api/auth/me')).body.portal, 'owner')
  })

  test('an owner account on the admin login gets the generic error (no owner wording)', async () => {
    const r = await new Client().login('owner', 'admin')
    assert.equal(r.status, 401)
    assert.equal(r.body.error.message, 'Incorrect email or password.')
    assert.doesNotMatch(JSON.stringify(r.body), /owner/i)
  })

  test('a staff account on the owner login is refused', async () => {
    const r = await new Client().login('admin', 'owner')
    assert.equal(r.status, 401)
  })

  test('wrong password and unknown email get the same answer', async () => {
    const a = await new Client().post('/api/auth/login', { email: emailOf('admin'), password: 'wrong-password-1', portal: 'admin' })
    const b = await new Client().post('/api/auth/login', { email: 'nobody@test.local', password: 'wrong-password-1', portal: 'admin' })
    assert.equal(a.status, 401)
    assert.equal(b.status, 401)
    assert.equal(a.body.error.message, b.body.error.message)
  })

  test('passwords are stored as scrypt hashes, never in plain text', async () => {
    const { rows } = await db.execute<{ password_hash: string }>(sql`select password_hash from users`)
    for (const r of rows) {
      assert.match(r.password_hash, /^scrypt\$\d+\$\d+\$\d+\$/)
      assert.ok(!Object.values(PASSWORDS).some((p) => r.password_hash.includes(p)))
    }
  })

  test('brute force: repeated failures on one account are blocked even from different IPs', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) {
      const r = await new Client().post('/api/auth/login', { email: 'victim@test.local', password: `guess-${i}-x1`, portal: 'admin' })
      statuses.push(r.status)
    }
    assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401])
    assert.equal(statuses[6], 429)
  })

  test('brute force: one IP is limited across accounts', async () => {
    const c = new Client()
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await c.post('/api/auth/login', { email: `random${i}@test.local`, password: 'nope-nope-1', portal: 'admin' })).status)
    assert.equal(statuses[6], 429)
  })
})

describe('Sessions', () => {
  test('logout ends the session on the server', async () => {
    const c = await signedIn('admin')
    const token = c.cookies.get('bs_session')!
    assert.equal((await c.post('/api/auth/logout')).status, 204)
    // Re-using the old cookie no longer works.
    const replay = new Client()
    replay.cookies.set('bs_session', token)
    assert.equal((await replay.get('/api/auth/me')).status, 401)
  })

  test('an expired session is rejected', async () => {
    const c = await signedIn('sales')
    await db.execute(sql`update sessions set expires_at = now() - interval '1 minute'`)
    assert.equal((await c.get('/api/auth/me')).status, 401)
    assert.equal((await c.get('/api/enquiries')).status, 401)
  })

  test('writes without the CSRF token are refused', async () => {
    const c = await signedIn('admin')
    const r = await c.req('PUT', '/api/enquiries/enq-csrf-test', { email: 'x@example.com' }, { csrf: false })
    assert.equal(r.status, 403)
  })
})

describe('Role-based access on the server', () => {
  test('not signed in: protected APIs answer 401', async () => {
    const anon = new Client()
    for (const p of ['/api/enquiries', '/api/admin/dashboard', '/api/admin/dashboard/analytics', '/api/owner/dashboard', '/api/users']) {
      assert.equal((await anon.get(p)).status, 401, p)
    }
  })

  test('admin cannot use owner-only APIs', async () => {
    const admin = await signedIn('admin')
    assert.equal((await admin.get('/api/owner/dashboard')).status, 403)
  })

  test('owner can use the owner portal API and read leads, nothing else', async () => {
    const owner = await signedIn('owner')
    assert.equal((await owner.get('/api/owner/dashboard')).status, 200)
    assert.equal((await owner.get('/api/enquiries')).status, 200)
    for (const p of ['/api/admin/dashboard', '/api/admin/dashboard/analytics', '/api/users', '/api/business', '/api/quotations', '/api/invoices']) {
      assert.equal((await owner.get(p)).status, 403, p)
    }
    assert.equal((await owner.put('/api/enquiries/enq-owner-write', { email: 'x@example.com' })).status, 403)
    assert.equal((await owner.req('POST', '/api/uploads', undefined, { raw: Buffer.from('x'), type: 'image/png' })).status, 403)
  })

  test('sales sees leads analytics but not team management', async () => {
    const sales = await signedIn('sales')
    assert.equal((await sales.get('/api/admin/dashboard/analytics')).status, 200)
    assert.equal((await sales.get('/api/users')).status, 403)
    assert.equal((await sales.get('/api/owner/dashboard')).status, 403)
  })

  test('editor (website content only) cannot read leads', async () => {
    const editor = await signedIn('editor')
    assert.equal((await editor.get('/api/enquiries')).status, 403)
    assert.equal((await editor.get('/api/admin/dashboard/analytics')).status, 403)
  })

  test('admin has full staff access', async () => {
    const admin = await signedIn('admin')
    for (const p of ['/api/enquiries', '/api/admin/dashboard', '/api/admin/dashboard/analytics', '/api/users']) {
      assert.equal((await admin.get(p)).status, 200, p)
    }
  })
})
