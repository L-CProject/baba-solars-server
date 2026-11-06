import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm'
import type {
  ContactOutcome, Enquiry, EnquiryActivity, EnquiryActivityType, EnquiryDetail, EnquirySource, EnquiryStatus, FollowUp, LeadStats, Proposal,
} from '@/types'
import type { EnquiryImportResult } from '@/types/api'
import {
  ACTIVITY_LABEL, CLOSED_STATUSES, CONTACT_REQUIRED_MESSAGE, ENQUIRY_SOURCES, ENQUIRY_STATUS_LABEL, ENQUIRY_STATUS_VALUES, isClosedStatus, normalizeEnquiry, normalizeMobile, originOf, validateContactMethod, validateEnquiry,
} from '@/lib/enquiries'
import { hasErrors } from '@/lib/schemas'
import { packagePrice } from '@/lib/pricing'
import { systemCost } from '@/lib/calculator'
import { computeSubsidy } from '@/lib/subsidy'
import { stateName } from '@/lib/states'
import { db, tx, type DbOrTx, type Tx } from '../../db/client'
import { companies, enquiries, enquiryActivities, followUps, users } from '../../db/schema'
import { AppError, assertValid, invalid, notFound } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { paginated, searchTerms } from '../../lib/http'
import { todayIST } from '../../lib/time'
import type { AuthUser } from '../../middleware/auth'
import { loadContent } from '../content/settings.repo'
import { companyFromRow } from '../companies/companies.mapper'
import { proposalsService } from '../proposals/proposals.service'
import type { EnquirySaveBody, ListEnquiriesQuery, PublicEnquiryBody, QuoteRequestBody } from './enquiries.schema'

type Row = typeof enquiries.$inferSelect
/** Who did something: a signed-in user, or the website (null). */
export type Actor = Pick<AuthUser, 'id' | 'name'> | null

