import type { ElectricityTariffSettings, PropertyType, TariffSlab } from '@/types'

/**
 * CSPDCL (Chhattisgarh) LV electricity bill — pure functions.
 * ─────────────────────────────────────────────────────────────
 * Source: CSERC Tariff Schedule FY 2026-27 (applicable from 1 July 2026).
 *  • Energy charges are TELESCOPIC: each slab's rate applies only to the units inside that slab.
 *  • LV-1 domestic fixed charge is telescopic on sanctioned load (₹/kW/month) and is a monthly
 *    minimum — payable even at zero consumption.
 *  • LV-2.1 (single phase ≤ 5 kW) fixed ₹/kW; LV-2.2 (three phase) demand charge ₹/kW.
 *  • FPPAS is a % levied on energy charges (changes every month — taken from settings / the bill).
 *  • Electricity duty (Chhattisgarh Electricity Duty Act, as amended 2022) is a % of energy charges:
 *    domestic 11 %, non-domestic LV 17 %. The tariff itself excludes duty.
 *  • Bijli Bill Half / M-Urja (LV-1 domestic only): consumers using up to 400 units a month get 50 %
 *    off the energy charge + fixed charge + FPPAS attributable to the first 200 units. Duty is not
 *    discounted. Above 400 units there is no rebate.
 *  • LV-5 Industry ("other industries"): 5.2.1 up to 25 HP (18.7 kW) and 5.2.2 above, flat energy
 *    rate + demand charge (₹/kW/month on billing demand, a monthly minimum).
 *  • Above the LV limit (150 kW) an industry takes HV supply: HV-3 11 kV (load factor > 15 %),
 *    energy billed per kVAh (taken ≈ kWh, i.e. unity power factor) + ₹/kVA demand charge.
 *  • LV bills are rounded to the nearest ₹10.
 * All rates live in Admin → Settings → Calculator so they can be updated with each tariff order.
 */

export type ConnectionCategory = 'lv1' | 'lv2.1' | 'lv2.2a' | 'lv2.2b' | 'lv5.2.1' | 'lv5.2.2' | 'hv3'

export const CATEGORY_LABEL: Record<ConnectionCategory, string> = {
  lv1: 'LV-1 Domestic',
  'lv2.1': 'LV-2.1 Non-domestic (single phase, up to 5 kW)',
  'lv2.2a': 'LV-2.2 Non-domestic (three phase, up to 15 kW)',
  'lv2.2b': 'LV-2.2 Non-domestic (three phase, above 15 kW)',
  'lv5.2.1': 'LV-5.2.1 Industry (up to 25 HP / 18.7 kW)',
  'lv5.2.2': 'LV-5.2.2 Industry (above 25 HP / 18.7 kW)',
  hv3: 'HV-3 Industrial (11 kV, load factor above 15 %)',
}

export interface BillOptions {
  propertyType: PropertyType
  /** Sanctioned / contract load in kW. Empty → settings default for the category. */
  loadKw?: number | null
  /** FPPAS % from the bill. Empty → settings default. */
  fppasPercent?: number | null
  /** Fixed/demand charge printed on the bill (₹). Empty → computed from the load. */
  fixedChargesOverride?: number | null
}

