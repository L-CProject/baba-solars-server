import type { BreakdownRow, Company, CompanySnapshot, LineItem, PackagePrice, Quality } from '@/types'
import { computeTotals } from './totals'

/**
 * Company-wise package pricing.
 *  • packagePrice(): price for a company, size and quality — exact for listed packages
 *    (3 / 5 / 8 / 10 kW), interpolated between them, per-kW rate of the nearest package outside.
 *  • packageLines(): itemises that price into a GST-correct bill of materials whose grand total
 *    equals the package price exactly (when prices include GST).
 * Pure functions: the mock layer, the quotation form, the calculator and the pricing page all use them.
 */
export const QUALITIES: Quality[] = ['normal', 'premium']
export const QUALITY_LABEL: Record<Quality, string> = { normal: 'Normal', premium: 'Premium' }

/**
 * Default component split, from the client's Economy / Premium package breakdowns
 * (8 kW Waaree, mid-points of each range). Panels & inverter 5 % GST, the rest 18 %.
 */
export const DEFAULT_BREAKDOWN: Record<Quality, BreakdownRow[]> = {
  normal: [
    { key: 'modules', name: 'Solar PV modules', share: 56.3, gstRate: 5, hsn: '85414300' },
    { key: 'inverter', name: 'On-grid solar inverter', share: 15.5, gstRate: 5, hsn: '85044090' },
    { key: 'structure', name: 'GI mounting structure', share: 11.7, gstRate: 18, hsn: '73089090' },
    { key: 'cables', name: 'DC / AC cables & wiring', share: 4.8, gstRate: 18, hsn: '85446090' },
    { key: 'protection', name: 'ACDB, DCDB & protection (LA, earthing)', share: 3.9, gstRate: 18, hsn: '85371000' },
    { key: 'installation', name: 'Installation & labour', share: 4.9, gstRate: 18, hsn: '995442' },
    { key: 'transport', name: 'Transport & other expenses', share: 2.9, gstRate: 18, hsn: '996511' },
  ],
  premium: [
    { key: 'modules', name: 'Solar PV modules', share: 56.4, gstRate: 5, hsn: '85414300' },
    { key: 'inverter', name: 'Premium on-grid solar inverter', share: 16.7, gstRate: 5, hsn: '85044090' },
    { key: 'structure', name: 'Heavy GI mounting structure', share: 11.1, gstRate: 18, hsn: '73089090' },
    { key: 'cables', name: 'DC / AC cables & wiring', share: 4.8, gstRate: 18, hsn: '85446090' },
    { key: 'protection', name: 'ACDB, DCDB & protection (LA, earthing)', share: 4.0, gstRate: 18, hsn: '85371000' },
    { key: 'installation', name: 'Installation & labour', share: 4.6, gstRate: 18, hsn: '995442' },
    { key: 'transport', name: 'Transport & other expenses', share: 2.4, gstRate: 18, hsn: '996511' },
  ],
}

export const breakdownTotal = (rows: BreakdownRow[]) => Math.round(rows.reduce((s, r) => s + r.share, 0) * 100) / 100

const sorted = (p: PackagePrice[]) => [...p].filter((x) => x.capacityKw > 0).sort((a, b) => a.capacityKw - b.capacityKw)
const round1000 = (n: number) => Math.round(n / 1000) * 1000

export interface PriceResult {
  price: number
  /** true when the size is one of the listed packages */
  exact: boolean
  /** How the price was found, for display. */
  basis: string
  perKw: number
}

