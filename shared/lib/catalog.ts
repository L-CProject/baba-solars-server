import type { CatalogItem, LineItem } from '@/types';
import { createId } from './id';

/** Snapshot current catalog values into an editable invoice line. */
export function catalogLine(item: CatalogItem): LineItem {
  return {
    id: createId('ln'),
    name: item.name,
    sku: item.sku ?? '',
    description: item.description,
    hsn: item.hsn,
    unit: item.unit,
    quantity: 1,
    rate: item.rate,
    discountPct: 0,
    gstRate: item.gstRate,
  };
}

/** Catalog categories as the admin sees them. */
export const CATALOG_CATEGORY_LABEL: Record<CatalogItem['category'], string> = {
  kit: 'Product',
  bos: 'Material',
  service: 'Service',
  expense: 'Labour & other charges',
}
export const CATALOG_CATEGORY_OPTIONS = (Object.keys(CATALOG_CATEGORY_LABEL) as CatalogItem['category'][]).map((value) => ({ value, label: CATALOG_CATEGORY_LABEL[value] }))

export function validateCatalogItem(item: CatalogItem): Record<string, string> {
  const e: Record<string, string> = {}
  if (!item.name.trim()) e.name = 'Enter a name.'
  if (!Number.isFinite(item.rate) || item.rate < 0) e.rate = 'Enter a rate of 0 or more.'
  if (!Number.isFinite(item.gstRate) || item.gstRate < 0 || item.gstRate > 28) e.gstRate = 'GST must be 0–28%.'
  if (!item.unit.trim()) e.unit = 'Enter a unit (e.g. PCS, MTR, KG).'
  if (item.hsn && !/^\d{4,10}$/.test(item.hsn)) e.hsn = 'HSN/SAC is 4–10 digits.'
  if (!CATALOG_CATEGORY_LABEL[item.category]) e.category = 'Choose a category.'
  return e
}
