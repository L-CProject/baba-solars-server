/** Dates follow India time (the business runs in Asia/Kolkata). */
export const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString())
export const isoOr = (d: Date | string | null | undefined, fallback = ''): string => iso(d) ?? fallback
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
