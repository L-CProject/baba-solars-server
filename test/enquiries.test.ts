import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client, db, schema, setup, signedIn, sql, teardown } from './helpers'

before(setup)
after(teardown)

const submit = (body: unknown, c = new Client()) => c.post('/api/public/enquiries', body)
const rowOf = async (id: string) => (await db.execute<Record<string, unknown>>(sql`select * from enquiries where id = ${id}`)).rows[0]
const countRows = async () => (await db.execute<{ n: number }>(sql`select count(*)::int as n from enquiries`)).rows[0].n

describe('Public enquiry: contact rule (mobile OR email)', () => {
  test('mobile only is accepted and stored (normalised to 10 digits)', async () => {
    const r = await submit({ phone: '+91 98765 43210' })
    assert.equal(r.status, 201)
    assert.match(r.body.id, /^enq-[0-9a-f]{16}$/)
    const row = await rowOf(r.body.id)
    assert.equal(row.phone, '9876543210')
    assert.equal(row.email, '')
    assert.equal(row.status, 'new')
    assert.equal(row.origin, 'website')
    assert.ok(!Number.isNaN(Date.parse(String(row.created_at))), 'created_at is a timestamp')
  })

  test('email only is accepted', async () => {
    const r = await submit({ email: 'customer@example.com' })
    assert.equal(r.status, 201)
    assert.equal((await rowOf(r.body.id)).email, 'customer@example.com')
  })

  test('both mobile and email are accepted', async () => {
    const r = await submit({ phone: '9123456789', email: 'both@example.in' })
    assert.equal(r.status, 201)
    const row = await rowOf(r.body.id)
    assert.equal(row.phone, '9123456789')
    assert.equal(row.email, 'both@example.in')
  })

  test('both empty is rejected with a clear message and nothing is saved', async () => {
    const before = await countRows()
    for (const body of [{}, { phone: '', email: '' }, { phone: '   ', email: null, name: 'Ravi', message: 'Hello' }]) {
      const r = await submit(body)
      assert.equal(r.status, 400)
      assert.equal(r.body.error.code, 'validation')
      assert.match(r.body.error.message, /mobile number or an email/i)
      assert.ok(r.body.error.fieldErrors.phone)
      assert.ok(r.body.error.fieldErrors.email)
    }
    assert.equal(await countRows(), before)
  })

  test('invalid mobile is rejected even when the email is valid', async () => {
    for (const phone of ['12345', '5123456789', '98765432101234', 'abcdefghij']) {
      const r = await submit({ phone, email: 'ok@example.com' })
      assert.equal(r.status, 400, phone)
      assert.ok(r.body.error.fieldErrors.phone, phone)
      assert.equal(r.body.error.fieldErrors.email, undefined)
    }
  })

  test('invalid email is rejected even when the mobile is valid', async () => {
    for (const email of ['plainaddress', 'a@b', 'a b@c.com', '@example.com', 'name@.com', 'name@example.']) {
      const r = await submit({ phone: '9876543210', email })
      assert.equal(r.status, 400, email)
      assert.ok(r.body.error.fieldErrors.email, email)
    }
  })
})

