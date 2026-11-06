import { and, asc, desc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { enquiries, users } from '../../db/schema'
import { todayIST } from '../../lib/time'
import { enquiriesService, toEnquiry } from '../enquiries/enquiries.service'

/** Read-only lead monitoring for the owner portal (no prices, settings or user management). */
export const ownerService = {
  async dashboard(limit: number) {
    const today = todayIST()
    const alive = isNull(enquiries.deletedAt)
    const open = sql`${enquiries.status} not in ('converted','not-interested','closed')`
    const [stats, activity, due, latest, team] = await Promise.all([
      enquiriesService.stats(),
      enquiriesService.recentActivity(limit),
      db.select().from(enquiries).where(and(alive, open, isNotNull(enquiries.followUpOn), lte(enquiries.followUpOn, today))).orderBy(asc(enquiries.followUpOn)).limit(limit),
      db.select().from(enquiries).where(alive).orderBy(desc(enquiries.createdAt)).limit(limit),
      // Lead load and results per staff member (plus unassigned).
      db.select({
        userId: enquiries.assignedTo,
        name: sql<string>`coalesce(${users.name}, 'Unassigned')`,
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${open})::int`,
        converted: sql<number>`count(*) filter (where ${enquiries.status} = 'converted')::int`,
        followUpsDue: sql<number>`count(*) filter (where ${open} and ${enquiries.followUpOn} <= ${today})::int`,
      }).from(enquiries).leftJoin(users, eq(users.id, enquiries.assignedTo))
        .where(alive).groupBy(enquiries.assignedTo, users.name).orderBy(desc(sql`count(*)`)),
    ])
    return { stats, recentActivity: activity, followUpsDue: due.map((r) => toEnquiry(r)), latestEnquiries: latest.map((r) => toEnquiry(r)), team, today }
  },
}
