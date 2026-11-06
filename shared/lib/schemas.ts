/**
 * Validation + normalisation for every record the admin panel can write.
 * ─────────────────────────────────────────────────────────────────────────
 * Used in TWO places on purpose:
 *  1. Admin forms, to show inline errors before saving.
 *  2. The API layer (src/services/api.ts), which re-validates every write — exactly
 *     what a real backend must do, because browser-side checks can be bypassed.
 * A future backend can port these rules 1:1 (or share this file in a Node server).
 */
import type {
  CapacityPlan,
  CollectionKey,
  Database,
  FieldErrors,
  PlanCategory,
  PricingPlan,
  PublishStatus,
  SiteContent,
} from '@/types';
import { indianPhone, optionalEmail } from './validation';

const STATUSES: PublishStatus[] = ['published', 'draft'];
const PLAN_CATEGORIES: PlanCategory[] = [
  'residential',
  'commercial',
  'maintenance',
];
const SEGMENTS: CapacityPlan['segment'][] = [
  'residential',
  'commercial',
  'industrial',
];

export const LIMITS = {
  name: 80,
  shortText: 160,
  label: 40,
  badge: 32,
  features: 15,
  specs: 10,
  longText: 1200,
  maxPrice: 100_000_000,
} as const;

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Internal page ("/pricing#plans"), full http(s) URL, tel: / mailto: — empty allowed when optional. */
export function isValidLink(v: string, optional = true): boolean {
  const s = v.trim();
  if (!s) return optional;
  return (
    /^\/(?!\/)/.test(s) ||
    /^https?:\/\/[^\s]+$/i.test(s) ||
    /^(tel|mailto):/i.test(s)
  );
}

/** Image path in /public ("/images/x.jpg") or an https URL. */
export function isValidImage(v: string, optional = true): boolean {
  const s = v.trim();
  if (!s) return optional;
  return (
    /^\/(?!\/)\S+$/.test(s) || /^https?:\/\/\S+$/i.test(s) || isDataImage(s)
  );
}

/** Images uploaded in mock mode are stored as data URLs (see src/mocks/mockApi.ts → uploadImage). */
export const isDataImage = (s: string) =>
  /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(s);

function textRule(
  errors: FieldErrors,
  path: string,
  value: unknown,
  {
    required = false,
    max = LIMITS.shortText as number,
    label = 'This field',
  }: { required?: boolean; max?: number; label?: string } = {},
) {
  if (typeof value !== 'string') {
    errors[path] = `${label} is missing.`;
    return;
  }
  const v = value.trim();
  if (required && !v) errors[path] = `Enter ${label.toLowerCase()}.`;
  else if (v.length > max)
    errors[path] =
      `${label} must be ${max} characters or fewer (now ${v.length}).`;
}

function listRule(
  errors: FieldErrors,
  path: string,
  list: unknown,
  {
    max,
    itemMax = LIMITS.shortText,
    label = 'Item',
  }: { max: number; itemMax?: number; label?: string },
) {
  if (!Array.isArray(list)) {
    errors[path] = `${label}s are missing.`;
    return;
  }
  if (list.length > max)
    errors[path] = `Use ${max} ${label.toLowerCase()}s or fewer.`;
  const seen = new Set<string>();
  list.forEach((item, i) => {
    const v = typeof item === 'string' ? item.trim() : '';
    if (!v)
      errors[`${path}.${i}`] =
        `${label} ${i + 1} is empty. Fill it in or remove it.`;
    else if (v.length > itemMax)
      errors[`${path}.${i}`] =
        `${label} ${i + 1} is too long (max ${itemMax}).`;
    else if (seen.has(v.toLowerCase()))
      errors[`${path}.${i}`] = `${label} ${i + 1} is a duplicate.`;
    seen.add(v.toLowerCase());
  });
}

