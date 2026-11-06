/** Small, dependency-free validators. Each returns an error message or ''. */
export type Validator = (value: string) => string

export const required = (label: string): Validator => (v) => (v.trim() ? '' : `Enter ${label.toLowerCase()}.`)

export const indianPhone: Validator = (v) => {
  let digits = v.replace(/\D/g, '')
  if (!digits) return 'Enter your phone number.'
  // Strip country code (+91) or trunk prefix (0) only when present as an extra prefix.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? '' : 'Enter a 10-digit Indian mobile number.'
}

export const optionalEmail: Validator = (v) =>
  !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email, like name@example.com.'

export const minLength = (n: number, label: string): Validator => (v) =>
  v.trim().length >= n ? '' : `${label} should be at least ${n} characters.`

export const positiveNumber = (label: string): Validator => (v) =>
  v.trim() !== '' && Number(v) > 0 ? '' : `${label} must be more than 0.`

export function validate<T extends Record<string, string>>(
  values: T,
  rules: Partial<Record<keyof T, Validator[]>>,
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {}
  for (const key in rules) {
    for (const rule of rules[key] ?? []) {
      const msg = rule(values[key] ?? '')
      if (msg) { errors[key] = msg; break }
    }
  }
  return errors
}
