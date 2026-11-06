import { z } from 'zod'

const quality = z.object({
  label: z.string().max(60), panelModel: z.string().max(120), panelTechnology: z.string().max(120), panelWattage: z.number().finite(),
  inverterBrand: z.string().max(120), inverterModel: z.string().max(120), structure: z.string().max(300),
  panelWarrantyYears: z.number().min(0).max(50), performanceWarrantyYears: z.number().min(0).max(50), inverterWarrantyYears: z.number().min(0).max(50),
})

export const companyBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().max(120),
  description: z.string().max(2000).default(''),
  logoUrl: z.string().max(3_000_000).default(''),
  isActive: z.boolean().default(true),
  order: z.number().int().min(0).max(100000).default(0),
  pricesIncludeGst: z.boolean().default(true),
  packages: z.array(z.object({ capacityKw: z.number().finite(), normal: z.number().finite(), premium: z.number().finite() })).max(200),
  qualities: z.object({ normal: quality, premium: quality }),
  workmanshipWarrantyYears: z.number().min(0).max(50),
  kitIncludes: z.array(z.string().max(200)).max(50).default([]),
  updatedAt: z.string().optional(),
})

export const priceQuoteBody = z.object({
  capacityKw: z.number().positive().max(100000),
  quality: z.enum(['normal', 'premium']),
  supplyType: z.enum(['intra', 'inter']).default('intra'),
})
