# Baba Solars — API (backend)

Express 5 + TypeScript, PostgreSQL 14+ (Drizzle ORM), Zod validation, server-side sessions (HttpOnly cookie) with CSRF protection, role-based access control. Node.js **22.12+**.

```
src/
  app.ts                 Express app (middleware order, routers, portal separation)
  index.ts               HTTP server, graceful shutdown
  config/env.ts          Environment validation (fails fast, never prints secrets)
  middleware/            auth (sessions, requireAuth, requirePermission, requirePortal, CSRF), security, errors
  modules/<name>/        router → controller → service → model, plus Zod schemas
    enquiries/           public form API + lead management
    admin/               dashboard, dashboard analytics (aggregations), backup/restore
    auth/ owner/ users/ uploads/ content/ offers/ proposals/ quotations/ invoices/ catalog/ companies/ business/
  db/                    schema barrel, client, counters
  scripts/               migrate, seed, data-migrate
shared/                  business rules + types shared with the website (same files as web/src/lib, web/src/types)
drizzle/                 SQL migrations (0000_init, 0001_enquiry_optional_fields)
test/                    integration tests (node:test, real database)
```

## 1. Install

```bash
npm ci
cp .env.example .env          # then edit .env (see below)
```

## 2. Database setup

```bash
sudo -u postgres createuser --pwprompt babasolars
sudo -u postgres createdb -O babasolars babasolars
sudo -u postgres psql -d babasolars -c 'create extension if not exists pg_trgm;'
```

Migrations, first accounts and website content:

```bash
npm run build                 # typecheck + bundle to dist/
npm run db:migrate            # applies drizzle/*.sql in order (safe to re-run)
npm run db:seed               # roles + first admin/owner from SEED_* in .env (never resets passwords)
npm run data:migrate          # first install only: loads the bundled website content (skips existing records)
```

Development variants without a build: `npm run db:migrate:dev`, `npm run db:seed:dev`, `npm run data:migrate:dev`.

**Upgrading an existing database:** just run `npm run db:migrate`. Migration `0001_enquiry_optional_fields` is additive only — it sets empty-string defaults on `enquiries.name` / `enquiries.service`, adds the nullable `capacity_choice` column with a check constraint, and an index on `enquiry_type`. No rows are changed or deleted. Take a backup first anyway (below).

## 3. Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` on the server (secure cookies, HSTS, no debug details in errors) |
| `HOST`, `PORT` | Listen address (keep `127.0.0.1` behind Nginx) |
| `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_SSL` | PostgreSQL connection |
| `CORS_ORIGINS` | Website origins allowed to call the API with cookies (comma-separated) |
| `TRUST_PROXY` | Proxies in front (1 = Nginx) — needed for real client IPs in rate limits |
| `COOKIE_DOMAIN` | Only if the API is on another subdomain |
| `SESSION_TTL_HOURS` | Session lifetime (sliding on the server, cookie expires at the same time) |
| `UPLOAD_DIR`, `UPLOAD_MAX_MB` | Image storage folder (outside the release folder) and max size |
| `REDIS_URL` | Optional cache / jobs |
| `RATE_LIMIT_ENQUIRIES` | Website enquiries per IP per 10 min |
| `RATE_LIMIT_LOGIN` | Sign-ins per IP per 15 min **and** failed sign-ins per account per 15 min |
| `RATE_LIMIT_API` | API requests per IP per minute |
| `SEED_*` | First-run accounts only — remove the passwords after `db:seed` |

Never commit `.env`. Passwords are stored as scrypt hashes only.

## 4. Run locally

```bash
npm run dev                   # http://127.0.0.1:4000  (health: /api/health)
```

The website's dev server (`npm run dev` in the frontend) proxies `/api` and `/uploads` here.

## 5. Tests

```bash
createdb babasolars_test && psql -d babasolars_test -c 'create extension if not exists pg_trgm;'
cp .env.test.example .env.test   # TEST_DATABASE_URL — the name must contain "test" (tables are truncated)
npm test
```

55 integration tests start the real app on a random port against the test database: contact rule (mobile OR email), optional fields, capacity options, idempotent submissions, honeypot, rate limits, sign-in per portal, brute-force limits, logout, session expiry, CSRF, role/portal access to every protected area, image upload validation (type by content, damaged headers, size, traversal), and dashboard aggregations with date filters.

Other checks: `npm run typecheck`, `npm run build`. No separate linter is configured; the TypeScript compiler runs in strict mode with unused-code checks.

## 6. Production deployment (Ubuntu + Nginx + PM2)

```bash
# on the server, in the release folder
npm ci && npm run build && npm prune --omit=dev
npm run db:migrate
pm2 start ecosystem.config.cjs --env production   # first time
pm2 reload baba-solars-api                         # later deploys (zero downtime)
```

Nginx (same origin as the website — recommended):

```nginx
location /api/     { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; client_max_body_size 6m; }
location /uploads/ { alias /var/lib/babasolars/uploads/; add_header X-Content-Type-Options nosniff; expires 1y; }
```

Use HTTPS (cookies are `Secure` in production). Keep `UPLOAD_DIR` outside the release folder so deploys don't remove images.

