import type { SiteContent } from '@/types'
import siteData from '@/mocks/seed/site-data.json'
import { withContentDefaults } from '@/data/settings-defaults'
import { seedCompanies } from '@/mocks/seed/companies'
import { seedCatalog } from '@/mocks/seed/catalog'
import { seedBusiness } from '@/mocks/seed/business'

/**
 * The website's original content (the same data the browser-only version shipped with in
 * src/mocks/seed). Used once to fill an empty database, and by "Reset website content".
 * Demo documents (src/mocks/seed/demo.ts) are test fixtures and are never imported.
 */
export function bundledSeed(): Record<string, unknown> {
  const seed = (siteData as { data: Record<string, unknown> }).data
  const withStatus = (l: unknown) => (l as Array<Record<string, unknown>>).map((x, i) => ({ status: 'published', order: i + 1, ...x }))
  return structuredClone({
    content: withContentDefaults(seed.content as SiteContent),
    pricingPlans: seed.pricingPlans, capacityPlans: seed.capacityPlans, services: seed.services, projects: withStatus(seed.projects),
    testimonials: withStatus(seed.testimonials), faqs: withStatus(seed.faqs), heroSlides: seed.heroSlides, gallery: seed.gallery,
    companies: seedCompanies, catalog: seedCatalog, business: seedBusiness,
  })
}