// ─── Pricing plans ──────────────────────────────────────────────────────────
export function validatePricingPlan(p: PricingPlan): FieldErrors {
  const e: FieldErrors = {};
  textRule(e, 'name', p.name, {
    required: true,
    max: LIMITS.name,
    label: 'A plan name',
  });
  if (!PLAN_CATEGORIES.includes(p.category)) e.category = 'Choose a plan type.';
  const isService = p.category === 'maintenance';
  if (
    !isService &&
    !(isFiniteNumber(p.capacityKw) && p.capacityKw > 0 && p.capacityKw <= 10000)
  )
    e.capacityKw = 'Enter the system size in kW (more than 0).';
  const free = p.priceMin === 0 && p.priceMax === 0;
  if (!isFiniteNumber(p.priceMin) || p.priceMin < 0)
    e.priceMin = 'Minimum price cannot be negative.';
  else if (!free && p.priceMin <= 0)
    e.priceMin =
      'Minimum price must be more than 0 (or set both prices to 0 for a free plan).';
  else if (p.priceMin > LIMITS.maxPrice)
    e.priceMin = 'This price looks too large.';
  if (!isFiniteNumber(p.priceMax) || p.priceMax < p.priceMin)
    e.priceMax = 'Maximum price must be at least the minimum price.';
  else if (p.priceMax > LIMITS.maxPrice)
    e.priceMax = 'This price looks too large.';
  if (!isFiniteNumber(p.subsidy) || p.subsidy < 0)
    e.subsidy = 'Subsidy cannot be negative.';
  else if (p.subsidy > 0 && p.subsidy > p.priceMax)
    e.subsidy = 'Subsidy cannot be more than the maximum price.';
  textRule(e, 'priceUnit', p.priceUnit, {
    max: LIMITS.label,
    label: 'Price unit',
  });
  textRule(e, 'idealFor', p.idealFor, {
    max: LIMITS.shortText,
    label: '“Ideal for”',
  });
  textRule(e, 'monthlyGeneration', p.monthlyGeneration, {
    max: LIMITS.label,
    label: 'Monthly generation',
  });
  textRule(e, 'roofArea', p.roofArea, {
    max: LIMITS.label,
    label: 'Roof area',
  });
  textRule(e, 'badge', p.badge, { max: LIMITS.badge, label: 'Badge text' });
  textRule(e, 'ctaLabel', p.ctaLabel, {
    max: LIMITS.label,
    label: 'Button label',
  });
  listRule(e, 'features', p.features, {
    max: LIMITS.features,
    label: 'Feature',
  });
  if (!Number.isInteger(p.order) || p.order < 0)
    e.order = 'Display order must be a whole number (0 or more).';
  if (!STATUSES.includes(p.status)) e.status = 'Choose Draft or Published.';
  return e;
}

// ─── Capacity plans ─────────────────────────────────────────────────────────
export function validateCapacityPlan(p: CapacityPlan): FieldErrors {
  const e: FieldErrors = {};
  textRule(e, 'name', p.name, {
    required: true,
    max: LIMITS.name,
    label: 'A plan name',
  });
  textRule(e, 'capacity', p.capacity, {
    required: true,
    max: LIMITS.label,
    label: 'The capacity',
  });
  textRule(e, 'subtitle', p.subtitle, { max: LIMITS.name, label: 'Subtitle' });
  if (!SEGMENTS.includes(p.segment)) e.segment = 'Choose a segment.';
  if (!Array.isArray(p.specs)) e.specs = 'Specs are missing.';
  else {
    if (p.specs.length > LIMITS.specs)
      e.specs = `Use ${LIMITS.specs} spec rows or fewer.`;
    p.specs.forEach((s, i) => {
      if (!s.label?.trim())
        e[`specs.${i}.label`] = `Spec ${i + 1}: enter a label.`;
      else if (s.label.length > LIMITS.label)
        e[`specs.${i}.label`] = `Spec ${i + 1}: label is too long.`;
      if (!s.value?.trim())
        e[`specs.${i}.value`] = `Spec ${i + 1}: enter a value.`;
      else if (s.value.length > LIMITS.shortText)
        e[`specs.${i}.value`] = `Spec ${i + 1}: value is too long.`;
    });
  }
  listRule(e, 'features', p.features, {
    max: LIMITS.features,
    label: 'Feature',
  });
  textRule(e, 'badge', p.badge, { max: LIMITS.badge, label: 'Badge text' });
  textRule(e, 'priceNote', p.priceNote, {
    max: LIMITS.shortText,
    label: 'Price note',
  });
  textRule(e, 'ctaLabel', p.ctaLabel, {
    required: true,
    max: LIMITS.label,
    label: 'A button label',
  });
  if (!Number.isInteger(p.order) || p.order < 0)
    e.order = 'Display order must be a whole number (0 or more).';
  if (!STATUSES.includes(p.status)) e.status = 'Choose Draft or Published.';
  return e;
}