export interface BillBreakdown {
  category: ConnectionCategory
  units: number
  loadKw: number
  /** Slab-wise energy charge lines (telescopic). */
  slabs: { from: number; to: number | null; units: number; rate: number; amount: number }[]
  energyCharges: number
  fixedCharges: number
  fppasPercent: number
  fppas: number
  dutyPercent: number
  duty: number
  /** Bijli Bill Half / M-Urja state rebate (positive number, subtracted). */
  rebate: number
  /** Exact amount before rounding. */
  total: number
  /** Amount payable, rounded as on the bill. */
  payable: number
  /** Effective ₹ per unit (payable ÷ units), 0 when units = 0. */
  effectiveRate: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function connectionCategory(
  propertyType: PropertyType,
  loadKw: number,
  e: Pick<ElectricityTariffSettings, 'lv5ThresholdKw' | 'lvMaxKw'> = { lv5ThresholdKw: 18.7, lvMaxKw: 150 },
): ConnectionCategory {
  if (propertyType === 'industrial') {
    if (loadKw > e.lvMaxKw) return 'hv3'
    return loadKw <= e.lv5ThresholdKw ? 'lv5.2.1' : 'lv5.2.2'
  }
  if (propertyType !== 'commercial') return 'lv1'
  if (loadKw <= 5) return 'lv2.1'
  if (loadKw <= 15) return 'lv2.2a'
  return 'lv2.2b'
}

/** Telescopic slab calculation: each rate applies only to the units inside its slab. */
export function slabCharges(units: number, slabs: TariffSlab[]): BillBreakdown['slabs'] {
  const out: BillBreakdown['slabs'] = []
  let prev = 0
  for (const s of slabs) {
    if (units <= prev) break
    const top = s.upToUnits === null ? units : Math.min(units, s.upToUnits)
    const u = Math.max(0, top - prev)
    if (u > 0) out.push({ from: prev + 1, to: s.upToUnits, units: r2(u), rate: s.rate, amount: r2(u * s.rate) })
    if (s.upToUnits === null) break
    prev = s.upToUnits
  }
  return out
}

const sumSlabs = (lines: BillBreakdown['slabs']) => lines.reduce((a, l) => a + l.units * l.rate, 0)

/** LV-1 fixed charge, telescopic on load: e.g. 7 kW = 5 × ₹20 + 2 × ₹30. */
export function telescopicFixed(loadKw: number, tiers: ElectricityTariffSettings['domesticFixed']): number {
  let total = 0
  let prev = 0
  for (const t of tiers) {
    if (loadKw <= prev) break
    const top = t.upToKw === null ? loadKw : Math.min(loadKw, t.upToKw)
    total += Math.max(0, top - prev) * t.perKw
    if (t.upToKw === null) break
    prev = t.upToKw
  }
  return total
}

function tariffFor(cat: ConnectionCategory, e: ElectricityTariffSettings) {
  switch (cat) {
    case 'lv1':
      return { energy: e.domesticEnergy, fixed: (kw: number) => telescopicFixed(kw, e.domesticFixed), duty: e.dutyDomesticPercent }
    case 'lv2.1':
      return { energy: e.lv21Energy, fixed: (kw: number) => kw * e.lv21FixedPerKw, duty: e.dutyNonDomesticPercent }
    case 'lv2.2a':
      return { energy: e.lv22SmallEnergy, fixed: (kw: number) => kw * e.lv22SmallDemandPerKw, duty: e.dutyNonDomesticPercent }
    case 'lv2.2b':
      return { energy: e.lv22LargeEnergy, fixed: (kw: number) => kw * e.lv22LargeDemandPerKw, duty: e.dutyNonDomesticPercent }
    case 'lv5.2.1':
      return { energy: e.lv5SmallEnergy, fixed: (kw: number) => kw * e.lv5SmallDemandPerKw, duty: e.dutyIndustrialPercent }
    case 'lv5.2.2':
      return { energy: e.lv5LargeEnergy, fixed: (kw: number) => kw * e.lv5LargeDemandPerKw, duty: e.dutyIndustrialPercent }
    case 'hv3':
      return { energy: [{ upToUnits: null, rate: e.hv3EnergyPerKvah }], fixed: (kw: number) => kw * e.hv3DemandPerKva, duty: e.dutyIndustrialPercent }
  }
}

export function resolveLoad(propertyType: PropertyType, loadKw: number | null | undefined, e: ElectricityTariffSettings): number {
  if (loadKw && loadKw > 0) return loadKw
  if (propertyType === 'industrial') return e.defaultLoadKw.industrial ?? 25
  return propertyType === 'commercial' ? e.defaultLoadKw.commercial : e.defaultLoadKw.domestic
}

/** Full CSPDCL bill for one month's consumption. */
export function computeBill(unitsIn: number, opts: BillOptions, e: ElectricityTariffSettings): BillBreakdown {
  const units = Math.max(0, Number.isFinite(unitsIn) ? unitsIn : 0)
  const loadKw = resolveLoad(opts.propertyType, opts.loadKw, e)
  const category = connectionCategory(opts.propertyType, loadKw, e)
  const t = tariffFor(category, e)

  const slabs = slabCharges(units, t.energy)
  const energyExact = sumSlabs(slabs)
  const fixedExact =
    opts.fixedChargesOverride != null && opts.fixedChargesOverride >= 0 ? opts.fixedChargesOverride : t.fixed(loadKw)
  const fppasPercent = opts.fppasPercent != null && opts.fppasPercent >= 0 ? opts.fppasPercent : e.fppasPercent
  const fppasExact = (energyExact * fppasPercent) / 100
  const dutyExact = (energyExact * t.duty) / 100

  // Bijli Bill Half / M-Urja — domestic (LV-1) homes only, not housing societies on a single connection.
  let rebateExact = 0
  const hb = e.halfBill
  if (hb.enabled && category === 'lv1' && opts.propertyType === 'residential' && units <= hb.maxUnits) {
    const coveredUnits = Math.min(units, hb.unitsCovered)
    const coveredEnergy = sumSlabs(slabCharges(coveredUnits, t.energy))
    const coveredFppas = (coveredEnergy * fppasPercent) / 100
    // Fixed charge is shared pro-rata between covered and uncovered units (all of it when units ≤ limit).
    const coveredFixed = units <= hb.unitsCovered ? fixedExact : fixedExact * (hb.unitsCovered / units)
    rebateExact = ((coveredEnergy + coveredFppas + coveredFixed) * hb.percent) / 100
  }

  const total = Math.max(0, energyExact + fixedExact + fppasExact + dutyExact - rebateExact)
  const step = e.roundTo > 0 ? e.roundTo : 1
  const payable = Math.round(total / step) * step
  return {
    category,
    units: r2(units),
    loadKw,
    slabs,
    energyCharges: r2(energyExact),
    fixedCharges: r2(fixedExact),
    fppasPercent,
    fppas: r2(fppasExact),
    dutyPercent: t.duty,
    duty: r2(dutyExact),
    rebate: r2(rebateExact),
    total: r2(total),
    payable,
    effectiveRate: units > 0 ? r2(payable / units) : 0,
  }
}

/**
 * Units consumed for a given bill amount (inverse of computeBill).
 * The bill is a non-decreasing step function of units (it jumps up where the half-bill rebate
 * shrinks or stops, e.g. at 401 units), so bisection finds the largest consumption whose bill does
 * not exceed the amount. A bill below the minimum (fixed) charge gives 0 units.
 */
export function unitsFromBill(amount: number, opts: BillOptions, e: ElectricityTariffSettings): number {
  if (!(amount > 0)) return 0
  const bill = (u: number) => computeBill(u, opts, e).total
  if (bill(0) >= amount) return 0
  let lo = 0
  let hi = 1000
  while (bill(hi) < amount && hi < 10_000_000) hi *= 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (bill(mid) <= amount) lo = mid
    else hi = mid
  }
  return Math.round(lo * 10) / 10
}
