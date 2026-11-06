import { z } from 'zod'

const n = z.number().finite()
/** Same inputs as the website calculator (src/lib/calculator.ts → CalculatorInput). */
export const estimateBody = z.object({
  mode: z.enum(['bill', 'units']).optional(),
  monthlyBill: n.min(0).max(1e8).default(0),
  monthlyUnits: n.min(0).max(1e8).nullish(),
  fixedCharges: n.min(0).max(1e7).nullish(),
  tariff: n.min(0).max(100).default(0),
  fppasPercent: n.min(0).max(100).nullish(),
  propertyType: z.enum(['residential', 'commercial', 'industrial', 'housing-society']),
  systemType: z.enum(['on-grid', 'hybrid', 'off-grid']).default('on-grid'),
  roofType: z.enum(['rcc', 'tin', 'ground']).default('rcc'),
  capacityOverride: n.min(0).max(100000).nullish(),
  sanctionedLoadKw: n.min(0).max(100000).nullish(),
  roofAreaSqft: n.min(0).max(1e7).nullish(),
  costOverride: n.min(0).max(1e10).nullish(),
  stateCode: z.string().max(4).nullish(),
  country: z.string().max(10).nullish(),
  discomId: z.string().max(40).nullish(),
  roofDirection: z.enum(['south', 'south-east', 'south-west', 'east', 'west', 'flat', 'north']).nullish(),
  shading: z.enum(['none', 'light', 'moderate', 'heavy']).nullish(),
})
