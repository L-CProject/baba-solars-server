import type { Company } from '@/types'

/**
 * COMPANY-WISE PACKAGE PRICES (client price list, Oct 2026).
 * Complete installed system price per package, INCLUDING GST (`pricesIncludeGst: true`).
 * Edit in Admin → Companies & rates. Sizes between packages are interpolated (src/lib/pricing.ts).
 *
 * Quality tiers follow the supplier sales orders (Shakti Solar, SO 3844 / 3861):
 *   Normal  = 540 Wp Mono PERC bifacial kit
 *   Premium = 580 Wp N-type TOPCon bifacial kit
 */
const KIT = ['ACDB + DCDB with SPD/MCB', '3 earthing rods + 15 kg chemical bag', 'Lightning arrester (14 mm, 1 m)', '3 earthing pit covers', 'MC4 connectors']

export const seedCompanies: Company[] = [
  {
    id: 'co-waaree', name: 'Waaree', description: 'Waaree Energies — Tier-1, ALMM listed, India’s largest module maker.', logoUrl: '',
    isActive: true, order: 1, pricesIncludeGst: true, workmanshipWarrantyYears: 5, kitIncludes: KIT,
    packages: [
      { capacityKw: 3, normal: 160000, premium: 210000 },
      { capacityKw: 5, normal: 260000, premium: 330000 },
      { capacityKw: 8, normal: 480000, premium: 550000 },
      { capacityKw: 10, normal: 580000, premium: 730000 },
    ],
    qualities: {
      normal: { label: 'Normal', panelModel: 'Bi-55 Bifacial', panelTechnology: 'Mono PERC bifacial', panelWattage: 540, inverterBrand: 'Waaree', inverterModel: 'On-grid string inverter', structure: 'GI structure, 80×40 legs, 41×41 rails', panelWarrantyYears: 12, performanceWarrantyYears: 25, inverterWarrantyYears: 5 },
      premium: { label: 'Premium', panelModel: 'TOPCon Bifacial', panelTechnology: 'N-type TOPCon bifacial', panelWattage: 580, inverterBrand: 'Waaree', inverterModel: 'Premium on-grid inverter with Wi-Fi monitoring', structure: 'Heavy GI structure, hot-dip galvanised', panelWarrantyYears: 15, performanceWarrantyYears: 30, inverterWarrantyYears: 8 },
    },
  },
  {
    id: 'co-adani', name: 'Adani Solar', description: 'Adani Solar — ALMM listed, made in Mundra.', logoUrl: '',
    isActive: true, order: 2, pricesIncludeGst: true, workmanshipWarrantyYears: 5, kitIncludes: KIT,
    packages: [
      { capacityKw: 3, normal: 170000, premium: 220000 },
      { capacityKw: 5, normal: 270000, premium: 350000 },
      { capacityKw: 8, normal: 490000, premium: 570000 },
      { capacityKw: 10, normal: 590000, premium: 740000 },
    ],
    qualities: {
      normal: { label: 'Normal', panelModel: 'Shine Bifacial', panelTechnology: 'Mono PERC bifacial', panelWattage: 545, inverterBrand: 'Growatt', inverterModel: 'MIN TL-X on-grid', structure: 'GI structure, 80×40 legs, 41×41 rails', panelWarrantyYears: 12, performanceWarrantyYears: 25, inverterWarrantyYears: 5 },
      premium: { label: 'Premium', panelModel: 'Shine TOPCon', panelTechnology: 'N-type TOPCon bifacial', panelWattage: 580, inverterBrand: 'Sungrow', inverterModel: 'SG-RS with Wi-Fi monitoring', structure: 'Heavy GI structure, hot-dip galvanised', panelWarrantyYears: 15, performanceWarrantyYears: 30, inverterWarrantyYears: 10 },
    },
  },
  {
    id: 'co-tata', name: 'Tata Power Solar', description: 'Tata Power Solar — DCR modules, eligible for PM Surya Ghar.', logoUrl: '',
    isActive: true, order: 3, pricesIncludeGst: true, workmanshipWarrantyYears: 5, kitIncludes: KIT,
    packages: [
      { capacityKw: 3, normal: 170000, premium: 220000 },
      { capacityKw: 5, normal: 270000, premium: 350000 },
      { capacityKw: 8, normal: 490000, premium: 570000 },
      { capacityKw: 10, normal: 590000, premium: 740000 },
    ],
    qualities: {
      normal: { label: 'Normal', panelModel: 'TP DCR Mono PERC', panelTechnology: 'Mono PERC (DCR)', panelWattage: 540, inverterBrand: 'Polycab', inverterModel: 'PSIS on-grid', structure: 'GI structure, 80×40 legs, 41×41 rails', panelWarrantyYears: 12, performanceWarrantyYears: 25, inverterWarrantyYears: 5 },
      premium: { label: 'Premium', panelModel: 'TP DCR TOPCon Bifacial', panelTechnology: 'N-type TOPCon bifacial (DCR)', panelWattage: 575, inverterBrand: 'Tata Power', inverterModel: 'Premium on-grid with Wi-Fi monitoring', structure: 'Heavy GI structure, hot-dip galvanised', panelWarrantyYears: 15, performanceWarrantyYears: 30, inverterWarrantyYears: 8 },
    },
  },
]