describe('Public enquiry: optional fields', () => {
  test('all other fields may be empty or missing', async () => {
    const r = await submit({ phone: '9000000001', name: '', city: '', service: '', message: '', enquiryType: '', capacityKw: '', capacityChoice: '' })
    assert.equal(r.status, 201)
    const row = await rowOf(r.body.id)
    assert.equal(row.name, '')
    assert.equal(row.service, '')
    assert.equal(row.enquiry_type, null)
    assert.equal(row.capacity_kw, null)
    assert.equal(row.capacity_choice, null)
  })

  test('null values are treated as not given', async () => {
    const r = await submit({ email: 'nulls@example.com', name: null, city: null, message: null, capacityKw: null })
    assert.equal(r.status, 201)
  })

  test('Home / Residential selection is stored', async () => {
    const r = await submit({ phone: '9000000002', enquiryType: 'home' })
    const row = await rowOf(r.body.id)
    assert.equal(row.enquiry_type, 'home')
    assert.equal(row.property_type, 'residential')
  })

  test('Commercial selection is stored', async () => {
    const r = await submit({ phone: '9000000003', enquiryType: 'commercial' })
    const row = await rowOf(r.body.id)
    assert.equal(row.enquiry_type, 'commercial')
    assert.equal(row.property_type, 'commercial')
  })

  test('an unknown enquiry type is rejected', async () => {
    const r = await submit({ phone: '9000000004', enquiryType: 'industrial-park' })
    assert.equal(r.status, 400)
    assert.ok(r.body.error.fieldErrors.enquiryType)
  })

  test('capacity: a kW value, "Other / Custom" and "Not sure yet" are stored', async () => {
    const a = await rowOf((await submit({ phone: '9000000005', capacityKw: 5 })).body.id)
    assert.equal(Number(a.capacity_kw), 5)
    const b = await rowOf((await submit({ phone: '9000000006', capacityChoice: 'not-sure' })).body.id)
    assert.equal(b.capacity_choice, 'not-sure')
    const c = await rowOf((await submit({ phone: '9000000007', capacityChoice: 'custom', capacityKw: 42 })).body.id)
    assert.equal(Number(c.capacity_kw), 42)
    assert.equal(c.capacity_choice, null, 'a number wins over the choice')
    const d = await rowOf((await submit({ phone: '9000000008', capacityChoice: 'custom' })).body.id)
    assert.equal(d.capacity_choice, 'custom')
  })

  test('invalid capacity values are rejected', async () => {
    assert.equal((await submit({ phone: '9000000009', capacityChoice: 'lots' })).status, 400)
    assert.equal((await submit({ phone: '9000000009', capacityKw: -3 })).status, 400)
    assert.equal((await submit({ phone: '9000000009', capacityKw: 0 })).status, 400)
    assert.equal((await submit({ phone: '9000000009', capacityKw: 'five' })).status, 400)
  })

  test('text is trimmed, control characters removed and lengths enforced', async () => {
    const r = await submit({ phone: '9000000010', name: '  Ravi\u0000 Kumar\u0007  ', message: 'Line 1\nLine 2' })
    assert.equal(r.status, 201)
    const row = await rowOf(r.body.id)
    assert.equal(row.name, 'Ravi Kumar')
    assert.equal(row.message, 'Line 1\nLine 2')
    const long = await submit({ phone: '9000000010', name: 'x'.repeat(121) })
    assert.equal(long.status, 400)
  })

  test('HTML is stored as plain text (escaped when rendered, never executed)', async () => {
    const r = await submit({ phone: '9000000011', name: '<img src=x onerror=alert(1)>' })
    assert.equal(r.status, 201)
    assert.equal(r.headers.get('content-type')?.startsWith('application/json'), true)
  })
})

describe('Public enquiry: reliability', () => {
  test('every enquiry gets a unique id', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 4; i++) ids.add((await submit({ email: `unique${i}@example.com` })).body.id)
    assert.equal(ids.size, 4)
  })

  test('the same submissionId (double click / retry) saves one enquiry', async () => {
    const body = { phone: '9000000012', submissionId: 'b6f3f1c2-0d0e-4a8e-9b51-5b9f3a2c1d11' }
    const before = await countRows()
    const [a, b] = await Promise.all([submit(body), submit(body)])
    assert.equal(a.status, 201)
    assert.equal(b.status, 201)
    assert.equal(a.body.id, b.body.id)
    assert.equal(await countRows(), before + 1)
  })

  test('a filled honeypot is answered like a success but not stored', async () => {
    const before = await countRows()
    const r = await submit({ phone: '9000000013', website: 'http://spam.example' })
    assert.equal(r.status, 201)
    assert.equal(await countRows(), before)
  })

  test('the website form is rate limited per connection', async () => {
    const c = new Client()
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await submit({ email: `rl${i}@example.com` }, c)).status)
    assert.deepEqual(statuses.slice(0, 5), [201, 201, 201, 201, 201])
    assert.equal(statuses[6], 429)
  })

  test('the enquiry appears in the admin list with its fields', async () => {
    const r = await submit({ email: 'listed@example.com', enquiryType: 'commercial', capacityKw: 25 })
    const admin = await signedIn('admin')
    const list = await admin.get(`/api/enquiries?search=listed%40example.com`)
    assert.equal(list.status, 200)
    const found = list.body.items.find((e: { id: string }) => e.id === r.body.id)
    assert.ok(found)
    assert.equal(found.enquiryType, 'commercial')
    assert.equal(found.capacityKw, 25)
  })
})

describe('Admin enquiry form uses the same rule', () => {
  test('admin can save a lead with only an email; empty contact is rejected', async () => {
    const admin = await signedIn('admin')
    const ok = await admin.put('/api/enquiries/enq-admin-only-email', { email: 'walkin@example.com', source: 'walk-in' })
    assert.equal(ok.status, 200)
    const bad = await admin.put('/api/enquiries/enq-admin-empty', { name: 'No contact', source: 'walk-in' })
    assert.equal(bad.status, 400)
    assert.ok(bad.body.error.fieldErrors.phone)
  })

  test('the database still refuses a row with neither mobile nor email', async () => {
    await assert.rejects(db.insert(schema.enquiries).values({ id: 'enq-db-guard', source: 'manual', origin: 'admin' }))
  })
})
