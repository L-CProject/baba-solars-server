import type { FieldErrors, Offer, OfferImage, OfferSlab } from '@/types'
import { isValidImage } from './schemas'

/**
 * Website offers (Admin → Offers). Stored inside the site content (same record as every other
 * website text), so backup/restore, publishing and a future Firestore document need no extra code.
 * Pure functions only — safe to run in the browser, the prerender and a Cloud Function.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Today in India (YYYY-MM-DD) — offer dates are India dates. */
export const todayIST = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/**
 * A poster shipped in /public/images/offers. Each one has WebP copies at a few widths (160 for thumbnails)
 * (`<name>-<width>w.webp`) plus a full-quality JPG (`<name>.jpg`) for download/share.
 */
function shippedPoster(id: string, name: string, alt: string, width: number, height: number, slabId = ''): OfferImage {
  const widths = [160, 320, 480, 640, 800, width]
  return {
    id,
    url: `/images/offers/${name}-${width}w.webp`,
    alt,
    width,
    height,
    variants: widths.map((w) => ({ width: w, url: `/images/offers/${name}-${w}w.webp` })),
    ...(slabId ? { slabId } : {}),
  }
}

/** The five Diwali 2026 posters (all offers, 3 kW, 5 kW, 10 kW, lucky draw). */
export const DIWALI_IMAGES: OfferImage[] = [
  shippedPoster('img-diwali-all', 'diwali-2026-all-offers', 'Diwali Dhamaka Offer: free gifts on 3 kW, 5 kW and 10 kW solar systems and a lucky draw for a Mahindra BE 6', 1200, 1488),
  shippedPoster('img-diwali-3kw', 'diwali-2026-3kw', '3 kW solar system: choose a free 32-inch Smart TV with speaker, or an RO with induction cooktop', 1032, 1280, 'slab-3kw'),
  shippedPoster('img-diwali-5kw', 'diwali-2026-5kw', '5 kW solar system: choose a free electric scooty, or a washing machine with refrigerator', 1032, 1280, 'slab-5kw'),
  shippedPoster('img-diwali-10kw', 'diwali-2026-10kw', '10 kW solar system: get an iPhone free', 1200, 1488, 'slab-10kw'),
  shippedPoster('img-diwali-draw', 'diwali-2026-lucky-draw', 'Grand lucky draw: book your solar system for ₹2,000 and win a Mahindra BE 6', 1032, 1280),
]

/**
 * Default offer shipped with the site — taken from the official Diwali 2026 posters
 * (valid 1–25 November 2026). Admins can edit, disable or delete it.
 */
export const DIWALI_OFFER: Offer = {
  id: 'offer-diwali-2026',
  enabled: true,
  badge: 'Diwali Dhamaka Offer',
  title: 'Is Diwali, solar lagao — gifts ghar le jao! 🎁',
  description: 'Celebrate this Diwali with Baba Solars and get exciting free gifts with your solar installation.',
  slabs: [
    { id: 'slab-3kw', capacity: '3 kW', gifts: '32-inch Smart TV + Speaker OR RO + Induction Cooktop' },
    { id: 'slab-5kw', capacity: '5 kW', gifts: 'Electric Scooty OR Washing Machine + Refrigerator' },
    { id: 'slab-10kw', capacity: '10 kW', gifts: 'iPhone free' },
  ],
  bookingAmount: 2000,
  luckyDrawText: 'Every booking gets a lucky draw coupon — one lucky winner takes home the Mahindra BE 6!',
  ctaLabel: 'Book now',
  images: DIWALI_IMAGES,
  validFrom: '2026-11-01',
  validUntil: '2026-11-25',
  terms: 'T&C apply. Offer and gifts subject to applicable terms and conditions.',
}

export const DEFAULT_OFFERS: Offer[] = [DIWALI_OFFER]

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const date = (v: unknown) => (ISO_DATE.test(String(v ?? '').trim()) ? String(v).trim() : '')
const posInt = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : undefined)

function normalizeImage(img: Partial<OfferImage> | null | undefined, i: number): OfferImage | null {
  const url = str(img?.url, 3_000_000)
  if (!url) return null
  const variants = (Array.isArray(img?.variants) ? img!.variants : [])
    .map((v) => ({ width: posInt(v?.width) ?? 0, url: str(v?.url, 2000) }))
    .filter((v) => v.width > 0 && v.url)
    .sort((a, b) => a.width - b.width)
  const width = posInt(img?.width)
  const height = posInt(img?.height)
  const slabId = str(img?.slabId, 80)
  return {
    id: str(img?.id, 80) || `img-${i + 1}`,
    url,
    alt: str(img?.alt, 300),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(variants.length ? { variants } : {}),
    ...(slabId ? { slabId } : {}),
  }
}

/** Clean an offer coming from storage, a backup file or the admin form (never throws). */
export function normalizeOffer(o: Partial<Offer> & { id?: string }, i = 0): Offer {
  const amount = o.bookingAmount
  const id = str(o.id, 80) || `offer-${i + 1}`
  // Offers saved before posters existed have no `images` key: the shipped Diwali offer gets its posters back.
  const rawImages = Array.isArray(o.images) ? o.images : id === DIWALI_OFFER.id && o.images === undefined ? DIWALI_IMAGES : []
  return {
    id,
    enabled: o.enabled !== false,
    badge: str(o.badge, 80),
    title: str(o.title, 160),
    description: str(o.description, 600),
    slabs: (Array.isArray(o.slabs) ? o.slabs : [])
      .map((s: Partial<OfferSlab>, j) => ({ id: str(s?.id, 80) || `slab-${j + 1}`, capacity: str(s?.capacity, 40), gifts: str(s?.gifts, 200) }))
      .filter((s) => s.capacity || s.gifts)
      .slice(0, 12),
    bookingAmount: amount == null || (amount as unknown) === '' || !Number.isFinite(Number(amount)) ? null : Math.max(0, Math.round(Number(amount))),
    luckyDrawText: str(o.luckyDrawText, 300),
    ctaLabel: str(o.ctaLabel, 40),
    images: rawImages.map(normalizeImage).filter((x): x is OfferImage => !!x).slice(0, 12),
    validFrom: date(o.validFrom),
    validUntil: date(o.validUntil),
    terms: str(o.terms, 300),
    ...(o.updatedAt ? { updatedAt: o.updatedAt } : {}),
  }
}

