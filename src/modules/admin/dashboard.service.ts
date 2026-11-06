import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import type { EnquiryStatus } from '@/types'
import type { DashboardAnalytics, DashboardRangeKey } from '@/types/api'
import { CAPACITY_KW_OPTIONS, CLOSED_STATUSES, ENQUIRY_STATUS_VALUES } from '@/lib/enquiries'
import { db } from '../../db/client'
import { enquiries, siteItems, users } from '../../db/schema'
import { invalid } from '../../lib/errors'
import { todayIST } from '../../lib/time'
import { toEnquiry } from '../enquiries/enquiries.service'
import { offersService } from '../offers/offers.service'

/** Lead statuses counted as "contacted" on the dashboard: reached the customer, not yet closed. */
export const CONTACTED_STATUSES: EnquiryStatus[] = ['contacted', 'follow-up', 'interested', 'site-visit', 'proposal', 'quoted']

const DAY = 86_400_000
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
/** Start of a calendar day in India time, as an instant. */
const istStart = (iso: string) => new Date(`${iso}T00:00:00+05:30`)
const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(','))

const RANGE_LABEL: Record<DashboardRangeKey, string> = {
  all: 'All time', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', month: 'This month', custom: 'Custom range',
}

export interface DashboardRangeInput { range: DashboardRangeKey; from?: string; to?: string }

/** Turn a filter into an India-time day window [from, to] (inclusive). `from` is null for "all time". */
export function resolveRange(q: DashboardRangeInput, today = todayIST()): { key: DashboardRangeKey; from: string | null; to: string } {
  switch (q.range) {
    case 'today': return { key: 'today', from: today, to: today }
    case '7d': return { key: '7d', from: addDays(today, -6), to: today }
    case '30d': return { key: '30d', from: addDays(today, -29), to: today }
    case 'month': return { key: 'month', from: `${today.slice(0, 7)}-01`, to: today }
    case 'custom': {
      if (!q.from || !q.to) throw invalid({ from: 'Pick a start and an end date.' })
      if (q.from > q.to) throw invalid({ to: 'The end date must be on or after the start date.' })
      if (daysBetween(q.from, q.to) > 3660) throw invalid({ from: 'Choose a range of at most 10 years.' })
      return { key: 'custom', from: q.from, to: q.to }
    }
    default: return { key: 'all', from: null, to: today }
  }
}

type Granularity = 'day' | 'week' | 'month'
const granularityFor = (days: number): Granularity => (days <= 62 ? 'day' : days <= 400 ? 'week' : 'month')

const alive = isNull(enquiries.deletedAt)
const kwExpr = sql`coalesce(${enquiries.capacityKw}, nullif(${enquiries.estimate}->>'capacityKw', '')::numeric)`
const typeExpr = sql<string>`coalesce(${enquiries.enquiryType}, case
  when ${enquiries.propertyType} in ('residential','housing-society') then 'home'
  when ${enquiries.propertyType} in ('commercial','industrial') then 'commercial' end)`

async function countsIn(start: Date | null, end: Date) {
  const where = and(alive, start ? gte(enquiries.createdAt, start) : undefined, lt(enquiries.createdAt, end))
  const [row] = await db.select({
    total: sql<number>`count(*)::int`,
    new: sql<number>`count(*) filter (where ${enquiries.status} = 'new')::int`,
    contacted: sql<number>`count(*) filter (where ${enquiries.status} in (${sqlList(CONTACTED_STATUSES)}))::int`,
    closed: sql<number>`count(*) filter (where ${enquiries.status} in (${sqlList(CLOSED_STATUSES)}))::int`,
    converted: sql<number>`count(*) filter (where ${enquiries.status} = 'converted')::int`,
  }).from(enquiries).where(where)
  return row
}

