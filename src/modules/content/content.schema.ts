import { z } from 'zod'
import { SITE_COLLECTIONS } from './content.model'

export const collectionParam = z.object({ key: z.enum(SITE_COLLECTIONS, { message: 'Unknown list.' }) })
export const itemParams = collectionParam.extend({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id.') })

/** A website list item. Fields differ per list, so the shared validateItem() rules check them in the service. */
export const itemBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  status: z.enum(['published', 'draft']).optional(),
  order: z.number().int().min(0).max(1_000_000).optional(),
}).catchall(z.unknown()).refine((o) => JSON.stringify(o).length < 4_000_000, 'This item is too large (use smaller images).')

export const reorderBody = z.object({ ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).max(1000) })

/** Partial site content (top-level sections). Detailed rules: validateContent / validateOffers / plans / calculator. */
export const contentPatch = z.record(z.string(), z.unknown())
  .refine((o) => !Object.hasOwn(o, '__proto__') && !Object.hasOwn(o, 'constructor') && !Object.hasOwn(o, 'prototype'), 'Invalid content.')
  .refine((o) => JSON.stringify(o).length < 8_000_000, 'Content is too large (use smaller images).')

const req = (label: string, max = 4000) => z.string({ message: `Enter ${label}.` }).trim().min(1, `Enter ${label}.`).max(max)
const opt = (max = 4000) => z.string().max(max).optional()
const image = z.string().max(3_000_000).refine((v) => !v || /^\/(?!\/)\S+$|^https?:\/\/\S+$|^data:image\//i.test(v.trim()), 'Use an uploaded image, a /images/… path or an https:// link.')
/**
 * Field rules per website list (pricing and capacity plans also go through the detailed shared
 * validators). Unknown extra fields are kept so newer website versions can add fields.
 */
export const collectionItemSchemas = {
  pricingPlans: z.object({ name: req('the plan name', 120) }).passthrough(),
  capacityPlans: z.object({ name: req('the plan name', 120) }).passthrough(),
  services: z.object({
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes for the URL.').max(120),
    title: req('a title', 160), group: z.enum(['installation', 'maintenance', 'support']), summary: req('a short summary', 400),
    description: opt(), includes: z.array(z.string().max(300)).max(30).optional(), startingPrice: opt(120),
  }).passthrough(),
  projects: z.object({
    title: req('a title', 160), location: opt(160), category: z.enum(['residential', 'commercial', 'industrial', 'maintenance']),
    capacityKw: z.number().finite().min(0).max(100000), imageUrl: image.optional(), summary: opt(),
  }).passthrough(),
  testimonials: z.object({ name: req('the customer name', 120), quote: req('the review', 2000), rating: z.number().int().min(1).max(5) }).passthrough(),
  faqs: z.object({ category: z.enum(['general', 'pricing', 'subsidy', 'maintenance']), question: req('the question', 400), answer: req('the answer', 4000) }).passthrough(),
  heroSlides: z.object({ title: req('a heading', 200), imageUrl: image, ctaLink: opt(500) }).passthrough(),
  gallery: z.object({ imageUrl: req('an image', 3_000_000).pipe(image), caption: opt(300), category: z.enum(['installation', 'residential', 'commercial', 'cleaning']) }).passthrough(),
} satisfies Record<(typeof SITE_COLLECTIONS)[number], z.ZodType>
