# Premium Car Dealership Platform

A full-stack dealership website and management platform: a customer-facing site, a secure admin portal, a REST API and a PostgreSQL database. Everything customers see (pages, homepage sections, navigation, branding, vehicles) is stored in the database and edited in the admin portal — no code changes for day-to-day content.

| Layer | Tech |
|---|---|
| Web | React 18, TypeScript, Vite, Tailwind CSS, Radix UI primitives, React Router, TanStack Query, React Hook Form, Zod |
| API | Node.js, Express, TypeScript, Zod, Prisma ORM, JWT access tokens + rotating httpOnly refresh cookie, bcrypt |
| Database | PostgreSQL (Prisma migrations) |
| Integrations | Cloudinary (images), SMTP/nodemailer (email), Google Maps embed — all optional and configured by env vars |
| Tests | Vitest + Supertest (API, real PostgreSQL), Vitest + Testing Library (UI), Playwright (end-to-end) |

## Quick start (development)

Prerequisites: **Node.js 22+** and **PostgreSQL 14+** (or use the bundled throw-away dev database below).

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL and the two JWT secrets
npm run db:migrate            # create tables
npm run db:seed               # roles, permissions, demo content & vehicles (creates NO users)
npm run admin:create          # interactive: create your Super Admin (password is never stored in the repo)
npm run dev                   # API on :4000, website on :5173
```

* Website: http://localhost:5173  ·  Admin: http://localhost:5173/admin  ·  API docs: http://localhost:4000/api/docs
* No PostgreSQL password handy? `npm run dev:db` starts a self-contained database on port 5433 (user/password `dev`, databases `cardealer` and `cardealer_test`). The default `.env` values in `docs/SETUP.md` point at it.

Full instructions, including creating the database with a UTF-8 encoding: [docs/SETUP.md](docs/SETUP.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm run build` | Type-check API, type-check and build web (`apps/web/dist`) |
| `npm test` | API tests (80) + UI tests (15). Needs `TEST_DATABASE_URL` |
| `npm run test:e2e` | 16 Playwright workflows in real Chrome against the **test** database |
| `npm run db:migrate` / `db:deploy` | Create migrations in dev / apply them in production |
| `npm run db:seed` | Demo data (idempotent) |
| `npm run db:seed:minimal` | Production-safe seed: roles, permissions, theme, settings, navigation, categories, starter pages — no demo vehicles/customers/leads |
| `npm run admin:create` | Create or reset a Super Admin |

## What is in the box

**Public website** — CMS-driven homepage and pages · inventory with real-data filters (make, model, year, price, mileage, body, fuel, transmission, drivetrain, colour, condition, availability), search, sort, pagination, grid/list · vehicle pages with gallery, specs, features, history, payment estimator, similar vehicles, JSON-LD · enquiry, test-drive, financing and trade-in forms · blog · FAQ · services · contact with map · SEO (titles, meta, Open Graph, canonical, sitemap.xml, robots.txt) · responsive, accessible, lazy-loaded images.

**Admin portal** — dashboard (live stats) · inventory (CRUD, duplicate, bulk actions, multi-image upload, drag-reorder, primary image, publish/unpublish, feature, sold, archive) · leads (filters, assignment, status, notes, follow-ups, history, CSV export) · customers · CMS (pages + section builder with reorder/hide/show/preview/publish, navigation, categories, banners, testimonials, FAQs, services, blog, media library) · appearance (logo, favicon, colours, fonts, button shape, width) · settings (business, hours, contact, social, SEO, currency/units, …) · users & roles · audit log · notifications · global search.

**Roles** — Super Admin, Administrator, Sales Manager, Sales Representative, Content Manager. Permissions are enforced by the API on every request (`requirePermission`), and sales reps only ever see leads assigned to them.

Architecture, data model and extension guides: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Verification status

| Area | Status |
|---|---|
| API: auth, RBAC, vehicles, filtering, leads, CMS, uploads, DB relationships, validation | 80 automated tests passing against PostgreSQL |
| UI components, forms, section renderer, formatting | 15 automated tests passing |
| Customer → database → admin workflows, CMS edits reflected on the site, branding, RBAC in the UI, mobile, SEO | 16 Playwright tests passing |
| Type-check (API + web) and production web build | passing |

**Not testable without your credentials** (implemented and documented, but unverified against the live services): Cloudinary uploads (local-disk storage is used and tested when unconfigured), SMTP delivery (emails are logged to the console when unconfigured), Google Maps API key embed (a keyless embed is used otherwise).

## Known limitations & decisions

* **SEO rendering** — the site is a client-rendered SPA. The API serves `sitemap.xml`/`robots.txt`, and pages set meta tags and JSON-LD at runtime (Google renders JavaScript), but social-card scrapers that don't run JS will see only the default tags. Add prerendering/SSR if link previews matter.
* **Dependency advisories** — `npm audit` reports advisories fixable only by major upgrades: zod 4, react-router 7, Prisma 7 (tooling-only `deepmerge-ts`). They were not applied automatically because they are breaking changes. Mitigations in place: request bodies are capped at 1 MB and CMS arrays have size limits; no user-supplied URL is passed to `navigate`. Plan these upgrades as a separate task.
* **Rich text** is HTML authored by trusted CMS users; it is sanitised again on render (scripts, handlers, `javascript:` stripped). Use a proper sanitiser such as DOMPurify if untrusted users ever get CMS access.
* **No payments** and no online credit checks — financing applications are leads for your finance team; they store only what the form collects (no SIN).
* Seed vehicle photos are generated placeholder SVGs — replace them via the admin portal.