// ─── Site content ───────────────────────────────────────────────────────────
type ItemCheck = {
  field: string;
  label: string;
  required?: boolean;
  max?: number;
  kind?: 'text' | 'link' | 'image';
};

function itemsRule(
  e: FieldErrors,
  path: string,
  list: unknown,
  checks: ItemCheck[],
  { min = 0, max = 12, noun = 'Item' } = {},
) {
  if (!Array.isArray(list)) {
    e[path] = `${noun}s are missing.`;
    return;
  }
  if (list.length < min)
    e[path] =
      `Add at least ${min} ${noun.toLowerCase()}${min === 1 ? '' : 's'}.`;
  if (list.length > max)
    e[path] = `Use ${max} ${noun.toLowerCase()}s or fewer.`;
  list.forEach((item, i) => {
    const rec = isObject(item) ? item : {};
    for (const c of checks) {
      const v =
        typeof rec[c.field] === 'string' ? (rec[c.field] as string) : '';
      const key = `${path}.${i}.${c.field}`;
      if (c.required && !v.trim())
        e[key] = `${noun} ${i + 1}: enter ${c.label.toLowerCase()}.`;
      else if (
        !(c.kind === 'image' && isDataImage(v)) &&
        v.length > (c.max ?? LIMITS.shortText)
      )
        e[key] = `${noun} ${i + 1}: ${c.label.toLowerCase()} is too long.`;
      else if (c.kind === 'link' && !isValidLink(v))
        e[key] =
          `${noun} ${i + 1}: use a page like /pricing or a full https:// link.`;
      else if (c.kind === 'image' && !isValidImage(v))
        e[key] =
          `${noun} ${i + 1}: use /images/file.jpg or an https:// image URL.`;
    }
  });
}

const linkRule = (e: FieldErrors, path: string, v: string) => {
  if (!isValidLink(v))
    e[path] = 'Use a page like /contact or a full https:// link.';
};

