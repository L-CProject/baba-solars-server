export const COMPANY_CONTACT = {
  phone: '92039 00410',
  email: 'babasolars76@gmail.com',
  address:
    'Deopuri, House No. 03, Shri Balaji Golden Palace, Behind Shri Upadhyay Furniture, Deopuri, Raipur, Chhattisgarh – 492015, India',
  whatsapp: '919203900410',
  businessAddress:
    'Deopuri, House No. 03, Shri Balaji Golden Palace, Behind Shri Upadhyay Furniture, Deopuri',
  hours: '10:30 AM – 5:30 PM',
} as const;

/** Previous seeded values; used only to migrate stale browser/imported settings. */
export const LEGACY_COMPANY_CONTACT = {
  phone: '+91 98765 43210',
  whatsapp: '919876543210',
  email: 'hello@babasolars.in',
  address:
    'House No. 03, Shri Balaji Golden Palace, Behind Shri Upadhyay Furniture, Deopuri, Raipur, Chhattisgarh – 492015, India',
  businessAddress:
    'House No. 03, Shri Balaji Golden Palace, Behind Shri Upadhyay Furniture, Deopuri',
  hours: 'Mon–Sat, 9:30 am to 7:00 pm',
} as const;

export function migrateCompanyContacts<T extends object>(value: T): T {
  const next = { ...value } as Record<string, unknown>;
  if (next.phone === LEGACY_COMPANY_CONTACT.phone)
    next.phone = COMPANY_CONTACT.phone;
  if (next.whatsapp === LEGACY_COMPANY_CONTACT.whatsapp || next.whatsapp === '')
    next.whatsapp = COMPANY_CONTACT.whatsapp;
  if (next.email === LEGACY_COMPANY_CONTACT.email)
    next.email = COMPANY_CONTACT.email;
  if (next.address === LEGACY_COMPANY_CONTACT.address)
    next.address = COMPANY_CONTACT.address;
  if (next.address === LEGACY_COMPANY_CONTACT.businessAddress)
    next.address = COMPANY_CONTACT.businessAddress;
  if (next.hours === LEGACY_COMPANY_CONTACT.hours)
    next.hours = COMPANY_CONTACT.hours;
  return next as T;
}
