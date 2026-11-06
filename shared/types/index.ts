/** Domain types shared by the public site, admin panel and API layer. */

export type PublishStatus = 'published' | 'draft';

export type IconName =
  | 'sun'
  | 'home'
  | 'building'
  | 'factory'
  | 'battery'
  | 'droplets'
  | 'wrench'
  | 'shield'
  | 'clipboard'
  | 'gauge'
  | 'plug'
  | 'leaf'
  | 'file'
  | 'zap'
  | 'award'
  | 'users'
  | 'headset'
  | 'drone'
  | 'calendar'
  | 'sparkles';

export type PlanCategory = 'residential' | 'commercial' | 'maintenance';

export interface PricingPlan {
  id: string;
  name: string;
  category: PlanCategory;
  /** System size in kW; null for service plans like AMC */
  capacityKw: number | null;
  priceMin: number;
  priceMax: number;
  /** Estimated central subsidy in INR (0 if not applicable) */
  subsidy: number;
  /** e.g. "per visit", "per year". Empty for one-time system prices */
  priceUnit: string;
  idealFor: string;
  monthlyGeneration: string;
  roofArea: string;
  features: string[];
  featured: boolean;
  /** Ribbon text when featured. Empty = automatic ("Most chosen" / "Included free"). */
  badge: string;
  /** Button label. Empty = the default from Pricing page text. */
  ctaLabel: string;
  status: PublishStatus;
  order: number;
  updatedAt: string;
}

export type CapacitySegment = 'residential' | 'commercial' | 'industrial';

export interface SpecRow {
  label: string;
  value: string;
}

/** "Solar plans by capacity" cards on the Pricing page (specs only, price on survey). */
export interface CapacityPlan {
  id: string;
  segment: CapacitySegment;
  name: string;
  subtitle: string;
  /** Display text, e.g. "3 kW" or "10 kW – 50 kW" */
  capacity: string;
  specs: SpecRow[];
  features: string[];
  featured: boolean;
  /** Ribbon shown on a featured card */
  badge: string;
  /** Line above the button, e.g. "Price: on free site survey" */
  priceNote: string;
  ctaLabel: string;
  status: PublishStatus;
  order: number;
  updatedAt: string;
}

export type ServiceGroup = 'installation' | 'maintenance' | 'support';

export interface Service {
  id: string;
  slug: string;
  title: string;
  group: ServiceGroup;
  icon: IconName;
  summary: string;
  description: string;
  includes: string[];
  startingPrice: string;
  /** Optional ribbon shown on the card, e.g. "New" or "Free for 6 months" */
  highlight?: string;
  status: PublishStatus;
  order: number;
}

export type ProjectCategory =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'maintenance';

export interface Project {
  id: string;
  title: string;
  location: string;
  category: ProjectCategory;
  capacityKw: number;
  /** YYYY-MM */
  completedOn: string;
  summary: string;
  highlights: string[];
  /** Optional photo URL. A generated illustration is shown when empty. */
  imageUrl: string;
  featured: boolean;
  status: PublishStatus;
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  system: string;
  rating: number;
  quote: string;
  status?: PublishStatus;
  order?: number;
}

export interface Faq {
  id: string;
  category: 'general' | 'pricing' | 'subsidy' | 'maintenance';
  question: string;
  answer: string;
  status?: PublishStatus;
  order?: number;
}

/**
 * Lead pipeline. Open: new → pending → contacted → follow-up → interested → site-visit → proposal → quoted.
 * Closed: converted (customer booked), not-interested (lost, with a reason), closed (duplicate / invalid / no response).
 * Older data used 'won' and 'lost'; normalizeEnquiry() maps them to 'converted' and 'not-interested'.
 */
export type EnquiryStatus =
  | 'new'
  | 'pending'
  | 'contacted'
  | 'follow-up'
  | 'interested'
  | 'site-visit'
  | 'proposal'
  | 'quoted'
  | 'converted'
  | 'not-interested'
  | 'closed';
/** Website forms: contact, calculator, pricing, service. Admin-entered: whatsapp … manual. Excel: import. */
export type EnquirySource =
  | 'contact'
  | 'calculator'
  | 'pricing'
  | 'service'
  | 'whatsapp'
  | 'phone'
  | 'walk-in'
  | 'referral'
  | 'social'
  | 'other'
  | 'manual'
  | 'import';
