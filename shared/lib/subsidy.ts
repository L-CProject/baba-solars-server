import type { CalculatorSettings, PropertyType, StateSubsidyRule, SubsidySettings, SystemType } from '@/types'
import { stateName } from '@/lib/states'

/**
 * SUBSIDY ENGINE — the one place where subsidies are worked out. Used by the website calculator,
 * the pricing table, quotations, invoices, PDFs and Excel files, so every screen shows the same numbers.
 *
 * Central: PM Surya Ghar: Muft Bijli Yojana, Central Financial Assistance (MNRE).
 *   Homes: ₹30,000/kW for the first 2 kW + ₹18,000 for the 3rd kW, maximum ₹78,000 (3 kW and above).
 *   Special category states/UTs (NE states, HP, Uttarakhand, J&K, Ladakh, A&N, Lakshadweep): ₹33,000/kW + ₹19,800.
 *   Housing societies / RWAs (common facilities): ₹18,000/kW up to 500 kW.
 *   Only grid-connected systems; not for commercial / industrial consumers.
 * State: top-up schemes configured per state (Admin → Settings → Calculator → Subsidy).
 *   Chhattisgarh: ₹15,000 for 1 kW, ₹30,000 for 2 kW and above, per domestic household.
 *
 * All amounts are editable in the admin panel because government rules change; the defaults were
 * checked on the date in `SUBSIDY_RULES_CHECKED_ON`.
 */
export const SUBSIDY_RULES_CHECKED_ON = '2026-10-30'

/** GST state codes of the special category states/UTs under PM Surya Ghar. */
export const SPECIAL_CATEGORY_STATE_CODES = ['01', '02', '05', '11', '12', '13', '14', '15', '16', '17', '18', '31', '35', '38']

export const CHHATTISGARH_RULE: StateSubsidyRule = {
  id: 'state-22',
  stateCode: '22',
  schemeName: 'Chhattisgarh State Subsidy',
  agency: 'Govt. of Chhattisgarh (CREDA / CSPDCL)',
  enabled: true,
  slabs: [
    { fromKw: 1, amount: 15000 },
    { fromKw: 2, amount: 30000 },
  ],
  propertyTypes: ['residential'],
  note: 'Per domestic household, in addition to the PM Surya Ghar central subsidy.',
}

export interface SubsidyInput {
  capacityKw: number
  propertyType: PropertyType
  systemType: SystemType
  /** GST state code of the installation site ("22" = Chhattisgarh). Empty → settings default. */
  stateCode?: string | null
  /** Total system cost incl. GST. Subsidy never exceeds it. Omit to skip the cap. */
  systemCost?: number | null
}

export interface SubsidyResult {
  eligible: boolean
  central: number
  state: number
  total: number
  /** systemCost − total (null when no cost was given). */
  netCost: number | null
  stateCode: string
  stateName: string
  centralScheme: string
  /** e.g. "Chhattisgarh State Subsidy" — null when the state has no active scheme. */
  stateScheme: string | null
  stateAgency: string | null
  specialCategory: boolean
  /** Why something is 0 (shown as hints). */
  notes: string[]
}

export const CENTRAL_SCHEME = 'PM Surya Ghar: Muft Bijli Yojana (Central CFA)'

const money = (n: number) => Math.max(0, Math.round(Number.isFinite(n) ? n : 0))

export function centralEligible(propertyType: PropertyType, systemType: SystemType, s: SubsidySettings): boolean {
  if (!s.enabled || propertyType === 'commercial' || propertyType === 'industrial') return false
  if (systemType === 'off-grid') return false
  if (systemType === 'hybrid' && !s.hybridEligible) return false
  return true
}

/** Central assistance (₹) before the cost cap. Pro-rata for part kW, e.g. 1.5 kW → ₹45,000. */
export function centralAmount(kw: number, propertyType: PropertyType, systemType: SystemType, s: SubsidySettings, stateCode?: string | null): number {
  if (!centralEligible(propertyType, systemType, s) || !(kw > 0)) return 0
  if (propertyType === 'housing-society') return money(Math.min(kw, s.housingSocietyMaxKw) * s.housingSocietyPerKw)
  const code = stateCode || s.defaultStateCode
  const rates = s.specialCategoryStates?.includes(code) && s.specialCategory ? s.specialCategory : s
  const firstTwo = Math.min(kw, 2) * rates.perKwUpTo2
  const third = Math.min(Math.max(kw - 2, 0), 1) * rates.perKwThird
  return Math.min(money(firstTwo + third), rates.cap)
}

export function stateRuleFor(stateCode: string | null | undefined, s: SubsidySettings): StateSubsidyRule | null {
  const code = stateCode || s.defaultStateCode
  return (s.states ?? []).find((r) => r.stateCode === code && r.enabled) ?? null
}