export const dashboardService = {
  /**
   * Admin dashboard analytics for one date filter. Every number is counted by PostgreSQL;
   * at most 10 enquiry rows are returned (the recent leads list).
   */
  async analytics(q: DashboardRangeInput): Promise<DashboardAnalytics> {
    const today = todayIST()
    const range = resolveRange(q, today)
    const end = istStart(addDays(range.to, 1))

    // Earliest enquiry: start of the "all time" timeline and the proof that older data exists for trends.
    const [{ first }] = await db.select({ first: sql<string | null>`to_char(min(${enquiries.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')` }).from(enquiries).where(alive)
    const from = range.from ?? first ?? today
    const start = range.from ? istStart(range.from) : null
    const spanDays = daysBetween(from, range.to) + 1
    const g = granularityFor(spanDays)
    const windowWhere = and(alive, start ? gte(enquiries.createdAt, start) : undefined, lt(enquiries.createdAt, end))

    // Previous period of the same length, only when enquiries older than it exist (otherwise a trend would be invented).
    const prevFrom = range.from ? addDays(range.from, -spanDays) : null
    const hasHistory = !!(prevFrom && first && first <= prevFrom)

    const [cards, previous, recent7d, statusRows, typeRows, capRows, timelineRows, monthlyRows, recentRows, siteRows, liveOffers] = await Promise.all([
      countsIn(start, end),
      hasHistory ? countsIn(istStart(prevFrom!), start!) : Promise.resolve(null),
      db.select({ n: sql<number>`count(*)::int` }).from(enquiries).where(and(alive, gte(enquiries.createdAt, istStart(addDays(today, -6))))),
      db.select({ status: enquiries.status, count: sql<number>`count(*)::int` }).from(enquiries).where(windowWhere).groupBy(enquiries.status),
      db.select({ type: typeExpr, count: sql<number>`count(*)::int` }).from(enquiries).where(windowWhere).groupBy(sql`1`),
      db.select({ kw: sql<string | null>`${kwExpr}::text`, choice: enquiries.capacityChoice, count: sql<number>`count(*)::int` })
        .from(enquiries).where(windowWhere).groupBy(sql`1`, sql`2`),
      db.execute<{ bucket: string; total: number }>(sql`
        with b as (
          select generate_series(date_trunc(${g}, ${from}::timestamp), date_trunc(${g}, ${range.to}::timestamp), ${`1 ${g}`}::interval) as bucket
        )
        select to_char(b.bucket, 'YYYY-MM-DD') as bucket, count(e.id)::int as total
        from b left join ${enquiries} e
          on e.deleted_at is null
         and date_trunc(${g}, e.created_at at time zone 'Asia/Kolkata') = b.bucket
         and e.created_at >= ${istStart(from).toISOString()}::timestamptz and e.created_at < ${end.toISOString()}::timestamptz
        group by b.bucket order by b.bucket`),
      db.execute<{ month: string; total: number; converted: number }>(sql`
        with m as (
          select generate_series(date_trunc('month', ${today}::timestamp) - interval '11 months', date_trunc('month', ${today}::timestamp), interval '1 month') as month
        )
        select to_char(m.month, 'YYYY-MM') as month, count(e.id)::int as total,
          count(e.id) filter (where e.status = 'converted')::int as converted
        from m left join ${enquiries} e
          on e.deleted_at is null and date_trunc('month', e.created_at at time zone 'Asia/Kolkata') = m.month
        group by m.month order by m.month`),
      db.select({ e: enquiries, assignedName: users.name }).from(enquiries).leftJoin(users, eq(users.id, enquiries.assignedTo))
        .where(windowWhere).orderBy(desc(enquiries.createdAt), desc(enquiries.id)).limit(10),
      db.select({ collection: siteItems.collection, status: siteItems.status, n: sql<number>`count(*)::int` }).from(siteItems)
        .where(sql`${siteItems.collection} in ('projects','services')`).groupBy(siteItems.collection, siteItems.status),
      offersService.active(),
    ])

    const byStatus = Object.fromEntries(ENQUIRY_STATUS_VALUES.map((s) => [s, 0])) as Record<EnquiryStatus, number>
    for (const r of statusRows) if (r.status in byStatus) byStatus[r.status as EnquiryStatus] = r.count

    const types = { home: 0, commercial: 0, unspecified: 0 }
    for (const r of typeRows) {
      if (r.type === 'home' || r.type === 'commercial') types[r.type] += r.count
      else types.unspecified += r.count
    }

    // Capacity: the form's options as their own bars; other sizes, custom and "not sure" grouped.
    const standard = new Map<number, number>(CAPACITY_KW_OPTIONS.map((k) => [k, 0]))
    let otherSizes = 0
    let custom = 0
    let notSure = 0
    let notGiven = 0
    for (const r of capRows) {
      const kw = r.kw == null ? null : Number(r.kw)
      if (kw != null && kw > 0) {
        if (standard.has(kw)) standard.set(kw, standard.get(kw)! + r.count)
        else otherSizes += r.count
      } else if (r.choice === 'custom') custom += r.count
      else if (r.choice === 'not-sure') notSure += r.count
      else notGiven += r.count
    }
    const capacity = [
      ...[...standard].map(([kw, count]) => ({ key: String(kw), label: `${kw} kW`, count })),
      { key: 'other', label: 'Other sizes', count: otherSizes },
      { key: 'custom', label: 'Custom', count: custom },
      { key: 'not-sure', label: 'Not sure', count: notSure },
    ]

    const site = (c: string, s?: string) => siteRows.filter((r) => r.collection === c && (!s || r.status === s)).reduce((n, r) => n + r.n, 0)

    return {
      range: { key: range.key, label: RANGE_LABEL[range.key], from: range.from, to: range.to, firstEnquiryOn: first },
      generatedAt: new Date().toISOString(),
      cards: {
        ...cards,
        recent7d: recent7d[0].n,
        projects: site('projects'),
        projectsPublished: site('projects', 'published'),
        activeServices: site('services', 'published'),
        publishedOffers: liveOffers.length,
      },
      previous: previous && start ? { ...previous, from: prevFrom!, to: addDays(range.from!, -1) } : null,
      recentLeads: recentRows.map((r) => toEnquiry(r.e, r.assignedName)),
      status: ENQUIRY_STATUS_VALUES.map((s) => ({ status: s, count: byStatus[s] })),
      types,
      capacity,
      capacityNotGiven: notGiven,
      timeline: { granularity: g, points: timelineRows.rows.map((r) => ({ bucket: r.bucket, total: Number(r.total) })) },
      monthly: monthlyRows.rows.map((r) => ({ month: r.month, total: Number(r.total), converted: Number(r.converted) })),
    }
  },
}
