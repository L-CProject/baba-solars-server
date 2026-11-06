import type { BusinessSettings } from '@/types';
import { DEFAULT_BREAKDOWN } from '@/lib/pricing';
import { COMPANY_CONTACT } from '@/config/company';

/** Business & billing details printed on quotations and invoices (Admin → Settings → Business & billing). */
export const seedBusiness: BusinessSettings = {
  legalName: 'Baba Solars',
  tradeName: 'Baba Solars',
  gstin: '22ABSCS7495K1ZG',
  pan: 'ABSCS7495K',
  cin: 'U35105CT2026PTC019726',
  address: COMPANY_CONTACT.businessAddress,
  city: 'Raipur',
  state: 'Chhattisgarh',
  stateCode: '22',
  pincode: '492015',
  phone: COMPANY_CONTACT.phone,
  email: COMPANY_CONTACT.email,
  website: 'babasolars.in',
  logoUrl: '',
  signatoryName: '',
  signatoryTitle: 'Authorised Signatory',
  mnreRegistration: '',
  bank: {
    accountName: 'Baba Solars',
    accountNumber: '50200012345678',
    ifsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    branch: 'Shankar Nagar, Raipur',
    upiId: 'babasolars@hdfcbank',
  },
  invoice: {
    prefix: 'BS/INV',
    defaultTemplate: 'classic',
    defaultDueDays: 15,
    roundOff: true,
    defaultNotes:
      'Thank you for choosing Baba Solars. Please quote the invoice number when making a payment.',
    defaultTerms: [
      '1. Payment is due by the due date shown above. Interest @ 18% p.a. may be charged on overdue amounts.',
      '2. Goods once sold will not be taken back. Warranty is as per the manufacturer’s terms.',
      '3. Subject to Raipur jurisdiction. E. & O.E.',
    ].join('\n'),
  },
  proposal: { prefix: 'BS/PRP', validityDays: 15 },
  quotation: {
    prefix: 'BS/QT',
    validityDays: 15,
    showSubsidy: true,
    defaultPaymentTerms: [
      '50% advance with the order (purchase order / confirmation).',
      '40% on delivery of material at site.',
      '10% after installation and commissioning.',
    ].join('\n'),
    defaultTerms: [
      'Prices include GST and are valid for the validity period stated above; they may change with government taxes or duties.',
      'Generation figures are indicative and depend on location, shading, weather, cleaning and grid availability.',
      'PM Surya Ghar subsidy (CFA) is credited by the Government directly to the customer’s bank account after commissioning and inspection; Baba Solars assists with the application.',
      'Net-metering approval and charges are as per CSPDCL rules.',
      'Delivery and installation: typically 2–3 weeks from receipt of advance and site clearance.',
      'Civil work, structure strengthening or extra cable length beyond the scope will be charged separately.',
      'Disputes are subject to Raipur jurisdiction.',
    ].join('\n'),
    inclusions: [
      'Design, supply, installation, testing and commissioning',
      'GI module mounting structure',
      'DC & AC cables, ACDB/DCDB with protection devices',
      'Earthing (3 pits with chemical bags) and lightning arrester',
      'Net-metering and PM Surya Ghar paperwork support',
      '6 months free panel cleaning',
    ],
    exclusions: [
      'Civil work beyond standard foundations',
      'CSPDCL fees, meter testing charges and security deposit',
      'Extra cable beyond 30 m run',
      'Internet/Wi-Fi for monitoring',
    ],
  },
  packageBreakdown: DEFAULT_BREAKDOWN,
};
