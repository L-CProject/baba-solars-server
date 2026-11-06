import { z } from 'zod'

const bool = (def: boolean) =>
  z.enum(['true', 'false', '1', '0', 'yes', 'no', '']).optional().transform((v) => (v === undefined || v === '' ? def : ['true', '1', 'yes'].includes(v)))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required, e.g. postgres://user:pass@127.0.0.1:5432/babasolars'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_SSL: z.string().optional(),
  /** Comma-separated list of origins allowed to call the API with cookies (the website URL). */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173'),
  /** Number of proxies in front of the API (1 = Nginx). Needed for correct client IPs and secure cookies. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().min(1).max(24 * 30).default(12),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Max upload size in MB (images are already compressed in the browser). */
  UPLOAD_MAX_MB: z.coerce.number().min(1).max(20).default(5),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Public enquiry submissions allowed per IP per 10 minutes. */
  RATE_LIMIT_ENQUIRIES: z.coerce.number().int().min(1).default(20),
  /** Login attempts allowed per IP per 15 minutes. */
  RATE_LIMIT_LOGIN: z.coerce.number().int().min(1).default(10),
  /** General API requests per IP per minute. */
  RATE_LIMIT_API: z.coerce.number().int().min(10).default(600),
  // First-run accounts (npm run db:seed). Never commit real values.
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().default('Admin'),
  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_PASSWORD: z.string().optional(),
  SEED_OWNER_NAME: z.string().default('Owner'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // Fail fast with a readable message (no secrets are printed).
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n')
  console.error(`Invalid environment configuration:\n${lines}`)
  process.exit(1)
}

const e = parsed.data
export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  databaseSsl: bool(false).parse(e.DATABASE_SSL),
  corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
  /** Cookies are Secure in production (HTTPS behind Nginx). */
  cookieSecure: e.NODE_ENV === 'production',
}
export type Env = typeof env
