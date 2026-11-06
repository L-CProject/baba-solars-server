import { z } from 'zod'

/**
 * Business settings patch. The document is deep (GST, bank, numbering, templates, package breakdown),
 * so the shape is checked here and the business rules (GSTIN, IFSC, prefixes, 100 % breakdown) in the service.
 */
export const businessPatch = z.record(z.string(), z.unknown()).refine((o) => JSON.stringify(o).length < 3_000_000, 'Settings are too large.')