export function validateContent(c: SiteContent): FieldErrors {
  const e: FieldErrors = {};
  textRule(e, 'businessName', c.businessName, {
    required: true,
    max: LIMITS.name,
    label: 'A business name',
  });
  const phone = indianPhone(c.phone ?? '');
  if (phone) e.phone = phone;
  textRule(e, 'email', c.email, {
    required: true,
    max: LIMITS.name,
    label: 'An email',
  });
  if (!e.email) {
    const m = optionalEmail(c.email);
    if (m) e.email = m;
  }
  if (c.whatsapp && !/^\d{11,13}$/.test(c.whatsapp.replace(/\D/g, '')))
    e.whatsapp =
      'Use country code + number only after confirming it is WhatsApp-enabled.';
  textRule(e, 'heroTitle', c.heroTitle, {
    required: true,
    max: LIMITS.shortText,
    label: 'A headline',
  });
  textRule(e, 'heroSubtitle', c.heroSubtitle, {
    max: LIMITS.longText,
    label: 'Hero text',
  });
  textRule(e, 'address', c.address, { max: 300, label: 'Address' });
  textRule(e, 'announcement', c.announcement, {
    required: c.announcementEnabled,
    max: LIMITS.shortText,
    label: 'Announcement text',
  });
  if (
    c.videoUrl &&
    !/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{11}/.test(
      c.videoUrl,
    )
  )
    e.videoUrl = 'Paste a YouTube link like https://youtu.be/xxxxxxxxxxx.';
  itemsRule(
    e,
    'stats',
    c.stats,
    [
      { field: 'value', label: 'A value', required: true, max: 16 },
      { field: 'label', label: 'A label', required: true, max: 60 },
    ],
    { max: 6, noun: 'Stat' },
  );
  itemsRule(
    e,
    'highlights',
    c.highlights,
    [
      { field: 'title', label: 'A title', required: true, max: 40 },
      { field: 'text', label: 'Text', max: 80 },
    ],
    { max: 12, noun: 'Tile' },
  );
  listRule(e, 'serviceAreas', c.serviceAreas, {
    max: 30,
    itemMax: 40,
    label: 'Area',
  });
  listRule(e, 'partners', c.partners, { max: 30, itemMax: 40, label: 'Brand' });

  const h = c.home;
  if (h) {
    itemsRule(
      e,
      'home.solutions',
      h.solutions,
      [
        { field: 'title', label: 'A title', required: true, max: 60 },
        { field: 'text', label: 'Text', max: 240 },
        { field: 'image', label: 'An image', kind: 'image', max: 600 },
        { field: 'link', label: 'A link', kind: 'link', max: 300 },
      ],
      { max: 6, noun: 'Card' },
    );
    itemsRule(
      e,
      'home.whyUs',
      h.whyUs,
      [
        { field: 'title', label: 'A title', required: true, max: 60 },
        { field: 'text', label: 'Text', max: 300 },
      ],
      { max: 6, noun: 'Reason' },
    );
    itemsRule(
      e,
      'home.areas',
      h.areas,
      [
        { field: 'name', label: 'A name', required: true, max: 40 },
        { field: 'text', label: 'Text', max: 160 },
        { field: 'image', label: 'An image', kind: 'image', max: 600 },
      ],
      { max: 8, noun: 'Area' },
    );
    itemsRule(
      e,
      'home.benefits',
      h.benefits,
      [
        { field: 'title', label: 'A title', required: true, max: 60 },
        { field: 'text', label: 'Text', max: 300 },
      ],
      { max: 4, noun: 'Benefit' },
    );
    listRule(e, 'home.maintenancePoints', h.maintenancePoints, {
      max: 10,
      itemMax: 80,
      label: 'Point',
    });
    linkRule(e, 'home.maintenancePrimaryLink', h.maintenancePrimaryLink);
    linkRule(e, 'home.maintenanceSecondaryLink', h.maintenanceSecondaryLink);
    textRule(e, 'home.sixMonthTitle', h.sixMonthTitle, {
      required: true,
      max: LIMITS.shortText,
      label: 'A section title',
    });
  }
  const pp = c.pricingPage;
  if (pp) {
    textRule(e, 'pricingPage.heroTitle', pp.heroTitle, {
      required: true,
      max: LIMITS.shortText,
      label: 'A page title',
    });
    textRule(e, 'pricingPage.ctaLabel', pp.ctaLabel, {
      required: true,
      max: LIMITS.label,
      label: 'A default button label',
    });
    textRule(e, 'pricingPage.featuredBadge', pp.featuredBadge, {
      required: true,
      max: LIMITS.badge,
      label: 'A featured badge',
    });
    textRule(e, 'pricingPage.freeBadge', pp.freeBadge, {
      required: true,
      max: LIMITS.badge,
      label: 'A free badge',
    });
    textRule(e, 'pricingPage.disclaimerText', pp.disclaimerText, {
      max: LIMITS.longText,
      label: 'Disclaimer',
    });
    for (const k of PLAN_CATEGORIES)
      textRule(e, `pricingPage.tabs.${k}.label`, pp.tabs?.[k]?.label, {
        required: true,
        max: 30,
        label: 'A tab label',
      });
  }
  const a = c.about;
  if (a) {
    listRule(e, 'about.story', a.story, {
      max: 6,
      itemMax: 600,
      label: 'Paragraph',
    });
    itemsRule(
      e,
      'about.principles',
      a.principles,
      [
        { field: 'title', label: 'A title', required: true, max: 60 },
        { field: 'text', label: 'Text', max: 300 },
      ],
      { max: 8, noun: 'Principle' },
    );
    itemsRule(
      e,
      'about.timeline',
      a.timeline,
      [
        { field: 'year', label: 'A year', required: true, max: 12 },
        { field: 'text', label: 'Text', required: true, max: 200 },
      ],
      { max: 15, noun: 'Milestone' },
    );
  }
  if (c.servicesPage)
    itemsRule(
      e,
      'servicesPage.dustStats',
      c.servicesPage.dustStats,
      [
        { field: 'value', label: 'A value', required: true, max: 16 },
        { field: 'label', label: 'A label', required: true, max: 60 },
      ],
      { max: 4, noun: 'Stat' },
    );
  if (c.cta) {
    textRule(e, 'cta.title', c.cta.title, {
      required: true,
      max: LIMITS.shortText,
      label: 'A title',
    });
    textRule(e, 'cta.primaryLabel', c.cta.primaryLabel, {
      required: true,
      max: LIMITS.label,
      label: 'A button label',
    });
    linkRule(e, 'cta.primaryLink', c.cta.primaryLink);
  }
  return e;
}

