import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { Client, setup, signedIn, teardown } from './helpers'

before(setup)
after(teardown)

const b64 = (s: string) => Buffer.from(s, 'base64')
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
const JPEG = b64('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')
const WEBP = b64('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==')
const GIF = b64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')

const upload = (c: Client, data: Buffer, type: string) => c.req('POST', '/api/uploads', undefined, { raw: data, type })

describe('Image uploads', () => {
  test('PNG, JPG and WebP are stored with a safe random name and served back', async () => {
    const admin = await signedIn('admin')
    for (const [data, type, ext] of [[PNG, 'image/png', 'png'], [JPEG, 'image/jpeg', 'jpg'], [WEBP, 'image/webp', 'webp']] as const) {
      const r = await upload(admin, data, type)
      assert.equal(r.status, 201, `${type}: ${JSON.stringify(r.body)}`)
      assert.match(r.body.url, new RegExp(`^/uploads/img-[0-9a-f]{16}\\.${ext}$`))
      assert.equal(r.body.mime, type)
      const file = await admin.req('GET', r.body.url)
      assert.equal(file.status, 200)
      assert.equal(file.headers.get('x-content-type-options'), 'nosniff')
    }
  })

  test('the real content decides, not the declared type', async () => {
    const admin = await signedIn('admin')
    const r = await upload(admin, PNG, 'image/jpeg')
    assert.equal(r.status, 201)
    assert.equal(r.body.mime, 'image/png')
  })

  test('the same image uploaded twice is stored once', async () => {
    const admin = await signedIn('admin')
    const a = await upload(admin, PNG, 'image/png')
    const b = await upload(admin, PNG, 'image/png')
    assert.equal(a.body.url, b.body.url)
  })

  test('non-images and unsupported formats are refused', async () => {
    const admin = await signedIn('admin')
    const cases: Array<[Buffer, string]> = [
      [Buffer.from('<?php echo "hi"; ?>                '), 'image/png'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml'],
      [GIF, 'image/gif'],
      [Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff'), 'application/octet-stream'],
    ]
    for (const [data, type] of cases) {
      const r = await upload(admin, data, type)
      assert.equal(r.status, 400, type)
      assert.equal(r.body.error.code, 'validation')
    }
  })

  test('a file with an image signature but a broken header is refused', async () => {
    const admin = await signedIn('admin')
    const fake = Buffer.concat([PNG.subarray(0, 8), Buffer.from('this is not an IHDR chunk at all')])
    const r = await upload(admin, fake, 'image/png')
    assert.equal(r.status, 400)
    assert.match(r.body.error.message, /damaged|not a real image/i)
  })

  test('an empty body is refused', async () => {
    const admin = await signedIn('admin')
    const r = await upload(admin, Buffer.alloc(0), 'image/png')
    assert.equal(r.status, 400)
  })

  test('an oversized file is refused with a size message', async () => {
    const admin = await signedIn('admin')
    const big = Buffer.concat([PNG, Buffer.alloc(1.5 * 1024 * 1024)])
    const r = await upload(admin, big, 'image/png')
    assert.equal(r.status, 413)
    assert.match(r.body.error.message, /1 MB or smaller/)
  })

  test('uploads require sign-in and the uploads permission', async () => {
    assert.equal((await upload(new Client(), PNG, 'image/png')).status, 401)
    const owner = await signedIn('owner')
    assert.equal((await upload(owner, PNG, 'image/png')).status, 403)
  })

  test('path traversal in /uploads URLs is not served', async () => {
    const c = new Client()
    for (const p of ['/uploads/../package.json', '/uploads/..%2Fpackage.json', '/uploads/.env']) {
      const r = await c.req('GET', p)
      assert.notEqual(r.status, 200, p)
    }
  })

  test('only files written by the API are in the upload folder', () => {
    const dir = path.resolve(process.env.UPLOAD_DIR!)
    assert.ok(existsSync(dir))
    for (const f of readdirSync(dir)) assert.match(f, /^img-[0-9a-f]{16}\.(png|jpg|webp)$/)
  })
})