export type EnquiryOrigin = 'website' | 'admin' | 'import';
/** Website contact form choice: "Home" or "Commercial" (added with the integrations release). */
export type EnquiryType = 'home' | 'commercial';

/** Calculator figures attached to a website quote request. */
export interface EnquiryEstimate {
  capacityKw: number;
  systemType: SystemType;
  propertyType: PropertyType;
  roofType?: RoofType;
  monthlyBill: number;
  monthlyUnits?: number;
  estimatedCost: number;
  subsidy: number;
  netCost: number;
  companyId?: string | null;
  quality?: Quality;
  stateCode?: string;
  discomId?: string;
  tariffVerified?: boolean;
}

/** Non-numeric answers to "Solar capacity" on the contact form. */
export type CapacityChoice = 'custom' | 'not-sure';

export interface Enquiry {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** City / area / location */
  city: string;
  /** What the customer needs (requirement) */
  service: string;
  message: string;
  source: EnquirySource;
  status: EnquiryStatus;
  createdAt: string;
  // Added in data schema 6 (optional so older records stay valid).
  origin?: EnquiryOrigin;
  address?: string;
  state?: string;
  pincode?: string;
  propertyType?: PropertyType;
  capacityKw?: number | null;
  monthlyBill?: number | null;
  /** Internal notes (not shown to the customer). */
  notes?: string;
  followUpOn?: string | null;
  estimate?: EnquiryEstimate | null;
  updatedAt?: string;
  /** Unique id (UUID) of a website submission — prevents duplicates in admin, Sheet and email. */
  submissionId?: string;
  /** Home / Commercial choice from the website contact form. */
  enquiryType?: EnquiryType;
  /** Capacity answer that is not a number: 'custom' (Other / Custom) or 'not-sure' (Not sure yet). */
  capacityChoice?: CapacityChoice | null;
  // Lead management (backend).
  /** Staff member responsible for this lead (user id). */
  assignedTo?: string | null;
  /** Name of the assigned staff member (read-only, from the server). */
  assignedToName?: string | null;
  /** Last call / WhatsApp / email / meeting with the customer. */
  lastContactedAt?: string | null;
  /** Number of logged calls, WhatsApp messages, emails and meetings. */
  contactCount?: number;
}

/** What happened on a lead. Every change is kept as an activity, so history is never lost. */
export type EnquiryActivityType =
  | 'created'
  | 'updated'
  | 'status'
  | 'call'
  | 'whatsapp'
  | 'email'
  | 'meeting'
  | 'note'
  | 'follow-up-scheduled'
  | 'follow-up-done'
  | 'follow-up-cancelled'
  | 'assigned'
  | 'imported';
/** Result of a call / message attempt. */
export type ContactOutcome = 'connected' | 'no-answer' | 'busy' | 'switched-off' | 'wrong-number' | 'callback-requested' | 'message-sent' | 'replied';

export interface EnquiryActivity {
  id: string;
  enquiryId: string;
  type: EnquiryActivityType;
  outcome: ContactOutcome | null;
  fromStatus: EnquiryStatus | null;
  toStatus: EnquiryStatus | null;
  note: string;
  actorId: string | null;
  actorName: string;
  createdAt: string;
}

