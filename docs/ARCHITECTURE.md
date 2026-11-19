# Architecture

```
car-dealership/
├─ apps/
│  ├─ api/            Express REST API
│  │  └─ src/
│  │     ├─ config/      env validation (zod)
│  │     ├─ middleware/  auth (JWT + RBAC), centralized error handler
│  │     ├─ modules/     auth, vehicles (public+admin), leads (+customers), cms, admin (users, roles, settings, dashboard, notifications, audit), public
│  │     ├─ services/    core.ts: audit log, notifications, email, image storage (Cloudinary / local), tokens
│  │     ├─ scripts/     create-admin.ts
│  │     └─ utils/       http.ts: AppError, wrap(), parse(), pagination, response envelope
│  └─ web/            React SPA (public site + admin portal, same bundle, admin lazy-loaded)
│     └─ src/ components/{ui,public,admin} · features/{auth,site} · layouts · pages/{public,admin} · routes · services · styles
├─ packages/shared/   RBAC matrix, zod schemas (forms, vehicles, CMS section registry) used by BOTH api and web
├─ prisma/            schema.prisma, migrations/, seed.ts
├─ docs/  scripts/  uploads/
```

## Key decisions

**Shared validation.** `packages/shared` holds the permission matrix and zod schemas. The browser validates with the exact schema the API enforces, so rules cannot drift. The API is the authority: every endpoint re-validates and returns `422 { error.details.fieldErrors }`, which forms map back onto fields.

**Response envelope.** Success: `{ success: true, data, meta? }` (`meta` carries pagination `{total,page,limit,totalPages}`). Failure: `{ success: false, error: { code, message, details? } }`. Status codes: 200/201, 400, 401, 403, 404, 409 (duplicates/refs), 422 (validation), 429, 500.

**Authentication.** Short-lived (15 min) JWT access token held in memory by the SPA and sent as `Authorization: Bearer`. A 14-day refresh token (random, stored **hashed** in `RefreshSession`) lives in an `httpOnly; SameSite=Strict` cookie scoped to `/api/auth` and is **rotated** on every refresh. Because API calls use a header rather than an ambient cookie, cross-site requests cannot act as the user (CSRF-safe by construction); the only cookie-authenticated endpoints are the refresh/logout calls, which are SameSite=Strict. Each request reloads the user from the DB, so disabling an account or changing a role applies immediately. Passwords: bcrypt (cost 12). Reset tokens: random, stored hashed, 1-hour expiry, single use, and reset revokes all sessions. Login limiter counts only failures.

**Authorization.** `requirePermission(...)` middleware per route; permissions come from `ROLE_PERMISSIONS` (mirrored into `Role`/`Permission` tables by the seed for visibility). Row-level rules live in services: Sales Reps only query leads where `assigneeId = me` (other ids return 404, not 403, to avoid leaking existence); only Super Admins can create/modify Super Admins; the last Super Admin and your own account can't be disabled/deleted. The UI hides what you can't use, but the API is the enforcement point (tested).

**CMS model.** `WebsitePage` → ordered `PageSection`s with a `type` and JSON `content`. The section registry (`SECTION_SCHEMAS` in shared) validates content on write; the public renderer re-validates on read and skips invalid sections instead of crashing. Simple collections (testimonials, FAQs, services, banners, categories) share one generic CRUD/reorder factory. Navigation menus are replaced atomically in a transaction. Draft/published state exists on pages, blog posts, vehicles and content lists; only published content is returned by `/api/public/*`.

**Theming.** `ThemeSetting` → `/api/public/site` → `SiteProvider` writes CSS variables (`--primary`, `--accent`, fonts, button radius, layout width). Tailwind colours reference those variables, so a colour change restyles the entire site without a rebuild. Font names are allow-listed to `[A-Za-z0-9 -]` (CSS-injection safe) and loaded from Google Fonts.

**Images.** Uploads are held in memory, size-capped (8 MB), and the **file signature is verified** (JPEG/PNG/WebP only — SVG and mislabeled files are rejected) before storage. Cloudinary when configured, `./uploads` otherwise. Deleting a vehicle/image deletes the stored file.

**Security checklist.** helmet headers · CORS allow-list · global + per-route rate limits (public forms 30/h/IP) · bcrypt · zod validation everywhere · Prisma parameterised queries (no raw user SQL) · CSV-formula neutralisation in exports · HTML sanitisation on render · audit log on mutations · uploads validated · secrets only in env · `X-Powered-By` removed.

## Data model (summary)
Auth: `User`, `Role`, `Permission`, `RolePermission`, `RefreshSession`, `PasswordResetToken` · Inventory: `Make`, `Model`, `Vehicle`, `VehicleImage`, `VehicleFeature`, `VehicleCategory` · Sales: `Customer`, `Lead` (+ `LeadNote`, `LeadFollowUp`), `TestDriveRequest`, `FinancingApplication`, `TradeInRequest` · CMS: `WebsitePage`, `PageSection`, `NavigationMenu`, `NavigationItem`, `Testimonial`, `FAQ`, `Service`, `Banner`, `BlogPost`, `MediaAsset` · System: `WebsiteSetting` (JSON per group), `ThemeSetting`, `Notification`, `AuditLog`.

Indexes cover every inventory filter column, lead status/type/assignee/date, page-section ordering and audit lookups. Foreign keys cascade where children are meaningless without the parent (images, features, notes, request details) and `SET NULL` where history should survive (a lead outlives a deleted vehicle or user). Prices are `Decimal(12,2)`.

## Extending

**Add a homepage/page section type** (e.g. "Video banner")
1. `packages/shared/src/index.ts` — add a zod schema to `SECTION_SCHEMAS` and a label to `SECTION_LABELS`.
2. `apps/web/src/components/public/sections.tsx` — add a renderer to `registry`.
3. `apps/web/src/components/admin/fields.tsx` — add its editor field list to `SECTION_FIELDS`.
The API validation, admin "Add section" menu, reorder/hide/publish flows and preview all work automatically.

**Add a simple managed content list** — add a Prisma model, one `crud("name", …)` line in `modules/cms.ts`, a public read endpoint, and one entry in `CONFIGS` in `pages/admin/Collections.tsx` (plus a nav link in `AdminLayout`).

**Add a permission** — add to `PERMISSIONS` and the roles in `ROLE_PERMISSIONS`, guard the route with `requirePermission`, then re-run `npm run db:seed`.

**Add an API module** — create `modules/<name>.ts` exporting a Router, mount it in `app.ts`, document it in `docs.ts`.

Ordinary content, settings and supported modules are manageable without code; genuinely new functionality (new data types or workflows) still requires development, as above.
