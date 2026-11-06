import type { Offer } from '@/types'
import type { offers } from './offers.model'

type Row = typeof offers.$inferSelect

export const offerFromRow = (r: Row): Offer => ({
  id: r.id, enabled: r.enabled, badge: r.badge, title: r.title, description: r.description, slabs: r.slabs ?? [],
  bookingAmount: r.bookingAmount, luckyDrawText: r.luckyDrawText, ctaLabel: r.ctaLabel, images: r.images ?? [],
  validFrom: r.validFrom ?? '', validUntil: r.validUntil ?? '', terms: r.terms, updatedAt: r.updatedAt.toISOString(),
})

export const offerToRow = (o: Offer, sortOrder: number): typeof offers.$inferInsert => ({
  id: o.id, enabled: o.enabled, badge: o.badge, title: o.title, description: o.description, slabs: o.slabs, images: o.images,
  bookingAmount: o.bookingAmount, luckyDrawText: o.luckyDrawText, ctaLabel: o.ctaLabel,
  validFrom: o.validFrom || null, validUntil: o.validUntil || null, terms: o.terms, sortOrder, updatedAt: new Date(),
})
