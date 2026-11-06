import type { CalculatorSettings, ConsumerCategory, PropertyType } from '@/types'

/**
 * TARIFF REGISTRY — which electricity tariff the calculator may use for a location.
 * ─────────────────────────────────────────────────────────────────────────────
 * Only tariffs that were checked against the regulator's published tariff order are marked
 * `verified`. Everywhere else the calculator falls back to an indicative ₹/unit
 * (Settings → Calculator → Indicative tariff) and the website says the estimate needs confirmation.
 *
 * To add a verified tariff for another DISCOM: add its slabs to the calculator settings (or a new
 * profile), set `tariff` on the DISCOM below, and add a test with a worked example from the order.
 */

export const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'OTHER', name: 'Other country' },
] as const
export type CountryCode = (typeof COUNTRIES)[number]['code']

export interface DiscomInfo {
  id: string
  name: string
  stateCode: string
  /** Verified tariff profile available for this DISCOM. */
  tariff?: 'cspdcl'
}

/** Distribution companies by GST state code. "Other / not sure" is added for every state. */
export const DISCOMS: DiscomInfo[] = [
  { id: 'cspdcl', name: 'CSPDCL (Chhattisgarh State Power Distribution Co.)', stateCode: '22', tariff: 'cspdcl' },
  { id: 'mppkvvcl-east', name: 'MP Poorv Kshetra VVCL (Jabalpur)', stateCode: '23' },
  { id: 'mppkvvcl-central', name: 'MP Madhya Kshetra VVCL (Bhopal)', stateCode: '23' },
  { id: 'mppkvvcl-west', name: 'MP Paschim Kshetra VVCL (Indore)', stateCode: '23' },
  { id: 'msedcl', name: 'MSEDCL (Mahavitaran)', stateCode: '27' },
  { id: 'best', name: 'BEST (Mumbai)', stateCode: '27' },
  { id: 'tata-mumbai', name: 'Tata Power (Mumbai)', stateCode: '27' },
  { id: 'aeml', name: 'Adani Electricity (Mumbai)', stateCode: '27' },
  { id: 'tpcodl', name: 'TP Central Odisha (TPCODL)', stateCode: '21' },
  { id: 'tpsodl', name: 'TP Southern Odisha (TPSODL)', stateCode: '21' },
  { id: 'tpwodl', name: 'TP Western Odisha (TPWODL)', stateCode: '21' },
  { id: 'tpnodl', name: 'TP Northern Odisha (TPNODL)', stateCode: '21' },
  { id: 'jbvnl', name: 'JBVNL (Jharkhand)', stateCode: '20' },
  { id: 'tsspdcl', name: 'TGSPDCL (Southern Telangana)', stateCode: '36' },
  { id: 'tsnpdcl', name: 'TGNPDCL (Northern Telangana)', stateCode: '36' },
  { id: 'brpl', name: 'BSES Rajdhani', stateCode: '07' },
  { id: 'bypl', name: 'BSES Yamuna', stateCode: '07' },
  { id: 'tpddl', name: 'Tata Power Delhi Distribution', stateCode: '07' },
  { id: 'dgvcl', name: 'DGVCL (South Gujarat)', stateCode: '24' },
  { id: 'mgvcl', name: 'MGVCL (Central Gujarat)', stateCode: '24' },
  { id: 'pgvcl', name: 'PGVCL (Saurashtra)', stateCode: '24' },
  { id: 'ugvcl', name: 'UGVCL (North Gujarat)', stateCode: '24' },
  { id: 'torrent', name: 'Torrent Power', stateCode: '24' },
  { id: 'bescom', name: 'BESCOM (Bengaluru)', stateCode: '29' },
  { id: 'tangedco', name: 'TNPDCL (Tamil Nadu)', stateCode: '33' },
  { id: 'kseb', name: 'KSEB (Kerala)', stateCode: '32' },
]

export const OTHER_DISCOM = 'other'