export function packagePrice(company: Pick<Company, 'packages'>, capacityKw: number, quality: Quality): PriceResult | null {
  const list = sorted(company.packages)
  if (!list.length || !(capacityKw > 0)) return null
  const hit = list.find((p) => Math.abs(p.capacityKw - capacityKw) < 1e-9)
  if (hit) return { price: hit[quality], exact: true, basis: `${hit.capacityKw} kW package price`, perKw: hit[quality] / hit.capacityKw }
  const first = list[0]
  const last = list[list.length - 1]
  let price: number
  let basis: string
  if (capacityKw < first.capacityKw) {
    price = (first[quality] / first.capacityKw) * capacityKw
    basis = `per-kW rate of the ${first.capacityKw} kW package`
  } else if (capacityKw > last.capacityKw) {
    price = (last[quality] / last.capacityKw) * capacityKw
    basis = `per-kW rate of the ${last.capacityKw} kW package`
  } else {
    const hi = list.findIndex((p) => p.capacityKw > capacityKw)
    const a = list[hi - 1]
    const b = list[hi]
    const t = (capacityKw - a.capacityKw) / (b.capacityKw - a.capacityKw)
    price = a[quality] + (b[quality] - a[quality]) * t
    basis = `between the ${a.capacityKw} kW and ${b.capacityKw} kW packages`
  }
  const p = round1000(price)
  return { price: p, exact: false, basis: `Estimated ${basis}`, perKw: p / capacityKw }
}

export const panelCount = (capacityKw: number, wattage: number) => Math.max(1, Math.ceil((capacityKw * 1000) / Math.max(1, wattage) - 1e-9))

export function snapshotOf(c: Company, quality: Quality): CompanySnapshot {
  const q = c.qualities[quality]
  return {
    id: c.id, name: c.name, quality, panelModel: q.panelModel, panelTechnology: q.panelTechnology, panelWattage: q.panelWattage,
    panelWarrantyYears: q.panelWarrantyYears, performanceWarrantyYears: q.performanceWarrantyYears, inverterBrand: q.inverterBrand,
    inverterModel: q.inverterModel, inverterWarrantyYears: q.inverterWarrantyYears, structureDetails: q.structure,
    workmanshipWarrantyYears: c.workmanshipWarrantyYears,
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Bill of materials for a package. With GST-inclusive prices, each component gets its share of
 * the price and the GST is taken out of it, so CGST+SGST (or IGST) plus taxable value adds up to
 * exactly the package price (the last line absorbs paise rounding).
 */
export function packageLines(c: Company, capacityKw: number, quality: Quality, price: number, rows: BreakdownRow[], supplyType: 'intra' | 'inter' = 'intra'): LineItem[] {
  const q = c.qualities[quality]
  const panels = panelCount(capacityKw, q.panelWattage)
  const total = breakdownTotal(rows) || 100
  const lines: LineItem[] = rows.map((row) => {
    const amount = (price * row.share) / total
    const taxable = c.pricesIncludeGst ? amount / (1 + row.gstRate / 100) : amount
    let quantity = 1
    let unit = 'LOT'
    let description = ''
    let name = row.name
    switch (row.key) {
      case 'modules':
        quantity = panels; unit = 'NOS'
        name = `${c.name} ${q.panelWattage} Wp ${q.panelTechnology} module`
        description = `${q.panelModel} · ${panels} × ${q.panelWattage} Wp = ${r2((panels * q.panelWattage) / 1000)} kWp DC`
        break
      case 'inverter':
        unit = 'NOS'; name = `${q.inverterBrand} ${capacityKw} kW ${q.inverterModel}`.replace(/\s+/g, ' ')
        break
      case 'structure':
        quantity = capacityKw; unit = 'kW'; description = q.structure
        break
      case 'protection':
        unit = 'SET'; description = c.kitIncludes.join(', ')
        break
      case 'installation':
        quantity = capacityKw; unit = 'kW'; description = 'Installation, testing & commissioning'
        break
      default:
        break
    }
    return { id: `pk-${row.key}`, name, description, hsn: row.hsn, unit, quantity, rate: r2(taxable / quantity), discountPct: 0, gstRate: row.gstRate }
  })
  if (!c.pricesIncludeGst || !lines.length) return lines
  // Make the grand total match the price list to the rupee.
  for (let i = 0; i < 3; i++) {
    const t = computeTotals(lines, { supplyType, roundOff: false })
    const diff = price - t.grandTotal
    if (Math.abs(diff) < 0.005) break
    const last = lines[lines.length - 1]
    last.rate = r2(last.rate + diff / (1 + last.gstRate / 100) / last.quantity)
  }
  return lines
}

/** All listed package sizes across companies (for selects and tables). */
export function packageSizes(companies: Company[]): number[] {
  return [...new Set(companies.flatMap((c) => c.packages.map((p) => p.capacityKw)))].sort((a, b) => a - b)
}
