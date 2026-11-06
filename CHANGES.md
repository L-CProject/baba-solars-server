# Changes in this release (backend)

## Enquiries
- `drizzle/0001_enquiry_optional_fields.sql` (+ meta) — additive migration: defaults for `name`/`service`, new `capacity_choice` column + check, index on `enquiry_type`. No data changed.
- `src/modules/enquiries/enquiries.model.ts`, `enquiries.schema.ts`, `enquiries.service.ts` — every field optional except mobile OR email (each validated if given); `capacityChoice`; empty/null tolerated; same message for both empty.
- `shared/lib/enquiries.ts`, `shared/types/*` — shared contact rule, stricter email check, control-character stripping, capacity helpers, analytics types.

## Auth & RBAC
- `src/middleware/auth.ts` — `requirePortal('admin' | 'owner')`.
- `src/app.ts` — staff APIs require an admin-panel session; `src/modules/owner/owner.router.ts` — owner APIs require an owner session (admins get 403).
- `src/modules/auth/auth.service.ts` — wrong-portal sign-in returns the generic "Incorrect email or password." (no owner wording, no account enumeration).
- `src/modules/auth/auth.router.ts` — per-account brute-force limiter in addition to per-IP.

## Uploads
- `src/modules/uploads/*` — JPG/PNG/WebP only, type from signature + parsed image header, max dimensions, no orphan files, clearer errors; `src/middleware/error.ts` — size message for uploads.

## Dashboard
- `src/modules/admin/dashboard.service.ts` (new), `admin.controller.ts`, `admin.router.ts`, `admin.schema.ts` — `GET /api/admin/dashboard/analytics` (SQL aggregations, date filters, previous-period trends only with real history, recent 10 leads).

## Other
- `src/modules/content/content.controller.ts` — `Vary: Cookie` so a browser never reuses the cached visitor copy of site data after a staff sign-in (fixed: hidden items missing in admin lists right after signing in).
- `test/*` (new, 55 integration tests), `package.json` (`npm test`), `.env.test.example`, `.env.example` (placeholders instead of sample passwords), `.gitignore`, `README.md`, `CHANGES.md`, `package-lock.json`.
