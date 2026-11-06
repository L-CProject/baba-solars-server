import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { db, schema, setup, signedIn, sql, teardown } from './helpers'
import { todayIST } from '../src/lib/time'

before(setup)
after(teardown)

const DAY = 86_400_000
/** A moment `daysAgo` days before today, at noon India time. */
const at = (daysAgo: number) => {
  const d = new Date(Date.parse(`${todayIST()}T12:00:00+05:30`) - daysAgo * DAY)
  return d.getTime() > Date.now() ? new Date(Date.now() - 60_000) : d
}
let n = 0
async function add(daysAgo: number, f: Partial<typeof schema.enquiries.$inferInsert> = {}) {
  n++
  await db.insert(schema.enquiries).values({
    id: `enq-test-${String(n).padStart(4, '0')}`, phone: `90000${String(n).padStart(5, '0')}`, source: 'contact', origin: 'website',
    createdAt: at(daysAgo), updatedAt: at(daysAgo), ...f,
  })
}
const get = async (q = '') => (await (await signedIn('admin')).get(`/api/admin/dashboard/analytics${q}`))

describe('Dashboard analytics', () => {
  test('empty database: zeros, no trend, no leads', async () => {
    const r = await get()
    assert.equal(r.status, 200)
    assert.equal(r.body.cards.total, 0)
    assert.equal(r.body.previous, null)
    assert.deepEqual(r.body.recentLeads, [])
    assert.equal(r.body.timeline.points.reduce((s: number, p: { total: number }) => s + p.total, 0), 0)
  })

  test('cards, charts and recent leads match the database', async () => {
    // Today: 3 (new home 5 kW, contacted commercial 10 kW, converted home not-sure)
    await add(0, { status: 'new', enquiryType: 'home', capacityKw: 5 })
    await add(0, { status: 'contacted', enquiryType: 'commercial', capacityKw: 10 })
    await add(0, { status: 'converted', enquiryType: 'home', capacityChoice: 'not-sure' })
    // 3 days ago: 2 (follow-up, custom; interested, 7 kW → "other sizes")
    await add(3, { status: 'follow-up', followUpOn: todayIST(), capacityChoice: 'custom' })
    await add(3, { status: 'interested', capacityKw: 7, propertyType: 'industrial' })
    // 12 days ago: 2 (closed, not-interested)
    await add(12, { status: 'closed' })
    await add(12, { status: 'not-interested', enquiryType: 'commercial', capacityKw: 30 })
    // 45 days ago: 1 new; 200 days ago: 1 new
    await add(45, { status: 'new' })
    await add(200, { status: 'new' })
    // Deleted: never counted
    await add(0, { status: 'new', deletedAt: new Date() })

    const { rows: [{ total }] } = await db.execute<{ total: number }>(sql`select count(*)::int as total from enquiries where deleted_at is null`)
    const all = await get()
    assert.equal(all.status, 200)
    assert.equal(all.body.cards.total, total)
    assert.equal(all.body.cards.total, 9)
    assert.equal(all.body.cards.new, 3)
    assert.equal(all.body.cards.contacted, 3, 'contacted + follow-up + interested')
    assert.equal(all.body.cards.closed, 3, 'converted + closed + not-interested')
    assert.equal(all.body.cards.converted, 1)
    assert.equal(all.body.cards.recent7d, 5)
    assert.equal(all.body.previous, null, 'no trend for all time')
    assert.equal(all.body.status.reduce((s: number, x: { count: number }) => s + x.count, 0), 9)
    assert.deepEqual(all.body.types, { home: 2, commercial: 3, unspecified: 4 })
    const cap = Object.fromEntries(all.body.capacity.map((c: { key: string; count: number }) => [c.key, c.count]))
    assert.equal(cap['5'], 1)
    assert.equal(cap['10'], 1)
    assert.equal(cap['30'], 1)
    assert.equal(cap.other, 1)
    assert.equal(cap.custom, 1)
    assert.equal(cap['not-sure'], 1)
    assert.equal(all.body.capacityNotGiven, 3)
    assert.equal(all.body.timeline.points.reduce((s: number, p: { total: number }) => s + p.total, 0), 9)
    assert.equal(all.body.monthly.length, 12)
    // Recent leads: newest first, at most 10, never deleted ones.
    assert.equal(all.body.recentLeads.length, 9)
    const times = all.body.recentLeads.map((e: { createdAt: string }) => Date.parse(e.createdAt))
    assert.deepEqual(times, [...times].sort((a, b) => b - a))
  })

  test('date filters narrow every number', async () => {
    const today = await get('?range=today')
    assert.equal(today.body.cards.total, 3)
    assert.equal(today.body.recentLeads.length, 3)
    assert.equal(today.body.timeline.granularity, 'day')

    const week = await get('?range=7d')
    assert.equal(week.body.cards.total, 5)
    assert.ok(week.body.previous, 'older data exists → trend available')
    assert.equal(week.body.previous.total, 2, 'the 12-day-old pair is in the previous 7 days')
    assert.equal(week.body.timeline.points.length, 7)

    const month30 = await get('?range=30d')
    assert.equal(month30.body.cards.total, 7)

    const first = todayIST()
    const custom = await get(`?range=custom&from=${new Date(Date.parse(`${first}T00:00:00Z`) - 13 * DAY).toISOString().slice(0, 10)}&to=${new Date(Date.parse(`${first}T00:00:00Z`) - 11 * DAY).toISOString().slice(0, 10)}`)
    assert.equal(custom.status, 200)
    assert.equal(custom.body.cards.total, 2)

    const thisMonth = await get('?range=month')
    assert.equal(thisMonth.status, 200)
    assert.ok(thisMonth.body.cards.total >= 3)
  })

  test('the recent list is capped at 10', async () => {
    for (let i = 0; i < 12; i++) await add(1, { status: 'new' })
    const r = await get()
    assert.equal(r.body.recentLeads.length, 10)
  })

  test('invalid filters are rejected', async () => {
    assert.equal((await get('?range=custom')).status, 400)
    assert.equal((await get('?range=custom&from=2026-02-10&to=2026-01-01')).status, 400)
    assert.equal((await get('?range=yesterday')).status, 400)
    assert.equal((await get('?range=custom&from=2026-13-45&to=2026-01-01')).status, 400)
  })

  test('website totals come from the database', async () => {
    const r = await get()
    const { rows: [s] } = await db.execute<{ projects: number; services: number }>(sql`
      select count(*) filter (where collection = 'projects')::int as projects,
             count(*) filter (where collection = 'services' and status = 'published')::int as services from site_items`)
    assert.equal(r.body.cards.projects, s.projects)
    assert.equal(r.body.cards.activeServices, s.services)
    assert.equal(typeof r.body.cards.publishedOffers, 'number')
  })
})
