import type { BrandSettings, CalculatorSettings, PlanTiersContent, SeoSettings, SiteContent } from '@/types'
import { mergeDefaults } from '@/lib/schemas'
import { DEFAULT_OFFERS } from '@/lib/offers'
import { CHHATTISGARH_RULE, SPECIAL_CATEGORY_STATE_CODES, SUBSIDY_RULES_CHECKED_ON } from '@/lib/subsidy'

/** Defaults for content sections added with the backend (used only if an older data file lacks them). */
export const DEFAULT_CALCULATOR: CalculatorSettings = {
  // 4.2 units/kW/day: south-facing, shade-free roof in Chhattisgarh after standard (~20 %) system losses.
  unitsPerKwPerDay: 4.2,
  // Engineering assumptions (not official data) — editable in Admin → Settings → Calculator.
  generation: {
    orientation: { south: 1, 'south-east': 0.96, 'south-west': 0.96, flat: 0.93, east: 0.86, west: 0.86, north: 0.72 },
    shading: { none: 1, light: 0.93, moderate: 0.82, heavy: 0.65 },
    extraLossPercent: 0,
    yieldByState: {},
  },
  // Used ONLY where no verified DISCOM tariff is configured; always labelled "needs confirmation".
  // Values = average ₹/unit (energy + fixed + FPPAS + duty) of the verified CSPDCL FY 2026-27 bill at typical use:
  // residential 300 units / 3 kW without the CG-only half-bill rebate, commercial 1,000 units / 10 kW,
  // industrial 5,000 units / 40 kW — see tests/unit/calculator.test.ts. They are NOT other DISCOMs' tariffs.
  indicativeTariff: { residential: 6.2, commercial: 12, industrial: 10.2 },
  defaultTariff: 6.8, exportTariff: 0, tariffEscalation: 3, panelDegradation: 0.5, co2KgPerUnit: 0.82, sqftPerKw: 90, priceBand: 7, maxKw: 500,
  // CSPDCL LV tariff — CSERC Tariff Schedule FY 2026-27, applicable from 1 July 2026.
  electricity: {
    enabled: true,
    label: 'CSPDCL FY 2026-27',
    domesticEnergy: [{ upToUnits: 100, rate: 4.4 }, { upToUnits: 200, rate: 4.5 }, { upToUnits: 400, rate: 6.0 }, { upToUnits: 600, rate: 7.0 }, { upToUnits: null, rate: 8.8 }],
    domesticFixed: [{ upToKw: 5, perKw: 20 }, { upToKw: 10, perKw: 30 }, { upToKw: null, perKw: 50 }],
    lv21Energy: [{ upToUnits: 100, rate: 6.5 }, { upToUnits: 400, rate: 7.6 }, { upToUnits: null, rate: 9.1 }],
    lv21FixedPerKw: 60,
    lv22SmallEnergy: [{ upToUnits: 400, rate: 7.5 }, { upToUnits: null, rate: 9.0 }],
    lv22SmallDemandPerKw: 130,
    lv22LargeEnergy: [{ upToUnits: null, rate: 8.4 }],
    lv22LargeDemandPerKw: 210,
    // LV-5 Industry, "other industries" (5.2.1 up to 25 HP / 18.7 kW, 5.2.2 above). Non-Bastar/Sarguja rates.
    lv5SmallEnergy: [{ upToUnits: null, rate: 6.35 }],
    lv5SmallDemandPerKw: 120,
    lv5LargeEnergy: [{ upToUnits: null, rate: 7.1 }],
    lv5LargeDemandPerKw: 150,
    lv5ThresholdKw: 18.7,
    lvMaxKw: 150,
    // HV-3 Other industrial, 11 kV, load factor > 15 %.
    hv3EnergyPerKvah: 7.85,
    hv3DemandPerKva: 400,
    fppasPercent: 10,
    dutyDomesticPercent: 11,
    dutyNonDomesticPercent: 17,
    // Electricity duty is set by the Chhattisgarh Electricity Duty Act, not the tariff order — confirm from a recent bill.
    dutyIndustrialPercent: 17,
    halfBill: { enabled: true, percent: 50, unitsCovered: 200, maxUnits: 400 },
    defaultLoadKw: { domestic: 3, commercial: 5, industrial: 25 },
    roundTo: 10,
  },
  costSlabs: [{ upToKw: 2, pricePerKw: 62000 }, { upToKw: 5, pricePerKw: 57000 }, { upToKw: 10, pricePerKw: 53000 }, { upToKw: 50, pricePerKw: 47000 }, { upToKw: null, pricePerKw: 43000 }],
  systemFactor: { 'on-grid': 1, hybrid: 1.45, 'off-grid': 1.6 },
  roofFactor: { rcc: 1, tin: 1.04, ground: 1.08 },
  // PM Surya Ghar CFA (MNRE) + state top-ups. Rates verified on SUBSIDY_RULES_CHECKED_ON; editable in Settings → Calculator.
  subsidy: {
    enabled: true, perKwUpTo2: 30000, perKwThird: 18000, cap: 78000,
    specialCategory: { perKwUpTo2: 33000, perKwThird: 19800, cap: 85800 },
    specialCategoryStates: SPECIAL_CATEGORY_STATE_CODES,
    housingSocietyPerKw: 18000, housingSocietyMaxKw: 500, hybridEligible: true,
    defaultStateCode: '22',
    states: [CHHATTISGARH_RULE],
    verifiedOn: SUBSIDY_RULES_CHECKED_ON,
  },
  disclaimer: '',
}

