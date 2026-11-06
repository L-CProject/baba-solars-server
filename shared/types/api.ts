/**
 * Request / response shapes of the HTTP API (shared by the frontend and server/).
 * Kept free of runtime code so the backend can import them.
 */
import type {
  AdminUser, Company, CompanySnapshot, Database, Enquiry, LineItem, Permission, PublicCollectionKey, Quotation, SiteContent,
} from './index'

/** Website form input. `createdAt` (optional) keeps the same submission time in admin, Sheet, email and WhatsApp. */
export type EnquiryInput = Omit<Enquiry, 'id' | 'status' | 'createdAt'> & { createdAt?: string }
/** Admin create/edit of an enquiry (manual, WhatsApp, phone, other external). */
export type EnquirySave = Omit<Enquiry, 'createdAt'> & { createdAt?: string }
export interface EnquiryImportResult { imported: number; failed: Array<{ row: number; errors: string[] }>; ids: string[] }
/** Website calculator "Request this quote": saved as an enquiry with the estimate attached. */
export type QuotationRequestInput = Pick<Quotation, 'customerName' | 'phone' | 'email' | 'city' | 'propertyType' | 'systemType' | 'capacityKw' | 'monthlyBill'>
  & { roofType?: Quotation['roofType']; tariff?: number; companyId?: string | null; quality?: Quotation['quality']; stateCode?: string; discomId?: string; monthlyUnits?: number; tariffVerified?: boolean; submissionId?: string; createdAt?: string }
/** Kept for older imports. */
export type QuotationInput = QuotationRequestInput

export type PublicSite = { version: string; content: SiteContent; companies: Company[] } & Pick<Database, PublicCollectionKey>
export interface DataSnapshot { schemaVersion: number; exportedAt: string; data: Record<string, unknown> }
export interface AuthProfile { user: AdminUser; permissions: Permission[] }
export interface UploadResult { url: string; path: string; mime: string; size: number }
export interface PricedPackage { company: CompanySnapshot; items: LineItem[]; price: number; exact: boolean; basis: string; panelCount: number }

export type QuotationSave = Omit<Quotation, 'id' | 'createdAt' | 'updatedAt' | 'quoteNumber' | 'source' | 'company' | 'subtotal' | 'taxableAmount' | 'cgst' | 'sgst' | 'igst' | 'taxTotal' | 'roundOff' | 'grandTotal' | 'taxBreakup' | 'estimatedCost' | 'netCost' | 'supplyType' | 'subsidy' | 'stateSubsidy' | 'annualGenerationKwh' | 'discount' | 'items' | 'quoteDate' | 'validUntil'> & {
  /** null = calculate from the subsidy rules */
  subsidy: number | null
  stateSubsidy: number | null
  annualGenerationKwh: number | null
  discount: number
  items: LineItem[]
  quoteDate: string
  validUntil: string | null
}

export interface InvoiceQuery {
  q?: string
  status?: 'draft' | 'issued' | 'cancelled'
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overdue'
  from?: string
  to?: string
  page?: number
  pageSize?: number
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'due_asc'
}

// ─── Admin dashboard analytics (GET /api/admin/dashboard/analytics) ─────────────
export type DashboardRangeKey = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom'
export interface DashboardCounts { total: number; new: number; contacted: number; closed: number; converted: number }
export interface DashboardAnalytics {
  /** The resolved filter (India time, inclusive days). `from` is null for "all time". */
  range: { key: DashboardRangeKey; label: string; from: string | null; to: string; firstEnquiryOn: string | null }
  generatedAt: string
  /** Enquiry counts are for the selected range; projects, services and offers are current totals. */
  cards: DashboardCounts & { recent7d: number; projects: number; projectsPublished: number; activeServices: number; publishedOffers: number }
  /** Same counts for the previous period of equal length — null when there is no data that old (no trend shown). */
  previous: (DashboardCounts & { from: string; to: string }) | null
  /** Latest 10 enquiries in the range, newest first. */
  recentLeads: Enquiry[]
  status: Array<{ status: Enquiry['status']; count: number }>
  types: { home: number; commercial: number; unspecified: number }
  capacity: Array<{ key: string; label: string; count: number }>
  /** Enquiries in the range with no capacity answer. */
  capacityNotGiven: number
  timeline: { granularity: 'day' | 'week' | 'month'; points: Array<{ bucket: string; total: number }> }
  /** Last 12 calendar months (independent of the filter). */
  monthly: Array<{ month: string; total: number; converted: number }>
}