const assignee = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${enquiries.assignedTo})`.as('assigned_name')

export function toEnquiry(r: Row, assignedToName: string | null = null): Enquiry {
  return {
    id: r.id, name: r.name, phone: r.phone, email: r.email, city: r.city, service: r.service, message: r.message,
    source: r.source as EnquirySource, status: r.status as EnquiryStatus, createdAt: r.createdAt.toISOString(),
    origin: r.origin as Enquiry['origin'], address: r.address, state: r.state, pincode: r.pincode,
    propertyType: (r.propertyType ?? undefined) as Enquiry['propertyType'], capacityKw: r.capacityKw, monthlyBill: r.monthlyBill,
    notes: r.notes, followUpOn: r.followUpOn, estimate: r.estimate ?? null, updatedAt: r.updatedAt.toISOString(),
    ...(r.submissionId ? { submissionId: r.submissionId } : {}),
    ...(r.enquiryType ? { enquiryType: r.enquiryType as Enquiry['enquiryType'] } : {}),
    capacityChoice: (r.capacityChoice as Enquiry['capacityChoice']) ?? null,
    assignedTo: r.assignedTo, assignedToName, lastContactedAt: r.lastContactedAt?.toISOString() ?? null, contactCount: r.contactCount,
  }
}

const toActivity = (r: typeof enquiryActivities.$inferSelect): EnquiryActivity => ({
  id: r.id, enquiryId: r.enquiryId, type: r.type as EnquiryActivityType, outcome: (r.outcome as ContactOutcome) ?? null,
  fromStatus: (r.fromStatus as EnquiryStatus) ?? null, toStatus: (r.toStatus as EnquiryStatus) ?? null, note: r.note,
  actorId: r.actorId, actorName: r.actorName || 'Website', createdAt: r.createdAt.toISOString(),
})

/** Columns written from a validated, normalized enquiry. */
function columnsOf(e: Enquiry): Omit<typeof enquiries.$inferInsert, 'id'> {
  return {
    submissionId: e.submissionId ?? null, name: e.name, phone: e.phone, email: e.email, city: e.city, address: e.address ?? '',
    state: e.state ?? '', pincode: e.pincode ?? '', service: e.service, message: e.message, source: e.source,
    origin: e.origin ?? originOf(e.source), status: e.status, enquiryType: e.enquiryType ?? null, propertyType: e.propertyType ?? null,
    capacityKw: e.capacityKw ?? null, capacityChoice: e.capacityKw != null ? null : (e.capacityChoice ?? null), monthlyBill: e.monthlyBill == null ? null : Math.round(e.monthlyBill), notes: e.notes ?? '',
    estimate: e.estimate ?? null, followUpOn: e.followUpOn ?? null,
  }
}

export async function addActivity(
  t: DbOrTx, enquiryId: string, actor: Actor,
  a: { type: EnquiryActivityType; note?: string; outcome?: string | null; fromStatus?: string | null; toStatus?: string | null; meta?: Record<string, unknown> },
) {
  await t.insert(enquiryActivities).values({
    id: newId('act'), enquiryId, type: a.type, note: (a.note ?? '').slice(0, 4000), outcome: a.outcome ?? null,
    fromStatus: a.fromStatus ?? null, toStatus: a.toStatus ?? null, meta: a.meta ?? null, actorId: actor?.id ?? null, actorName: actor?.name ?? '',
  })
}

async function lockEnquiry(t: Tx, id: string): Promise<Row> {
  const [row] = await t.select().from(enquiries).where(and(eq(enquiries.id, id), isNull(enquiries.deletedAt))).for('update').limit(1)
  if (!row) throw notFound('Enquiry')
  return row
}

/**
 * Keeps the single pending follow-up in step with `dueOn` (null = none) and mirrors it on the
 * enquiry. Rescheduling closes the old one as cancelled, so the history shows both dates.
 */
async function syncFollowUp(t: Tx, enquiryId: string, dueOn: string | null, actor: Actor, note = '', assignedTo?: string | null) {
  const [pending] = await t.select().from(followUps).where(and(eq(followUps.enquiryId, enquiryId), eq(followUps.status, 'pending'))).for('update').limit(1)
  if (pending && pending.dueOn === dueOn && !note) return
  if (pending) {
    await t.update(followUps).set({ status: 'cancelled', completedAt: new Date(), completedBy: actor?.id ?? null, updatedAt: new Date() }).where(eq(followUps.id, pending.id))
    if (!dueOn) await addActivity(t, enquiryId, actor, { type: 'follow-up-cancelled', note: note || `Follow-up on ${pending.dueOn} cancelled.` })
  }
  if (dueOn) {
    await t.insert(followUps).values({ id: newId('fu'), enquiryId, dueOn, note, assignedTo: assignedTo ?? null, createdBy: actor?.id ?? null })
    await addActivity(t, enquiryId, actor, {
      type: 'follow-up-scheduled', note: [pending ? `Rescheduled from ${pending.dueOn} to ${dueOn}.` : `Follow-up on ${dueOn}.`, note].filter(Boolean).join(' '),
      meta: { dueOn },
    })
  }
  await t.update(enquiries).set({ followUpOn: dueOn }).where(eq(enquiries.id, enquiryId))
}

/** Status change + its history row. Closing a lead cancels its pending follow-up. */
export async function changeStatus(t: Tx, row: Pick<Row, 'id' | 'status'>, to: EnquiryStatus, actor: Actor, note = '') {
  if (row.status === to) return false
  await t.update(enquiries).set({ status: to, updatedAt: new Date() }).where(eq(enquiries.id, row.id))
  await addActivity(t, row.id, actor, { type: 'status', fromStatus: row.status, toStatus: to, note })
  if (isClosedStatus(to)) await syncFollowUp(t, row.id, null, actor, `Lead marked ${ENQUIRY_STATUS_LABEL[to]} — pending follow-up closed.`)
  return true
}

/** Used by proposals/quotations: move the lead forward automatically (never backwards, never out of a closed status). */
export async function advanceStatus(t: Tx, enquiryId: string, to: EnquiryStatus, allowedFrom: EnquiryStatus[], actor: Actor, note: string) {
  const [row] = await t.select({ id: enquiries.id, status: enquiries.status }).from(enquiries).where(and(eq(enquiries.id, enquiryId), isNull(enquiries.deletedAt))).limit(1)
  if (row && allowedFrom.includes(row.status as EnquiryStatus)) await changeStatus(t, row, to, actor, note)
}

function createdAtFrom(raw: string | undefined): Date {
  // Website forms send the submit time so admin, Sheet and email show the same time; accept it only if plausible.
  const t = raw ? Date.parse(raw) : NaN
  return Number.isFinite(t) && Math.abs(Date.now() - t) < 24 * 3600_000 ? new Date(t) : new Date()
}

const SORT_COLUMNS = {
  createdAt: enquiries.createdAt, updatedAt: enquiries.updatedAt, name: sql`lower(${enquiries.name})`,
  status: sql`array_position(array[${sql.raw(ENQUIRY_STATUS_VALUES.map((s) => `'${s}'`).join(','))}]::text[], ${enquiries.status}::text)`,
  followUpOn: enquiries.followUpOn, capacityKw: sql`coalesce(${enquiries.capacityKw}, (${enquiries.estimate}->>'capacityKw')::numeric)`,
  lastContactedAt: enquiries.lastContactedAt,
} as const

function listWhere(q: ListEnquiriesQuery, user: AuthUser | null): SQL | undefined {
  const where: Array<SQL | undefined> = [isNull(enquiries.deletedAt)]
  if (q.status) {
    const parts = q.status.split(',').map((s) => s.trim()).filter(Boolean)
    const list = parts.flatMap((s) => (s === 'open' ? ENQUIRY_STATUS_VALUES.filter((v) => !CLOSED_STATUSES.includes(v)) : s === 'closed-all' ? CLOSED_STATUSES : [s]))
    const valid = list.filter((s) => (ENQUIRY_STATUS_VALUES as string[]).includes(s))
    if (!valid.length) throw invalid({ status: 'Choose a valid status.' })
    where.push(inArray(enquiries.status, valid))
  }
  if (q.source) {
    if (['website', 'admin', 'import'].includes(q.source)) where.push(eq(enquiries.origin, q.source))
    else if (ENQUIRY_SOURCES.some((s) => s.value === q.source)) where.push(eq(enquiries.source, q.source))
    else throw invalid({ source: 'Choose a valid source.' })
  }
  if (q.assignedTo === 'unassigned') where.push(isNull(enquiries.assignedTo))
  else if (q.assignedTo === 'me') where.push(eq(enquiries.assignedTo, user?.id ?? '-'))
  else if (q.assignedTo) where.push(eq(enquiries.assignedTo, q.assignedTo))
  const today = todayIST()
  if (q.followUp) {
    where.push(isNotNull(enquiries.followUpOn))
    if (q.followUp !== 'any') where.push(sql`${enquiries.status} not in ('converted','not-interested','closed')`)
    if (q.followUp === 'due') where.push(lte(enquiries.followUpOn, today))
    if (q.followUp === 'overdue') where.push(lt(enquiries.followUpOn, today))
    if (q.followUp === 'today') where.push(eq(enquiries.followUpOn, today))
    if (q.followUp === 'upcoming') where.push(sql`${enquiries.followUpOn} > ${today}`)
  }
  if (q.enquiryType) {
    // Older records have no enquiry type: fall back to the property type, like the website does.
    where.push(q.enquiryType === 'home'
      ? or(eq(enquiries.enquiryType, 'home'), and(isNull(enquiries.enquiryType), inArray(enquiries.propertyType, ['residential', 'housing-society'])))
      : or(eq(enquiries.enquiryType, 'commercial'), and(isNull(enquiries.enquiryType), inArray(enquiries.propertyType, ['commercial', 'industrial']))))
  }
  // Date range on the day received, India time.
  if (q.from) where.push(gte(enquiries.createdAt, new Date(`${q.from}T00:00:00+05:30`)))
  if (q.to) where.push(lt(enquiries.createdAt, new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86400_000)))
  for (const term of searchTerms(q.search)) {
    // Same expression as the trigram index enquiries_search_trgm.
    where.push(sql`lower(${enquiries.name} || ' ' || ${enquiries.phone} || ' ' || ${enquiries.email} || ' ' || ${enquiries.city} || ' ' || ${enquiries.address} || ' ' || ${enquiries.service} || ' ' || ${enquiries.message} || ' ' || ${enquiries.notes}) like ${term}`)
  }
  return and(...where)
}

async function assertAssignable(t: DbOrTx, userId: string) {
  const [u] = await t.select({ id: users.id, active: users.isActive }).from(users).where(eq(users.id, userId)).limit(1)
  if (!u || !u.active) throw invalid({ assignedTo: 'Choose an active staff member.' })
}

export const enquiriesService = {
  async list(q: ListEnquiriesQuery, user: AuthUser | null) {
    const where = listWhere(q, user)
    const sortCol = SORT_COLUMNS[q.sort]
    const dir = q.order === 'asc' ? asc : desc
    const [rows, [{ count }]] = await Promise.all([
      db.select({ e: enquiries, assignedName: assignee }).from(enquiries).where(where)
        .orderBy(sql`${dir(sortCol as never)} nulls last`, desc(enquiries.createdAt), asc(enquiries.id))
        .limit(q.limit).offset((q.page - 1) * q.limit),
      db.select({ count: sql<number>`count(*)::int` }).from(enquiries).where(where),
    ])
    return paginated(rows.map((r) => toEnquiry(r.e, r.assignedName)), count, q)
  },

  /** Every active enquiry (customer picker, duplicate check, "create from enquiry"). */
  async all(): Promise<Enquiry[]> {
    const rows = await db.select({ e: enquiries, assignedName: assignee }).from(enquiries).where(isNull(enquiries.deletedAt)).orderBy(desc(enquiries.createdAt))
    return rows.map((r) => toEnquiry(r.e, r.assignedName))
  },

  async byIds(ids?: string[]): Promise<Enquiry[]> {
    if (ids && !ids.length) return []
    const where = ids ? and(isNull(enquiries.deletedAt), inArray(enquiries.id, ids)) : isNull(enquiries.deletedAt)
    const rows = await db.select({ e: enquiries, assignedName: assignee }).from(enquiries).where(where).orderBy(desc(enquiries.createdAt))
    return rows.map((r) => toEnquiry(r.e, r.assignedName))
  },

  async get(id: string, t: DbOrTx = db): Promise<EnquiryDetail> {
    const [row] = await t.select({ e: enquiries, assignedName: assignee }).from(enquiries).where(and(eq(enquiries.id, id), isNull(enquiries.deletedAt))).limit(1)
    if (!row) throw notFound('Enquiry')
    const [acts, fus] = await Promise.all([
      t.select().from(enquiryActivities).where(eq(enquiryActivities.enquiryId, id)).orderBy(desc(enquiryActivities.createdAt), desc(enquiryActivities.id)),
      t.select({ f: followUps, name: sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${followUps.assignedTo})` })
        .from(followUps).where(eq(followUps.enquiryId, id)).orderBy(desc(followUps.dueOn), desc(followUps.createdAt)),
    ])
    const followUpList: FollowUp[] = fus.map(({ f, name }) => ({
      id: f.id, enquiryId: f.enquiryId, dueOn: f.dueOn, note: f.note, status: f.status as FollowUp['status'], assignedTo: f.assignedTo,
      assignedToName: name, completedAt: f.completedAt?.toISOString() ?? null, createdAt: f.createdAt.toISOString(),
    }))
    return { enquiry: toEnquiry(row.e, row.assignedName), activities: acts.map(toActivity), followUps: followUpList }
  },

  // ─── Website ──────────────────────────────────────────────────────────────
  /** Contact / service / pricing forms. Idempotent per submissionId (double clicks, retries). */
  async submitPublic(input: PublicEnquiryBody, extra: { estimate?: Enquiry['estimate'] } = {}): Promise<Enquiry> {
    // The only required condition: a valid mobile OR a valid email. Everything else is optional.
    const e: Record<string, string> = validateContactMethod(input.phone, input.email)
    const phone = normalizeMobile(input.phone)
    if (input.capacityKw != null && !(input.capacityKw > 0)) e.capacityKw = 'Choose a valid capacity.'
    assertValid(e, e.phone === CONTACT_REQUIRED_MESSAGE ? CONTACT_REQUIRED_MESSAGE : 'Some fields need attention.')
    const submissionId = input.submissionId || undefined
    if (submissionId) {
      const [existing] = await db.select().from(enquiries).where(eq(enquiries.submissionId, submissionId)).limit(1)
      if (existing) return toEnquiry(existing)
    }
    const propertyType = input.propertyType ?? (input.enquiryType === 'commercial' ? 'commercial' : input.enquiryType === 'home' ? 'residential' : undefined)
    const enquiry = normalizeEnquiry({
      id: newId('enq'), name: input.name, phone, email: input.email, city: input.city, state: input.state, service: input.service,
      message: input.message, source: input.source as EnquirySource, status: 'new', origin: 'website', propertyType,
      capacityKw: input.capacityKw ?? null, capacityChoice: input.capacityChoice ?? null, monthlyBill: input.monthlyBill ?? null, estimate: extra.estimate ?? null,
      submissionId, enquiryType: input.enquiryType, createdAt: createdAtFrom(input.createdAt).toISOString(),
    })
    return tx(async (t) => {
      const created = createdAtFrom(input.createdAt)
      const inserted = await t.insert(enquiries).values({ id: enquiry.id, ...columnsOf(enquiry), createdAt: created, updatedAt: new Date() })
        .onConflictDoNothing({ target: enquiries.submissionId }).returning()
      if (!inserted.length) {
        // Another request with the same submissionId won the race.
        const [existing] = await t.select().from(enquiries).where(eq(enquiries.submissionId, submissionId!)).limit(1)
        return toEnquiry(existing)
      }
      await addActivity(t, enquiry.id, null, { type: 'created', note: `Received from the website (${ENQUIRY_SOURCES.find((s) => s.value === enquiry.source)?.label ?? enquiry.source}).`, toStatus: 'new' })
      return toEnquiry(inserted[0])
    })
  },

  /** Calculator "Request this quote": priced again on the server with the same rules the visitor saw. */
  async submitQuoteRequest(input: QuoteRequestBody): Promise<Enquiry> {
    const e: Record<string, string> = {}
    if (input.customerName.trim().length < 2) e.customerName = 'Enter your name.'
    if (!normalizeMobile(input.phone)) e.phone = 'Enter a 10-digit Indian mobile number.'
    if (!(input.capacityKw > 0)) e.capacityKw = 'Choose a system size.'
    assertValid(e, 'Some fields need attention.')
    const content = await loadContent()
    const calc = content.calculator
    const [companyRow] = input.companyId ? await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1) : []
    const company = companyRow ? companyFromRow(companyRow) : undefined
    const quality = input.quality ?? 'normal'
    const priced = company ? packagePrice(company, input.capacityKw, quality) : null
    const estimatedCost = priced?.price ?? Math.round(systemCost(input.capacityKw, input.systemType, input.roofType ?? 'rcc', calc))
    const sub = computeSubsidy({ capacityKw: input.capacityKw, propertyType: input.propertyType, systemType: input.systemType, stateCode: input.stateCode, systemCost: estimatedCost }, calc)
    const stateCode = input.stateCode ?? calc.subsidy.defaultStateCode ?? '22'
    const monthlyBill = Math.max(0, Math.round(input.monthlyBill || 0))
    return enquiriesService.submitPublic({
      name: input.customerName, phone: input.phone, email: input.email, city: input.city, state: stateName(stateCode),
      service: `${input.capacityKw} kW ${input.systemType} solar (calculator quote request)`,
      message: `Calculator estimate: ${input.capacityKw} kW ${input.systemType}, ${input.propertyType}${company ? `, ${company.name} ${quality}` : ''}, monthly bill ₹${monthlyBill}. Estimated ₹${estimatedCost} before subsidy, ₹${Math.max(0, estimatedCost - sub.total)} after.`,
      source: 'calculator', submissionId: input.submissionId, createdAt: input.createdAt, propertyType: input.propertyType,
      capacityKw: input.capacityKw, monthlyBill,
    }, {
      estimate: {
        capacityKw: input.capacityKw, systemType: input.systemType, propertyType: input.propertyType, roofType: input.roofType, monthlyBill,
        monthlyUnits: input.monthlyUnits, estimatedCost, subsidy: sub.total, netCost: Math.max(0, estimatedCost - sub.total),
        companyId: company?.id ?? null, quality, stateCode, discomId: input.discomId, tariffVerified: input.tariffVerified,
      },
    })
  },

  // ─── Admin ────────────────────────────────────────────────────────────────
  /** Create or edit. Status, follow-up and assignment changes are logged as separate history rows. */
  async save(input: EnquirySaveBody, user: AuthUser, opts: { createProposal?: boolean } = {}): Promise<{ enquiry: Enquiry; proposal: Proposal | null }> {
    const errors = validateEnquiry(input as Partial<Enquiry>)
    assertValid(errors)
    const canAssign = user.permissions.includes('leads:assign')
    return tx(async (t) => {
      const existing = input.id ? (await t.select().from(enquiries).where(eq(enquiries.id, input.id)).for('update').limit(1))[0] : undefined
      if (existing?.deletedAt) throw notFound('Enquiry')
      const id = existing?.id ?? input.id ?? newId('enq')
      const prev = existing ? toEnquiry(existing) : undefined
      const next = normalizeEnquiry({
        ...(prev ?? {}),
        ...input,
        propertyType: input.propertyType ?? undefined,
        enquiryType: input.enquiryType ?? undefined,
        capacityChoice: input.capacityChoice ?? null,
        id,
        // Website / import records keep where they came from.
        source: prev && prev.origin !== 'admin' ? prev.source : (input.source as EnquirySource),
        origin: prev?.origin ?? originOf(input.source as EnquirySource),
        submissionId: prev?.submissionId,
        estimate: prev ? prev.estimate : (input.estimate ?? null),
        createdAt: prev?.createdAt ?? input.createdAt ?? new Date().toISOString(),
      })
      const actor = { id: user.id, name: user.name }
      const cols = columnsOf(next)
      // Status / follow-up / assignment go through their own helpers (history rows).
      const { status: _s, followUpOn: _f, ...plain } = cols
      if (!existing) {
        await t.insert(enquiries).values({ id, ...plain, status: 'new', createdAt: new Date(next.createdAt), updatedAt: new Date() })
        await addActivity(t, id, actor, { type: 'created', note: `Added by ${user.name} (${ENQUIRY_SOURCES.find((s) => s.value === next.source)?.label ?? next.source}).`, toStatus: 'new' })
      } else {
        const changed = (Object.keys(plain) as Array<keyof typeof plain>).filter((k) => k !== 'estimate' && k !== 'submissionId' && JSON.stringify(plain[k] ?? null) !== JSON.stringify((existing as Record<string, unknown>)[k] ?? null))
        await t.update(enquiries).set({ ...plain, updatedAt: new Date() }).where(eq(enquiries.id, id))
        if (changed.length) await addActivity(t, id, actor, { type: 'updated', note: `Changed: ${changed.join(', ')}.`, meta: { fields: changed } })
      }
      if (next.status !== 'new' || existing) await changeStatus(t, { id, status: existing?.status ?? 'new' }, next.status, actor)
      if (!isClosedStatus(next.status) || !next.followUpOn) await syncFollowUp(t, id, next.followUpOn ?? null, actor)
      if (input.assignedTo !== undefined && canAssign && (input.assignedTo ?? null) !== (existing?.assignedTo ?? null)) {
        await enquiriesService.assignTx(t, id, input.assignedTo ?? null, actor)
      }
      let proposal: Proposal | null = null
      if (opts.createProposal) {
        if (!user.permissions.includes('quotations:write')) throw new AppError('forbidden', 'You do not have permission to create proposals.')
        proposal = await proposalsService.createFromEnquiryTx(t, id, actor)
      }
      const [saved] = await t.select({ e: enquiries, assignedName: assignee }).from(enquiries).where(eq(enquiries.id, id)).limit(1)
      return { enquiry: toEnquiry(saved.e, saved.assignedName), proposal }
    })
  },

  async setStatus(id: string, body: { status: EnquiryStatus; note: string; followUpOn?: string | null }, user: AuthUser) {
    return tx(async (t) => {
      const row = await lockEnquiry(t, id)
      const actor = { id: user.id, name: user.name }
      if (body.status === 'follow-up') {
        const due = body.followUpOn ?? row.followUpOn
        if (!due) throw invalid({ followUpOn: 'Pick the follow-up date.' })
        if (body.followUpOn) await syncFollowUp(t, id, body.followUpOn, actor)
      }
      const changed = await changeStatus(t, row, body.status, actor, body.note)
      if (!changed && body.note) await addActivity(t, id, actor, { type: 'note', note: body.note })
      return enquiriesService.getTx(t, id)
    })
  },

  async assignTx(t: Tx, id: string, userId: string | null, actor: Actor, note = '') {
    if (userId) await assertAssignable(t, userId)
    const [target] = userId ? await t.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1) : [null]
    await t.update(enquiries).set({ assignedTo: userId, updatedAt: new Date() }).where(eq(enquiries.id, id))
    await addActivity(t, id, actor, { type: 'assigned', note: [userId ? `Assigned to ${target?.name}.` : 'Unassigned.', note].filter(Boolean).join(' '), meta: { userId } })
    // The pending follow-up goes to the same person.
    await t.update(followUps).set({ assignedTo: userId, updatedAt: new Date() }).where(and(eq(followUps.enquiryId, id), eq(followUps.status, 'pending')))
  },

  async assign(id: string, userId: string | null, note: string, user: AuthUser) {
    return tx(async (t) => {
      const row = await lockEnquiry(t, id)
      if ((row.assignedTo ?? null) !== userId) await enquiriesService.assignTx(t, id, userId, { id: user.id, name: user.name }, note)
      return enquiriesService.getTx(t, id)
    })
  },

  /** Call / WhatsApp / email / meeting / note — optionally with a status change and the next follow-up in the same step. */
  async logActivity(id: string, body: { type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'note'; outcome?: string | null; note: string; status?: EnquiryStatus; followUpOn?: string | null }, user: AuthUser) {
    return tx(async (t) => {
      const row = await lockEnquiry(t, id)
      const actor = { id: user.id, name: user.name }
      if (body.type !== 'note') {
        await t.update(enquiries).set({ lastContactedAt: new Date(), contactCount: sql`${enquiries.contactCount} + 1`, updatedAt: new Date() }).where(eq(enquiries.id, id))
      }
      await addActivity(t, id, actor, { type: body.type, outcome: body.type === 'note' ? null : (body.outcome ?? null), note: body.note })
      if (body.followUpOn !== undefined && body.followUpOn !== row.followUpOn) await syncFollowUp(t, id, body.followUpOn ?? null, actor)
      if (body.status) {
        if (body.status === 'follow-up' && !(body.followUpOn ?? row.followUpOn)) throw invalid({ followUpOn: 'Pick the follow-up date.' })
        await changeStatus(t, row, body.status, actor, `After ${ACTIVITY_LABEL[body.type].toLowerCase()}.`)
      }
      return enquiriesService.getTx(t, id)
    })
  },

  async scheduleFollowUp(id: string, body: { dueOn: string; note: string; assignedTo?: string | null }, user: AuthUser) {
    return tx(async (t) => {
      const row = await lockEnquiry(t, id)
      if (isClosedStatus(row.status as EnquiryStatus)) throw invalid({ dueOn: `This lead is ${ENQUIRY_STATUS_LABEL[row.status as EnquiryStatus]}. Reopen it (change the status) before scheduling a follow-up.` })
      if (body.assignedTo) await assertAssignable(t, body.assignedTo)
      await syncFollowUp(t, id, body.dueOn, { id: user.id, name: user.name }, body.note, body.assignedTo ?? row.assignedTo)
      await t.update(enquiries).set({ updatedAt: new Date() }).where(eq(enquiries.id, id))
      return enquiriesService.getTx(t, id)
    })
  },

  async completeFollowUp(id: string, followUpId: string, body: { status: 'done' | 'cancelled'; note: string }, user: AuthUser) {
    return tx(async (t) => {
      await lockEnquiry(t, id)
      const [fu] = await t.select().from(followUps).where(and(eq(followUps.id, followUpId), eq(followUps.enquiryId, id))).for('update').limit(1)
      if (!fu) throw notFound('Follow-up')
      if (fu.status !== 'pending') throw new AppError('conflict', 'This follow-up is already closed.')
      await t.update(followUps).set({ status: body.status, completedAt: new Date(), completedBy: user.id, updatedAt: new Date(), note: body.note ? `${fu.note}${fu.note ? '\n' : ''}${body.note}` : fu.note }).where(eq(followUps.id, fu.id))
      await t.update(enquiries).set({ followUpOn: null, updatedAt: new Date() }).where(eq(enquiries.id, id))
      await addActivity(t, id, { id: user.id, name: user.name }, { type: body.status === 'done' ? 'follow-up-done' : 'follow-up-cancelled', note: [`Follow-up of ${fu.dueOn}.`, body.note].filter(Boolean).join(' ') })
      return enquiriesService.getTx(t, id)
    })
  },

  /** Detail read inside a transaction (sees its own uncommitted writes). */
  getTx: (t: DbOrTx, id: string): Promise<EnquiryDetail> => enquiriesService.get(id, t),

  /** Soft delete: the lead disappears from lists but its record and history stay in the database. */
  async remove(id: string, user: AuthUser) {
    await tx(async (t) => {
      const row = await lockEnquiry(t, id)
      await t.update(enquiries).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(enquiries.id, row.id))
      await t.update(followUps).set({ status: 'cancelled', updatedAt: new Date(), completedAt: new Date(), completedBy: user.id }).where(and(eq(followUps.enquiryId, id), eq(followUps.status, 'pending')))
      await addActivity(t, id, { id: user.id, name: user.name }, { type: 'updated', note: `Deleted by ${user.name}.`, meta: { deleted: true } })
    })
  },

  /** Excel / CSV import. Every row is validated; valid rows are saved together in one transaction. */
  async importRows(rows: Array<Record<string, unknown>>, user: AuthUser): Promise<EnquiryImportResult> {
    const failed: EnquiryImportResult['failed'] = []
    const valid: Enquiry[] = []
    rows.forEach((r, i) => {
      const candidate = { source: 'import', status: 'new', email: '', city: '', message: '', ...r } as Partial<Enquiry>
      const errs = validateEnquiry(candidate)
      if (hasErrors(errs)) return void failed.push({ row: i + 1, errors: Object.values(errs) })
      const created = typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt)) ? new Date(r.createdAt).toISOString() : new Date().toISOString()
      valid.push(normalizeEnquiry({ ...candidate, id: newId('enq'), origin: 'import', submissionId: undefined, assignedTo: undefined, createdAt: created }))
    })
    if (valid.length) {
      await tx(async (t) => {
        const actor = { id: user.id, name: user.name }
        for (const e of valid) {
          await t.insert(enquiries).values({ id: e.id, ...columnsOf(e), followUpOn: null, createdAt: new Date(e.createdAt), updatedAt: new Date() })
          await addActivity(t, e.id, actor, { type: 'imported', note: `Imported by ${user.name}.`, toStatus: e.status })
          if (e.followUpOn && !isClosedStatus(e.status)) await syncFollowUp(t, e.id, e.followUpOn, actor)
        }
      })
    }
    return { imported: valid.length, failed, ids: valid.map((v) => v.id) }
  },

  /** Owner / admin dashboard figures. */
  async stats(): Promise<LeadStats> {
    const today = todayIST()
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`)
    const alive = isNull(enquiries.deletedAt)
    const [byStatusRows, [counts], bySourceRows, trendRows] = await Promise.all([
      db.select({ status: enquiries.status, count: sql<number>`count(*)::int` }).from(enquiries).where(alive).groupBy(enquiries.status),
      db.select({
        total: sql<number>`count(*)::int`,
        thisMonth: sql<number>`count(*) filter (where ${enquiries.createdAt} >= ${monthStart})::int`,
        due: sql<number>`count(*) filter (where ${enquiries.followUpOn} <= ${today} and ${enquiries.status} not in ('converted','not-interested','closed'))::int`,
        overdue: sql<number>`count(*) filter (where ${enquiries.followUpOn} < ${today} and ${enquiries.status} not in ('converted','not-interested','closed'))::int`,
      }).from(enquiries).where(alive),
      db.select({ source: enquiries.source, count: sql<number>`count(*)::int` }).from(enquiries).where(alive).groupBy(enquiries.source).orderBy(desc(sql`count(*)`)),
      db.select({
        month: sql<string>`to_char(date_trunc('month', ${enquiries.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM')`,
        total: sql<number>`count(*)::int`,
        converted: sql<number>`count(*) filter (where ${enquiries.status} = 'converted')::int`,
      }).from(enquiries).where(and(alive, gte(enquiries.createdAt, sql`date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months'`)))
        .groupBy(sql`1`).orderBy(sql`1`),
    ])
    const byStatus = Object.fromEntries(ENQUIRY_STATUS_VALUES.map((s) => [s, 0])) as Record<EnquiryStatus, number>
    for (const r of byStatusRows) byStatus[r.status as EnquiryStatus] = r.count
    const open = ENQUIRY_STATUS_VALUES.filter((s) => !isClosedStatus(s)).reduce((n, s) => n + byStatus[s], 0)
    const closedTotal = byStatus.converted + byStatus['not-interested']
    // Last 6 months, including months with no enquiries.
    const months: string[] = []
    const base = new Date(`${today.slice(0, 7)}-15T00:00:00Z`)
    for (let i = 5; i >= 0; i--) { const d = new Date(base); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)) }
    return {
      total: counts.total, byStatus, open, new: byStatus.new, pending: byStatus.pending, contacted: byStatus.contacted, converted: byStatus.converted,
      followUpsDue: counts.due, followUpsOverdue: counts.overdue, thisMonth: counts.thisMonth,
      conversionRate: closedTotal ? Math.round((byStatus.converted / closedTotal) * 1000) / 10 : 0,
      bySource: bySourceRows.map((r) => ({ source: r.source as EnquirySource, count: r.count })),
      trend: months.map((m) => { const r = trendRows.find((x) => x.month === m); return { month: m, total: r?.total ?? 0, converted: r?.converted ?? 0 } }),
    }
  },

  /** Recent lead activity across all enquiries (owner / admin dashboards). */
  async recentActivity(limit = 15) {
    const rows = await db.select({ a: enquiryActivities, name: enquiries.name }).from(enquiryActivities)
      .innerJoin(enquiries, eq(enquiries.id, enquiryActivities.enquiryId)).where(isNull(enquiries.deletedAt))
      .orderBy(desc(enquiryActivities.createdAt)).limit(limit)
    return rows.map((r) => ({ ...toActivity(r.a), enquiryName: r.name }))
  },

  /** Staff who can be assigned leads (active admins and sales). */
  async assignableUsers() {
    const rows = await db.execute<{ id: string; name: string; role: string }>(sql`select u.id, u.name, r.key as role from users u join roles r on r.id = u.role_id where u.is_active and r.key in ('admin','sales') order by u.name`)
    return rows.rows
  },
}