/** Normal vs Premium plans. Drone cleaning is a Premium-only benefit. */
export const DEFAULT_PLAN_TIERS: PlanTiersContent = {
  enabled: true,
  kicker: 'Normal or Premium',
  title: 'Two clear plans — pick what suits your roof',
  intro: 'Both plans are complete, installed on-grid systems with GST, structure, wiring, earthing, net-metering paperwork and subsidy help. Premium adds higher-grade equipment and drone-based panel cleaning.',
  normal: {
    name: 'Normal',
    tagline: 'Standard installation with reliable, ALMM-listed equipment',
    priceLabel: '',
    badge: '',
    features: [
      'Mono PERC bifacial solar panels',
      'Reliable on-grid inverter',
      'GI mounting structure',
      'DC/AC wiring, ACDB/DCDB, earthing & lightning arrester',
      'Installation, testing & commissioning',
      'Net-metering & PM Surya Ghar subsidy paperwork',
      '6 months free manual panel cleaning',
    ],
    droneCleaning: false,
    ctaLabel: 'Get a Normal quote',
  },
  premium: {
    name: 'Premium',
    tagline: 'Everything in Normal, plus higher-grade equipment and drone cleaning',
    priceLabel: '',
    badge: 'Includes drone cleaning',
    features: [
      'Everything in the Normal plan',
      'N-type TOPCon bifacial solar panels',
      'Premium on-grid inverter with Wi-Fi monitoring',
      'Heavy hot-dip galvanised structure',
      'Longer panel & inverter warranties',
      'Drone-based solar panel cleaning service',
    ],
    droneCleaning: true,
    ctaLabel: 'Get a Premium quote',
  },
  rows: [
    { id: 'r-panels', label: 'Solar panels', normal: 'Mono PERC bifacial', premium: 'N-type TOPCon bifacial' },
    { id: 'r-inverter', label: 'Inverter', normal: 'Reliable on-grid inverter', premium: 'Premium inverter with Wi-Fi monitoring' },
    { id: 'r-structure', label: 'Mounting structure', normal: 'GI structure', premium: 'Heavy hot-dip galvanised' },
    { id: 'r-install', label: 'Installation, wiring & earthing', normal: 'Included', premium: 'Included' },
    { id: 'r-paperwork', label: 'Net-metering & subsidy paperwork', normal: 'Included', premium: 'Included' },
    { id: 'r-care', label: 'First 6 months panel cleaning', normal: 'Manual cleaning, free', premium: 'Manual cleaning, free' },
    { id: 'r-warranty', label: 'Performance warranty (panels)', normal: 'As per manufacturer (typically 25 yrs)', premium: 'As per manufacturer (typically 30 yrs)' },
  ],
  droneTitle: 'Drone cleaning is a Premium benefit',
  droneText: 'Premium customers get drone-based solar panel cleaning — useful for high, large or hard-to-reach roofs where manual cleaning is slow or risky. It is not part of the Normal plan; Normal customers can book drone cleaning separately.',
  footnote: 'Exact equipment, warranty and price depend on the brand and size you choose — see the company-wise prices below.',
}

export const DEFAULT_BRAND: BrandSettings = { logoUrl: '', logoMarkUrl: '', faviconUrl: '', primaryColor: '' }

const page = { title: '', description: '' }
export const DEFAULT_SEO: SeoSettings = {
  siteTitle: '', siteDescription: '', keywords: '', ogImage: '', siteUrl: '', googleSiteVerification: '',
  pages: { home: page, about: page, services: page, pricing: page, calculator: page, projects: page, gallery: page, faqs: page, contact: page, droneCleaning: page, suryaGhar: page },
}

export function withContentDefaults(c: Partial<SiteContent>): SiteContent {
  return mergeDefaults({ brand: DEFAULT_BRAND, seo: DEFAULT_SEO, calculator: DEFAULT_CALCULATOR, plans: DEFAULT_PLAN_TIERS, offers: DEFAULT_OFFERS } as unknown as SiteContent, c)
}