**Note on rate limits with PM2 cluster mode:** limits are counted per process (2 instances ⇒ up to 2× the configured numbers). For exact global limits use one instance or put the limiter on Redis.

### Backups

```bash
pg_dump -Fc -d babasolars -f babasolars-$(date +%F).dump        # database
tar czf uploads-$(date +%F).tgz -C /var/lib/babasolars uploads   # images
pg_restore -d babasolars --clean babasolars-2026-11-06.dump      # restore
```

Schedule both daily (cron) and copy them off the server. The admin panel also exports a JSON backup (Settings → Backup).

## 7. API reference

All responses are JSON. Errors: `{ "error": { "code", "message", "fieldErrors"?, "requestId" } }` — messages are safe to show; internal details are never sent. Writes from a signed-in browser must send the `X-CSRF-Token` header (value of the `bs_csrf` cookie / returned by `/auth/me`).

### Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Liveness + DB status |
| GET | `/api/site` | Published website data (staff also get drafts) |
| POST | `/api/public/enquiries` | Website enquiry. Rate limited. Body below. |
| POST | `/api/public/quote-requests` | Calculator quote request (priced again on the server) |

`POST /api/public/enquiries` body — **only rule: a valid `phone` OR a valid `email`**; everything else optional (missing, `""` or `null`):

```json
{
  "name": "Ravi", "phone": "9876543210", "email": "ravi@example.com", "city": "Raipur",
  "enquiryType": "home | commercial", "capacityKw": 5, "capacityChoice": "custom | not-sure",
  "service": "Home roof installation", "message": "…", "source": "contact",
  "submissionId": "uuid (one enquiry per submission — double clicks/retries are safe)"
}
```

`201` → the saved enquiry (`id` like `enq-<16 hex>`, `createdAt`, …). `400` → `fieldErrors.phone` / `fieldErrors.email` etc. `429` → too many from this connection.

### Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password, portal: "admin" \| "owner" }`. Each role signs in only on its own portal; any mismatch returns the same `401 Incorrect email or password.` Limited per IP and per account. |
| GET | `/api/auth/me` | Current user, permissions, portal, CSRF token |
| POST | `/api/auth/logout` | Deletes the server session |
| POST | `/api/auth/password` | Change own password (signs out other devices) |

### Admin panel (admin-portal sessions only; per-permission)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/dashboard` | signed in (sections by permission) |
| GET | `/api/admin/dashboard/analytics?range=all\|today\|7d\|30d\|month\|custom&from=YYYY-MM-DD&to=YYYY-MM-DD` | `leads:read` |
| GET | `/api/enquiries?page&limit&search&status&source&assignedTo&followUp&enquiryType&from&to&sort&order` | `leads:read` (owner too) |
| GET | `/api/enquiries/stats`, `/api/enquiries/:id` | `leads:read` |
| PUT/POST | `/api/enquiries/:id`, `/api/enquiries` | `leads:write` |
| PATCH | `/api/enquiries/:id/status`, `/:id/assign` | `leads:write`, `leads:assign` |
| POST | `/api/enquiries/:id/activities`, `/:id/follow-ups`, `/import`, `/export` | `leads:write` / `leads:read` |
| DELETE | `/api/enquiries/:id` | `leads:delete` (soft delete) |
| POST | `/api/uploads` (raw image body, `Content-Type: image/jpeg\|png\|webp`) | `uploads:write` |
| … | `/api/proposals`, `/api/quotations`, `/api/invoices`, `/api/catalog`, `/api/companies`, `/api/business`, `/api/users`, `/api/collections/*`, `/api/content`, `/api/offers`, `/api/admin/backup*` | as before |

Analytics response: `cards` (total, new, contacted [contacted/follow-up/interested/site-visit/proposal/quoted], closed [converted/not-interested/closed], converted, recent7d, projects, projectsPublished, activeServices, publishedOffers), `previous` (same counts for the previous equal-length period — `null` unless older data exists), `recentLeads` (10 newest), `status`, `types` (home/commercial/unspecified), `capacity` buckets, `capacityNotGiven`, `timeline` (zero-filled day/week/month buckets), `monthly` (last 12 months). All computed in SQL.

### Owner portal (owner role + owner sign-in only — admin sessions get 403)

| Method | Path |
|---|---|
| GET | `/api/owner/dashboard?limit=10` |
| GET | `/api/enquiries…` (read-only) |

## 8. Security summary

- scrypt password hashing; 256-bit random session tokens stored as SHA-256; HttpOnly + SameSite=Lax + Secure (production) cookies; sessions deleted on logout, expiry enforced server-side.
- CSRF double-submit token bound to the session for every cookie-authenticated write.
- RBAC on every route (`requirePermission`) plus portal separation (`requirePortal`): owner APIs reject admin sessions, admin APIs reject owner sessions.
- Brute-force limits per IP and per account; enquiry and general API rate limits.
- Zod validation on every body/query; text trimmed, control characters removed, lengths capped; parameterised SQL only (Drizzle); React escapes all output.
- Uploads: JPG/PNG/WebP only, decided by file signature **and** a parsed image header (width/height), size and dimension limits, random server-generated file names, no client path ever used, `nosniff` + restrictive CSP on served files.
- Helmet security headers, strict CORS allow-list, generic 500 messages with request ids (stack traces only in logs).
