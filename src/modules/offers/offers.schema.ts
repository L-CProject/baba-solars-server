import { z } from 'zod'

const image = z.object({
  id: z.string().max(64), url: z.string().max(3_000_000), alt: z.string().max(200).default(''),
  width: z.number().optional(), height: z.number().optional(),
  variants: z.array(z.object({ width: z.number(), url: z.string().max(2000) })).max(12).optional(),
  slabId: z.string().max(64).optional(),
})
export const offerBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  enabled: z.boolean().default(true),
  badge: z.string().max(60).default(''),
  title: z.string().trim().max(160),
  description: z.string().max(2000).default(''),
  slabs: z.array(z.object({ id: z.string().max(64), capacity: z.string().max(60), gifts: z.string().max(400) }).catchall(z.unknown())).max(20).default([]),
  bookingAmount: z.number().int().min(0).max(10_000_000).nullable().default(null),
  luckyDrawText: z.string().max(400).default(''),
  ctaLabel: z.string().max(60).default(''),
  images: z.array(image).max(20).default([]),
  validFrom: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
  validUntil: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
  terms: z.string().max(1000).default(''),
})