export type FollowUpStatus = 'pending' | 'done' | 'cancelled';
export interface FollowUp {
  id: string;
  enquiryId: string;
  dueOn: string;
  note: string;
  status: FollowUpStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** One enquiry with its full history (admin / owner detail view). */
export interface EnquiryDetail {
  enquiry: Enquiry;
  activities: EnquiryActivity[];
  followUps: FollowUp[];
}

/** Server-side paginated list (every admin table). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LeadStats {
  total: number;
  byStatus: Record<EnquiryStatus, number>;
  open: number;
  new: number;
  pending: number;
  contacted: number;
  converted: number;
  followUpsDue: number;
  followUpsOverdue: number;
  thisMonth: number;
  conversionRate: number;
  bySource: Array<{ source: EnquirySource; count: number }>;
  trend: Array<{ month: string; total: number; converted: number }>;
}

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';

/** A proposal is prepared before a formal quotation (scope, system design, indicative price). */
export interface Proposal {
  id: string;
  proposalNumber: string;
  enquiryId: string | null;
  quotationId: string | null;
  status: ProposalStatus;
  proposalDate: string;
  validUntil: string;
  title: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  propertyType: PropertyType;
  systemType: SystemType;
  roofType: RoofType;
  capacityKw: number;
  monthlyBill: number;
  consumerNumber: string;
  discom: string;
  companyId: string | null;
  quality: Quality;
  /** Products, materials, services and other charges. */
  items: LineItem[];
  discount: number;
  /** Totals (recomputed on every save). */
  subtotal: number;
  taxableAmount: number;
  taxTotal: number;
  grandTotal: number;
  subsidy: number;
  stateSubsidy: number;
  netCost: number;
  annualGenerationKwh: number;
  scope: string[];
  paymentTerms: string;
  terms: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus = 'pending' | 'sent' | 'accepted' | 'rejected';
export type SystemType = 'on-grid' | 'hybrid' | 'off-grid';
export type PropertyType = 'residential' | 'commercial' | 'industrial' | 'housing-society';
/** Calculator consumer category (housing society is a residential sub-type). */
export type ConsumerCategory = 'residential' | 'commercial' | 'industrial';
/** Direction the panels face (India is in the northern hemisphere: south is best). */
export type RoofDirection = 'south' | 'south-east' | 'south-west' | 'east' | 'west' | 'flat' | 'north';
export type ShadingLevel = 'none' | 'light' | 'moderate' | 'heavy';
export type RoofType = 'rcc' | 'tin' | 'ground';

/** One price line on a quotation or invoice (amounts are computed by the server). */
export interface LineItem {
  id: string;
  name: string;
  sku?: string;
  description: string;
  hsn: string;
  unit: string;
  quantity: number;
  rate: number;
  discountPct: number;
  gstRate: number;
}

export interface TaxBreakup {
  gstRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface CompanySnapshot {
  id: string;
  name: string;
  quality?: Quality;
  panelModel: string;
  panelTechnology: string;
  panelWattage: number;
  panelWarrantyYears: number;
  performanceWarrantyYears: number;
  inverterBrand: string;
  inverterModel: string;
  inverterWarrantyYears: number;
  structureDetails: string;
  workmanshipWarrantyYears: number;
}

export interface Quotation {
  id: string;
  quoteNumber?: string | null;
  /** Enquiry / proposal this quotation came from (kept through re-edits). */
  enquiryId?: string | null;
  proposalId?: string | null;
  source?: 'website' | 'admin';
  quoteDate?: string;
  validUntil?: string | null;
  customerName: string;
  phone: string;
  email: string;
  city: string;
  address?: string;
  state?: string;
  gstin?: string;
  consumerNumber?: string;
  discom?: string;
  sanctionedLoadKw?: number | null;
  propertyType: PropertyType;
  systemType: SystemType;
  roofType?: RoofType;
  capacityKw: number;
  monthlyBill: number;
  annualGenerationKwh?: number;
  companyId?: string | null;
  company?: CompanySnapshot | null;
  /** Material quality tier chosen for the package. */
  quality?: Quality;
  /** Package price from the company price list (incl. GST) when the quote was priced. */
  packagePrice?: number | null;
  items?: LineItem[];
  supplyType?: 'intra' | 'inter';
  discount?: number;
  subtotal?: number;
  taxableAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  taxTotal?: number;
  roundOff?: number;
  grandTotal?: number;
  taxBreakup?: TaxBreakup[];
  /** Total system cost incl. GST (or the calculator estimate when there are no lines). */
  estimatedCost: number;
  /** Central subsidy (PM Surya Ghar CFA). */
  subsidy: number;
  stateSubsidy?: number;
  /** Name of the state scheme used for `stateSubsidy`, e.g. "Chhattisgarh State Subsidy". */
  stateSubsidyScheme?: string | null;
  /** true: subsidy follows the rules in Settings (recalculated on every save). */
  subsidyAuto?: boolean;
  netCost: number;
  paymentTerms?: string;
  terms?: string;
  status: QuotationStatus;
  notes: string;
  createdAt: string;
  updatedAt?: string;
}

/** Visual layouts supported by quotation PDFs (Tally is invoice-specific). */
export type QuotationTemplate = 'classic' | 'modern' | 'minimal';

export interface Stat {
  value: string;
  label: string;
}

export interface HeroSlide {
  id: string;
  /** Small line above the heading, e.g. "6 months free cleaning" */
  kicker: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaLink: string;
  status: PublishStatus;
  order: number;
}

export type GalleryCategory =
  | 'installation'
  | 'residential'
  | 'commercial'
  | 'cleaning';

export interface GalleryImage {
  id: string;
  imageUrl: string;
  caption: string;
  category: GalleryCategory;
  status: PublishStatus;
  order: number;
}

export interface Highlight {
  icon: IconName;
  title: string;
  text: string;
}

/** A simple title + text item used by many editable lists. */
export interface TextItem {
  id: string;
  title: string;
  text: string;
}

/** Card with photo and link (home "Our Solar Solutions"). */
export interface LinkCard extends TextItem {
  image: string;
  link: string;
}

export interface AreaCard {
  id: string;
  name: string;
  text: string;
  image: string;
}

export interface TimelineItem {
  id: string;
  year: string;
  text: string;
}

export interface PricingTabText {
  label: string;
  note: string;
}

export interface PricingPageContent {
  heroTitle: string;
  heroIntro: string;
  capacityKicker: string;
  capacityTitle: string;
  capacityIntro: string;
  rangesKicker: string;
  rangesTitle: string;
  tabsLabel: string;
  tabs: Record<PlanCategory, PricingTabText>;
  featuredBadge: string;
  freeBadge: string;
  freePriceLabel: string;
  ctaLabel: string;
  emptyTitle: string;
  emptyMessage: string;
  disclaimerTitle: string;
  disclaimerText: string;
  calculatorTitle: string;
  faqTitle: string;
  ctaBandTitle: string;
}

export interface HomeContent {
  sixMonthKicker: string;
  sixMonthTitle: string;
  sixMonthIntro: string;
  sixMonthButton: string;
  trustKicker: string;
  solutionsKicker: string;
  solutionsTitle: string;
  solutionsIntro: string;
  solutionsLinkLabel: string;
  solutions: LinkCard[];
  maintenanceKicker: string;
  maintenanceTitle: string;
  maintenanceText: string;
  maintenancePoints: string[];
  maintenancePrimaryLabel: string;
  maintenancePrimaryLink: string;
  maintenanceSecondaryLabel: string;
  maintenanceSecondaryLink: string;
  missionKicker: string;
  missionTitle: string;
  missionText: string;
  missionButton: string;
  whyKicker: string;
  whyTitle: string;
  whyUs: TextItem[];
  calculatorKicker: string;
  calculatorTitle: string;
  calculatorIntro: string;
  areasKicker: string;
  areasTitle: string;
  areas: AreaCard[];
  partnersTitle: string;
  benefits: TextItem[];
  videoText: string;
  photoText: string;
  testimonialsKicker: string;
  testimonialsTitle: string;
}

export interface AboutContent {
  heroTitle: string;
  heroIntro: string;
  storyTitle: string;
  story: string[];
  missionTitle: string;
  missionText: string;
  principlesTitle: string;
  principlesIntro: string;
  principles: TextItem[];
  timelineTitle: string;
  timeline: TimelineItem[];
  ctaTitle: string;
}

export interface ServicesPageContent {
  heroTitle: string;
  heroIntro: string;
  groups: Record<ServiceGroup, { title: string; intro: string }>;
  dustTitle: string;
  dustText: string;
  dustButton: string;
  dustStats: Stat[];
}

/** One of the two installation plans (Normal / Premium) shown side by side on the website. */
export interface PlanTier {
  name: string;
  tagline: string;
  /** Shown as the price. Empty = automatic "From ₹…" from the company package prices. */
  priceLabel: string;
  /** Short ribbon, e.g. "Most popular". Empty = none. */
  badge: string;
  features: string[];
  /** Drone-based panel cleaning included in this plan. Normal: false, Premium: true. */
  droneCleaning: boolean;
  ctaLabel: string;
}

export interface PlanComparisonRow {
  id: string;
  label: string;
  normal: string;
  premium: string;
}

export interface PlanTiersContent {
  enabled: boolean;
  kicker: string;
  title: string;
  intro: string;
  normal: PlanTier;
  premium: PlanTier;
  /** Feature-by-feature table (drone cleaning is always added from the plan flags). */
  rows: PlanComparisonRow[];
  droneTitle: string;
  droneText: string;
  footnote: string;
}

export interface CtaContent {
  title: string;
  text: string;
  primaryLabel: string;
  primaryLink: string;
  whatsappLabel: string;
}

export interface SiteContent {
  businessName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  announcement: string;
  announcementEnabled: boolean;
  stats: Stat[];
  serviceAreas: string[];
  highlights: Highlight[];
  partners: string[];
  /** YouTube link for the "Watch our recent installation" section. Empty shows a photo instead. */
  videoUrl: string;
  social: {
    facebook: string;
    instagram: string;
    youtube: string;
    linkedin?: string;
  };
  /** Google Maps link for the address (optional). */
  mapUrl?: string;
  home: HomeContent;
  pricingPage: PricingPageContent;
  /** Normal vs Premium plan comparison (Admin → Pricing → Normal & Premium plans). */
  plans: PlanTiersContent;
  servicesPage: ServicesPageContent;
  about: AboutContent;
  cta: CtaContent;
  brand: BrandSettings;
  seo: SeoSettings;
  calculator: CalculatorSettings;
  /** Home-page offers (Admin → Offers). Disabled offers are kept but not shown. */
  offers: Offer[];
  updatedAt?: string;
}

/** One capacity slab of an offer, e.g. "3 kW" → "TV + Speaker / RO + Induction". */
export interface OfferSlab {
  id: string;
  capacity: string;
  gifts: string;
}

/**
 * One offer poster/banner. `url` is any image the site can load: a /images/… file shipped with
 * the site, an https:// link (e.g. a Firebase Storage download URL later) or an uploaded data URL.
 * `variants` are optional pre-sized copies of the same image for responsive loading.
 */
export interface OfferImage {
  id: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  variants?: Array<{ width: number; url: string }>;
  /** Shown next to this kW slab (OfferSlab.id). Empty = a general poster. */
  slabId?: string;
}

/** A promotional offer shown on the website (e.g. the Diwali offer). */
export interface Offer {
  id: string;
  enabled: boolean;
  /** Small label above the title, e.g. "Diwali Dhamaka Offer". */
  badge: string;
  title: string;
  description: string;
  slabs: OfferSlab[];
  /** Booking amount in rupees (null = not shown). */
  bookingAmount: number | null;
  luckyDrawText: string;
  /** Button text, e.g. "Enquiry Now". */
  ctaLabel: string;
  /** Posters / banners, in display order. The first one leads the carousel. */
  images: OfferImage[];
  /** Offer dates (YYYY-MM-DD, India time). Empty = no limit. After `validUntil` the website hides the offer. */
  validFrom: string;
  validUntil: string;
  /** Short terms line, e.g. "T&C apply. Gifts subject to availability." */
  terms: string;
  updatedAt?: string;
}

export interface BrandSettings {
  /** Full logo for the header and documents. Empty = built-in logo. */
  logoUrl: string;
  /** Square icon used in the footer, loader and admin. Empty = built-in icon. */
  logoMarkUrl: string;
  faviconUrl: string;
  primaryColor: string;
}

export type SeoPageKey =
  | 'home'
  | 'about'
  | 'services'
  | 'pricing'
  | 'calculator'
  | 'projects'
  | 'gallery'
  | 'faqs'
  | 'contact'
  | 'droneCleaning'
  | 'suryaGhar';

export interface SeoSettings {
  siteTitle: string;
  siteDescription: string;
  keywords: string;
  ogImage: string;
  siteUrl: string;
  googleSiteVerification: string;
  pages: Record<SeoPageKey, { title: string; description: string }>;
}

export interface CostSlab {
  upToKw: number | null;
  pricePerKw: number;
}

/** Assumptions behind the solar calculator — editable in Admin → Settings → Calculator. */
/** Telescopic energy slab: `rate` ₹/kWh for units above the previous slab up to `upToUnits` (null = no limit). */
export interface TariffSlab {
  upToUnits: number | null;
  rate: number;
}

/** CSPDCL LV tariff used to turn a bill into units and to work out the bill with solar. */
export interface ElectricityTariffSettings {
  /** Off = old behaviour (one flat ₹/unit = defaultTariff). */
  enabled: boolean;
  /** Shown on the website, e.g. "CSPDCL FY 2026-27". */
  label: string;
  domesticEnergy: TariffSlab[];
  /** LV-1 fixed charge, telescopic on sanctioned load (₹ per kW per month). */
  domesticFixed: { upToKw: number | null; perKw: number }[];
  lv21Energy: TariffSlab[];
  lv21FixedPerKw: number;
  lv22SmallEnergy: TariffSlab[];
  lv22SmallDemandPerKw: number;
  lv22LargeEnergy: TariffSlab[];
  lv22LargeDemandPerKw: number;
  /** FPPAS, % of energy charges. */
  fppasPercent: number;
  /** Electricity duty, % of energy charges. */
  dutyDomesticPercent: number;
  dutyNonDomesticPercent: number;
  /** Bijli Bill Half / M-Urja rebate for LV-1 homes. */
  halfBill: {
    enabled: boolean;
    percent: number;
    unitsCovered: number;
    maxUnits: number;
  };
  /** LV-5 Industry (other industries): 5.2.1 up to the threshold, 5.2.2 above it. Demand charge ₹/kW/month on billing demand. */
  lv5SmallEnergy: TariffSlab[];
  lv5SmallDemandPerKw: number;
  lv5LargeEnergy: TariffSlab[];
  lv5LargeDemandPerKw: number;
  /** LV-5 breakpoint in kW (25 HP = 18.7 kW). */
  lv5ThresholdKw: number;
  /** Above this contract demand an industry is on HV supply (HV-3, 11 kV). */
  lvMaxKw: number;
  /** HV-3 11 kV (load factor > 15 %): energy ₹/kVAh, demand ₹/kVA/month. kVAh ≈ kWh assumed (unity power factor). */
  hv3EnergyPerKvah: number;
  hv3DemandPerKva: number;
  /** Electricity duty for industrial consumers, % of energy charges (confirm from the bill). */
  dutyIndustrialPercent: number;
  /** Load assumed when the visitor does not enter a sanctioned load. */
  defaultLoadKw: { domestic: number; commercial: number; industrial: number };
  /** Bills are rounded to the nearest ₹ multiple (CSPDCL LV: 10). */
  roundTo: number;
}

/** Generation assumptions (Admin → Settings → Calculator). */
export interface GenerationSettings {
  /** Output relative to a south-facing roof (1 = 100 %). */
  orientation: Record<RoofDirection, number>;
  /** Output kept for each shading level (1 = no loss). */
  shading: Record<ShadingLevel, number>;
  /** Losses on top of the standard ~20 % already inside units/kW/day (long cable runs, heavy dust…), in %. */
  extraLossPercent: number;
  /** Optional per-state units/kW/day (GST state code → value). Missing = `unitsPerKwPerDay`. */
  yieldByState: Record<string, number>;
}

/** Indicative flat ₹/unit used where no verified DISCOM tariff is configured (always shown as "needs confirmation"). */
export interface IndicativeTariffSettings {
  residential: number;
  commercial: number;
  industrial: number;
}

export interface CalculatorSettings {
  /** Net units per kW per day for a south-facing, shade-free roof, after standard system losses. */
  unitsPerKwPerDay: number;
  generation: GenerationSettings;
  indicativeTariff: IndicativeTariffSettings;
  defaultTariff: number;
  electricity: ElectricityTariffSettings;
  exportTariff: number;
  /** Percent per year */
  tariffEscalation: number;
  /** Percent per year */
  panelDegradation: number;
  co2KgPerUnit: number;
  sqftPerKw: number;
  /** ± percent around the midpoint price */
  priceBand: number;
  maxKw: number;
  costSlabs: CostSlab[];
  systemFactor: Record<SystemType, number>;
  roofFactor: Record<RoofType, number>;
  subsidy: SubsidySettings;
  disclaimer: string;
}

/** One step of a state top-up scheme: `amount` applies from `fromKw` upwards (highest step reached wins). */
export interface StateSubsidySlab {
  fromKw: number;
  amount: number;
}

/** State subsidy scheme, e.g. Chhattisgarh ₹15,000 for 1 kW / ₹30,000 for 2 kW and above. */
export interface StateSubsidyRule {
  id: string;
  /** GST state code, e.g. "22" */
  stateCode: string;
  schemeName: string;
  agency: string;
  enabled: boolean;
  slabs: StateSubsidySlab[];
  /** Connections that qualify (central eligibility rules also apply). */
  propertyTypes: PropertyType[];
  note: string;
}

export interface SubsidySettings {
  enabled: boolean;
  /** PM Surya Ghar CFA for homes (general category states). */
  perKwUpTo2: number;
  perKwThird: number;
  cap: number;
  /** Higher CFA for special category states/UTs. */
  specialCategory: { perKwUpTo2: number; perKwThird: number; cap: number };
  specialCategoryStates: string[];
  housingSocietyPerKw: number;
  housingSocietyMaxKw: number;
  hybridEligible: boolean;
  /** State used when a quote/calculation has no state (Baba Solars: Chhattisgarh "22"). */
  defaultStateCode: string;
  states: StateSubsidyRule[];
  /** Date the rates were last checked against government notifications. */
  verifiedOn: string;
}

export interface Database {
  pricingPlans: PricingPlan[];
  capacityPlans: CapacityPlan[];
  services: Service[];
  projects: Project[];
  testimonials: Testimonial[];
  faqs: Faq[];
  heroSlides: HeroSlide[];
  gallery: GalleryImage[];
  enquiries: Enquiry[];
  proposals: Proposal[];
  quotations: Quotation[];
  content: SiteContent;
}

export type CollectionKey = Exclude<keyof Database, 'content'>;
export type CollectionItem<K extends CollectionKey> = Database[K][number];

/** Collections whose items have an `order` field and can be re-ordered in the admin panel. */
export type OrderedCollectionKey =
  | 'pricingPlans'
  | 'capacityPlans'
  | 'services'
  | 'heroSlides'
  | 'gallery'
  | 'testimonials'
  | 'faqs';

/** Collections shown on the public website (loaded for every visitor). Leads are admin-only. */
export type PublicCollectionKey = Exclude<
  CollectionKey,
  'enquiries' | 'quotations' | 'proposals'
>;

/** Field-level validation errors, keyed by field path (e.g. "priceMax", "features.2"). */
export type FieldErrors = Record<string, string>;

// ─── Back-office (admin only) ───────────────────────────────────────────────
/** admin: everything · owner: lead monitoring & reports (read-only) · sales: leads & documents · editor: website content. */
export type Role = 'admin' | 'owner' | 'editor' | 'sales';
export type Permission =
  | 'content:read'
  | 'content:write'
  | 'uploads:write'
  | 'leads:read'
  | 'leads:write'
  | 'leads:delete'
  | 'leads:assign'
  | 'reports:read'
  | 'companies:read'
  | 'companies:write'
  | 'quotations:read'
  | 'quotations:write'
  | 'invoices:read'
  | 'invoices:write'
  | 'invoices:delete'
  | 'business:read'
  | 'business:write'
  | 'users:manage'
  | 'backup:manage';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
export interface StaffUser extends AdminUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Quality = 'normal' | 'premium';

/** Installed price of one package size for both quality tiers. */
export interface PackagePrice {
  capacityKw: number;
  normal: number;
  premium: number;
}

/** Equipment that defines a quality tier for a company. */
export interface QualitySpec {
  label: string;
  panelModel: string;
  panelTechnology: string;
  panelWattage: number;
  inverterBrand: string;
  inverterModel: string;
  structure: string;
  panelWarrantyYears: number;
  performanceWarrantyYears: number;
  inverterWarrantyYears: number;
}

/** Solar brand with its package price list (Admin → Companies & rates). */
export interface Company {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  isActive: boolean;
  order: number;
  /** true: package prices are the final price incl. GST (the client price list). */
  pricesIncludeGst: boolean;
  packages: PackagePrice[];
  qualities: Record<Quality, QualitySpec>;
  workmanshipWarrantyYears: number;
  /** Items included with every kit (printed on quotations). */
  kitIncludes: string[];
  updatedAt?: string;
}

/** How a package price is itemised on a quotation (share of the price per component). */
export interface BreakdownRow {
  key:
    | 'modules'
    | 'inverter'
    | 'structure'
    | 'cables'
    | 'protection'
    | 'installation'
    | 'transport';
  name: string;
  /** Percent of the package price */
  share: number;
  gstRate: number;
  hsn: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  sku?: string;
  description: string;
  hsn: string;
  unit: string;
  rate: number;
  gstRate: number;
  /** kit = product, bos = material, service, expense = labour / transport / other charges */
  category: 'kit' | 'bos' | 'service' | 'expense';
}

export type InvoiceTemplate = 'classic' | 'modern' | 'minimal' | 'tally';
export type DocumentTitle =
  | 'Tax Invoice'
  | 'Proforma Invoice'
  | 'Sales Order'
  | 'Bill of Supply';
export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentMethod =
  | 'cash'
  | 'upi'
  | 'bank_transfer'
  | 'cheque'
  | 'card'
  | 'loan'
  | 'other';

export interface Payment {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  note: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  documentTitle: DocumentTitle;
  /** Buyer's order no. / reference (Tally "Buyer's Ref."). */
  reference: string;
  invoiceDate: string;
  dueDate: string | null;
  quotationId: string | null;
  template: InvoiceTemplate;
  status: InvoiceStatus;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  gstin: string;
  placeOfSupply: string;
  supplyType: 'intra' | 'inter';
  items: LineItem[];
  discountType: 'amount' | 'percent';
  discountValue: number;
  subtotal: number;
  itemDiscount: number;
  overallDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  taxBreakup: TaxBreakup[];
  amountPaid: number;
  amountDue: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | '';
  payments: Payment[];
  notes: string;
  terms: string;
  isOverdue: boolean;
  /** PM Surya Ghar / state subsidy information printed on the invoice (optional). */
  subsidy?: InvoiceSubsidy | null;
  createdAt: string;
  updatedAt: string;
}

/** Subsidy details entered on an invoice. `central`/`state` null = calculate from the rules. */
export interface InvoiceSubsidyInput {
  show: boolean;
  auto: boolean;
  capacityKw: number;
  propertyType: PropertyType;
  systemType: SystemType;
  central: number | null;
  state: number | null;
}

/** Subsidy as stored and printed: the invoice total stays the GST amount payable; subsidy is credited to the customer by the Government. */
export interface InvoiceSubsidy extends Omit<InvoiceSubsidyInput, 'central' | 'state'> {
  central: number;
  state: number;
  total: number;
  /** Invoice grand total − total subsidy. */
  netCost: number;
  centralScheme: string;
  stateScheme: string | null;
}

export interface InvoiceInput {
  documentTitle: DocumentTitle;
  reference: string;
  invoiceDate: string;
  dueDate: string | null;
  template: InvoiceTemplate;
  status: InvoiceStatus;
  quotationId: string | null;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  gstin: string;
  items: LineItem[];
  discountType: 'amount' | 'percent';
  discountValue: number;
  paymentMethod: PaymentMethod | '';
  notes: string;
  terms: string;
  initialPayment?: Omit<Payment, 'id'> | null;
  subsidy?: InvoiceSubsidyInput | null;
}

export interface InvoiceList {
  items: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  summary: { count: number; billed: number; paid: number; due: number };
}

export interface BusinessSettings {
  legalName: string;
  tradeName: string;
  gstin: string;
  cin: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  signatoryName: string;
  signatoryTitle: string;
  mnreRegistration: string;
  bank: {
    accountName: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch: string;
    upiId: string;
  };
  invoice: {
    prefix: string;
    defaultTemplate: InvoiceTemplate;
    defaultDueDays: number;
    roundOff: boolean;
    defaultNotes: string;
    defaultTerms: string;
  };
  quotation: {
    prefix: string;
    validityDays: number;
    showSubsidy: boolean;
    defaultPaymentTerms: string;
    defaultTerms: string;
    inclusions: string[];
    exclusions: string[];
  };
  /** Proposal numbering and validity (Proposals module). */
  proposal: {
    prefix: string;
    validityDays: number;
  };
  /** Component split used to itemise package prices, per quality tier. */
  packageBreakdown: Record<Quality, BreakdownRow[]>;
  updatedAt?: string;
}