/** Field errors for one offer, keyed like "title", "slabs.1.gifts" or "images.0.url". */
export function validateOffer(o: Offer): FieldErrors {
  const e: FieldErrors = {}
  if (!o.title.trim()) e.title = 'Enter the offer title.'
  else if (o.title.length > 160) e.title = 'Keep the title under 160 characters.'
  if (o.description.length > 600) e.description = 'Keep the description under 600 characters.'
  o.slabs.forEach((s, i) => {
    if (!s.capacity.trim()) e[`slabs.${i}.capacity`] = 'Enter the capacity, e.g. 3 kW.'
    if (!s.gifts.trim()) e[`slabs.${i}.gifts`] = 'Enter the gift(s) for this capacity.'
  })
  if (o.bookingAmount != null && !(Number.isFinite(o.bookingAmount) && o.bookingAmount >= 0 && o.bookingAmount <= 10_000_000))
    e.bookingAmount = 'Booking amount must be between ₹0 and ₹1,00,00,000.'
  if (o.validFrom && !ISO_DATE.test(o.validFrom)) e.validFrom = 'Use a valid date.'
  if (o.validUntil && !ISO_DATE.test(o.validUntil)) e.validUntil = 'Use a valid date.'
  if (o.validFrom && o.validUntil && o.validUntil < o.validFrom) e.validUntil = 'The end date must be on or after the start date.'
  const slabIds = new Set(o.slabs.map((s) => s.id))
  ;(o.images ?? []).forEach((img, i) => {
    if (!isValidImage(img.url, false)) e[`images.${i}.url`] = 'Upload an image, or use an https:// link or /images/… path.'
    if (!img.alt.trim()) e[`images.${i}.alt`] = 'Describe the image (shown to screen readers and search engines).'
    if (img.slabId && !slabIds.has(img.slabId)) e[`images.${i}.slabId`] = 'That kW slab no longer exists.'
  })
  return e
}

/** Errors for the whole list, keyed "offers.<index>.<field>". */
export function validateOffers(list: Offer[]): FieldErrors {
  const out: FieldErrors = {}
  const ids = new Set<string>()
  list.forEach((o, i) => {
    for (const [k, v] of Object.entries(validateOffer(o))) out[`offers.${i}.${k}`] = v
    if (ids.has(o.id)) out[`offers.${i}.id`] = 'Two offers have the same id.'
    ids.add(o.id)
  })
  return out
}

export type OfferStatus = 'live' | 'scheduled' | 'ended' | 'disabled'

export function offerStatus(o: Offer, today = todayIST()): OfferStatus {
  if (!o.enabled) return 'disabled'
  if (o.validFrom && today < o.validFrom) return 'scheduled'
  if (o.validUntil && today > o.validUntil) return 'ended'
  return 'live'
}

/** Offers to show on the website: enabled, titled and inside their dates. */
export const activeOffers = (list: Offer[] | undefined, today = todayIST()) =>
  (Array.isArray(list) ? list : []).filter((o) => o && o.title?.trim() && offerStatus(o, today) === 'live')

/** Whole days left including today (1 on the last day); null when the offer has no end date. */
export function daysLeft(o: Pick<Offer, 'validUntil'>, today = todayIST()): number | null {
  if (!o.validUntil) return null
  const ms = Date.parse(`${o.validUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)
  return Math.floor(ms / 86_400_000) + 1
}

const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const fmt = (iso: string) => DATE_FMT.format(new Date(`${iso}T00:00:00Z`))

/** "1 Nov – 25 Nov 2026", "Till 25 Nov 2026", "From 1 Nov 2026" or "". */
export function offerDateRange(o: Pick<Offer, 'validFrom' | 'validUntil'>): string {
  if (o.validFrom && o.validUntil) {
    const [a, b] = [fmt(o.validFrom), fmt(o.validUntil)]
    return o.validFrom.slice(0, 4) === o.validUntil.slice(0, 4) ? `${a.replace(/\s\d{4}$/, '')} – ${b}` : `${a} – ${b}`
  }
  if (o.validUntil) return `Till ${fmt(o.validUntil)}`
  if (o.validFrom) return `From ${fmt(o.validFrom)}`
  return ''
}

/** Smallest copy (thumbnails), else the image itself. */
export const offerThumb = (img: OfferImage) => img.variants?.[0]?.url ?? img.url

/** `srcset` for an offer image (undefined when it has no pre-sized copies). */
export const offerSrcSet = (img: OfferImage) =>
  img.variants?.length ? img.variants.map((v) => `${v.url} ${v.width}w`).join(', ') : undefined

/** Where the offer buttons go: the contact form, pre-filled with this offer. */
export const offerEnquiryHref = (o: Pick<Offer, 'id'>, kw = '') =>
  `/contact?offer=${encodeURIComponent(o.id)}${kw ? `&kw=${encodeURIComponent(kw)}` : ''}#enquiry`

/** Plain-text summary used for WhatsApp and the contact form message. */
export function offerSummary(o: Offer): string {
  return [o.badge || o.title, ...o.slabs.map((s) => `${s.capacity}: ${s.gifts}`)].filter(Boolean).join(' · ')
}