/** Minimal shape check for collections without a dedicated validator. */
function validateGeneric(item: unknown): FieldErrors {
  if (!isObject(item) || typeof item.id !== 'string' || !item.id)
    return { id: 'Item has no id.' };
  return {};
}

export function validateItem<K extends CollectionKey>(
  key: K,
  item: Database[K][number],
): FieldErrors {
  if (key === 'pricingPlans') return validatePricingPlan(item as PricingPlan);
  if (key === 'capacityPlans')
    return validateCapacityPlan(item as CapacityPlan);
  return validateGeneric(item);
}

export const hasErrors = (e: FieldErrors) => Object.keys(e).length > 0;

/** Errors whose path starts with `prefix.` (e.g. all errors of features). */
export function errorsUnder(e: FieldErrors, prefix: string): FieldErrors {
  const out: FieldErrors = {};
  for (const [k, v] of Object.entries(e))
    if (k === prefix || k.startsWith(prefix + '.'))
      out[k.slice(prefix.length + 1) || ''] = v;
  return out;
}

// ─── Normalisation (fills fields that older saved data does not have) ──────
export function normalizePricingPlan(
  p: Partial<PricingPlan> & { id: string },
): PricingPlan {
  return {
    name: '',
    category: 'residential',
    capacityKw: null,
    priceMin: 0,
    priceMax: 0,
    subsidy: 0,
    priceUnit: '',
    idealFor: '',
    monthlyGeneration: '',
    roofArea: '',
    features: [],
    featured: false,
    badge: '',
    ctaLabel: '',
    status: 'draft',
    order: 0,
    updatedAt: new Date(0).toISOString(),
    ...p,
  } as PricingPlan;
}

export function normalizeCapacityPlan(
  p: Partial<CapacityPlan> & { id: string },
): CapacityPlan {
  const specs = Array.isArray(p.specs)
    ? p.specs.map((s) =>
        Array.isArray(s)
          ? { label: String(s[0] ?? ''), value: String(s[1] ?? '') }
          : s,
      )
    : [];
  return {
    segment: 'residential',
    name: '',
    subtitle: '',
    capacity: '',
    features: [],
    featured: false,
    badge: '',
    priceNote: '',
    ctaLabel: 'Get price',
    status: 'draft',
    order: 0,
    updatedAt: new Date(0).toISOString(),
    ...p,
    specs,
  } as CapacityPlan;
}

/**
 * Deep-merge saved data onto defaults: plain objects merge key by key (so a new
 * content section added in an app update appears), arrays and values from `saved` win.
 */
export function mergeDefaults<T>(defaults: T, saved: unknown): T {
  if (saved === undefined || saved === null) return defaults;
  if (isObject(defaults) && isObject(saved)) {
    const out: Record<string, unknown> = { ...defaults };
    for (const [k, v] of Object.entries(saved))
      out[k] =
        k in defaults
          ? mergeDefaults((defaults as Record<string, unknown>)[k], v)
          : v;
    return out as T;
  }
  if (Array.isArray(defaults))
    return (Array.isArray(saved) ? saved : defaults) as T;
  return (typeof saved === typeof defaults ? saved : defaults) as T;
}

/** Replace {businessName} / {phone} tokens in editable text. */
export function fillTokens(
  text: string,
  c: Pick<SiteContent, 'businessName' | 'phone'>,
): string {
  return text
    .replaceAll('{businessName}', c.businessName)
    .replaceAll('{phone}', c.phone);
}