export function discomsFor(stateCode: string): DiscomInfo[] {
  return [...DISCOMS.filter((d) => d.stateCode === stateCode), { id: OTHER_DISCOM, name: 'Other / not sure', stateCode }]
}

/** Default DISCOM for a state: the verified one if any, else the first listed, else "other". */
export function defaultDiscom(stateCode: string): string {
  const list = discomsFor(stateCode)
  return (list.find((d) => d.tariff) ?? list[0]).id
}

export interface TariffSource {
  /** 'slab' = verified slab tariff; 'indicative' = flat assumed ₹/unit; 'custom' = a ₹/unit typed by staff. */
  mode: 'slab' | 'indicative' | 'custom'
  verified: boolean
  /** Short label for the website, e.g. "CSPDCL FY 2026-27". */
  label: string
  discomName: string
  /** Regulator order the rates come from (verified tariffs only). */
  reference?: string
  sourceUrl?: string
  effectiveFrom?: string
  /** Shown under the result (e.g. "needs confirmation"). */
  notes: string[]
}

/** CSERC tariff order used for the CSPDCL profile (checked 1 Nov 2026). */
export const CSPDCL_SOURCE = {
  reference: 'CSERC Tariff Schedule FY 2026-27',
  sourceUrl: 'https://cserc.gov.in/upload/upload_news/15-06-2026_17815346191.pdf',
  effectiveFrom: '2026-07-01',
  checkedOn: '2026-11-01',
} as const

export const consumerOf = (p: PropertyType): ConsumerCategory =>
  p === 'commercial' ? 'commercial' : p === 'industrial' ? 'industrial' : 'residential'

export function resolveTariff(
  opts: { country?: string | null; stateCode?: string | null; discomId?: string | null; propertyType: PropertyType; customTariff?: number },
  s: CalculatorSettings,
): TariffSource & { flatRate: number } {
  const state = opts.stateCode || s.subsidy.defaultStateCode || '22'
  const consumer = consumerOf(opts.propertyType)
  const indicative = (s.indicativeTariff ?? { residential: s.defaultTariff, commercial: s.defaultTariff, industrial: s.defaultTariff })[consumer]
  const discomId = opts.discomId || defaultDiscom(state)
  const discom = discomsFor(state).find((d) => d.id === discomId)
  const discomName = discom && discom.id !== OTHER_DISCOM ? discom.name : 'your electricity company'

  if (opts.customTariff && opts.customTariff > 0)
    return { mode: 'custom', verified: false, label: `₹${opts.customTariff}/unit (entered)`, discomName, notes: [], flatRate: opts.customTariff }

  if (opts.country && opts.country !== 'IN')
    return {
      mode: 'indicative', verified: false, label: 'Not configured', discomName: 'your electricity company', flatRate: indicative,
      notes: ['Electricity tariffs for countries outside India are not configured. Cost, savings and subsidy figures are indicative only and need confirmation.'],
    }

  if (discom?.tariff === 'cspdcl' && !s.electricity?.enabled)
    return {
      mode: 'indicative', verified: false, label: `Flat ₹${s.defaultTariff}/unit`, discomName: 'CSPDCL', flatRate: s.defaultTariff,
      notes: ['The slab tariff is switched off in the calculator settings, so a flat rate per unit is used. This estimate needs confirmation.'],
    }

  if (discom?.tariff === 'cspdcl')
    return {
      mode: 'slab', verified: true, label: s.electricity.label, discomName: 'CSPDCL', flatRate: indicative,
      reference: CSPDCL_SOURCE.reference, sourceUrl: CSPDCL_SOURCE.sourceUrl, effectiveFrom: CSPDCL_SOURCE.effectiveFrom,
      notes: [],
    }

  return {
    mode: 'indicative', verified: false, label: `Indicative ₹${indicative}/unit`, discomName, flatRate: indicative,
    notes: [`A verified tariff for ${discomName} is not configured yet, so the bill and savings use an indicative ₹${indicative}/unit. This estimate needs confirmation from your latest electricity bill.`],
  }
}