/** State top-up (₹) before the cost cap: the highest slab whose `fromKw` the size reaches. */
export function stateAmount(kw: number, rule: StateSubsidyRule | null): number {
  if (!rule || !(kw > 0)) return 0
  let amount = 0
  for (const slab of [...rule.slabs].sort((a, b) => a.fromKw - b.fromKw)) if (kw + 1e-9 >= slab.fromKw) amount = slab.amount
  return money(amount)
}

export function computeSubsidy(input: SubsidyInput, settings: CalculatorSettings | SubsidySettings): SubsidyResult {
  const s: SubsidySettings = 'subsidy' in settings ? settings.subsidy : settings
  const code = input.stateCode || s.defaultStateCode || '22'
  const kw = Number(input.capacityKw) || 0
  const notes: string[] = []
  const eligible = centralEligible(input.propertyType, input.systemType, s)
  if (!s.enabled) notes.push('Subsidy is switched off in the settings.')
  else if (input.propertyType === 'commercial' || input.propertyType === 'industrial') notes.push('Commercial and industrial connections are not eligible for PM Surya Ghar subsidy.')
  else if (input.systemType === 'off-grid') notes.push('Off-grid systems are not eligible — subsidy needs a grid-connected (net-metered) system.')
  else if (input.systemType === 'hybrid' && !s.hybridEligible) notes.push('Hybrid systems are not eligible in the current settings.')

  let central = eligible ? centralAmount(kw, input.propertyType, input.systemType, s, code) : 0
  const rule = stateRuleFor(code, s)
  let state = 0
  if (eligible && rule) {
    if (!rule.propertyTypes.includes(input.propertyType)) notes.push(`${rule.schemeName} applies to ${rule.propertyTypes.join(', ')} connections only.`)
    else {
      state = stateAmount(kw, rule)
      const min = Math.min(...rule.slabs.map((x) => x.fromKw))
      if (!state && kw < min) notes.push(`${rule.schemeName} starts at ${min} kW.`)
    }
  }
  const cost = input.systemCost != null && Number.isFinite(input.systemCost) ? Math.max(0, input.systemCost) : null
  if (cost !== null) {
    central = Math.min(central, money(cost))
    state = Math.min(state, Math.max(0, money(cost) - central))
  }
  const total = central + state
  return {
    eligible,
    central,
    state,
    total,
    netCost: cost === null ? null : Math.max(0, Math.round(cost - total)),
    stateCode: code,
    stateName: stateName(code),
    centralScheme: CENTRAL_SCHEME,
    stateScheme: eligible && rule ? rule.schemeName : null,
    stateAgency: rule?.agency ?? null,
    specialCategory: !!s.specialCategoryStates?.includes(code),
    notes,
  }
}

/** Validation for Settings → Calculator → Subsidy (field path → message). */
export function validateSubsidySettings(s: SubsidySettings, prefix = 'calculator.subsidy'): Record<string, string> {
  const e: Record<string, string> = {}
  const pos = (v: number) => Number.isFinite(v) && v >= 0
  for (const k of ['perKwUpTo2', 'perKwThird', 'cap', 'housingSocietyPerKw', 'housingSocietyMaxKw'] as const)
    if (!pos(s[k])) e[`${prefix}.${k}`] = 'Enter 0 or more.'
  if (s.specialCategory) for (const k of ['perKwUpTo2', 'perKwThird', 'cap'] as const)
    if (!pos(s.specialCategory[k])) e[`${prefix}.specialCategory.${k}`] = 'Enter 0 or more.'
  if (!/^\d{2}$/.test(s.defaultStateCode ?? '')) e[`${prefix}.defaultStateCode`] = 'Choose a state.'
  const seen = new Set<string>()
  ;(s.states ?? []).forEach((r, i) => {
    const p = `${prefix}.states.${i}`
    if (!/^\d{2}$/.test(r.stateCode)) e[`${p}.stateCode`] = 'Choose a state.'
    else if (seen.has(r.stateCode)) e[`${p}.stateCode`] = 'This state has two rules — keep one.'
    seen.add(r.stateCode)
    if (!r.schemeName.trim()) e[`${p}.schemeName`] = 'Enter the scheme name.'
    if (!r.slabs.length) e[`${p}.slabs`] = 'Add at least one slab.'
    if (!r.propertyTypes.length) e[`${p}.propertyTypes`] = 'Choose at least one property type.'
    const kws = new Set<number>()
    r.slabs.forEach((sl, j) => {
      if (!(sl.fromKw > 0 && sl.fromKw <= 10000)) e[`${p}.slabs.${j}.fromKw`] = 'Size must be more than 0 kW.'
      else if (kws.has(sl.fromKw)) e[`${p}.slabs.${j}.fromKw`] = 'Listed twice.'
      kws.add(sl.fromKw)
      if (!pos(sl.amount)) e[`${p}.slabs.${j}.amount`] = 'Enter 0 or more.'
    })
  })
  return e
}
