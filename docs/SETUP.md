# Setup

## 1. Requirements
* Node.js 22 or newer (developed on 26) and npm 10+
* PostgreSQL 14+ (any recent version; developed against 18)

## 2. Install
```bash
npm install
```

## 3. Create the databases
Using `psql` (run as a PostgreSQL superuser):
```sql
CREATE DATABASE cardealer      ENCODING 'UTF8' TEMPLATE template0;
CREATE DATABASE cardealer_test ENCODING 'UTF8' TEMPLATE template0;
-- optional dedicated user instead of "postgres":
CREATE USER dealer WITH PASSWORD 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE cardealer, cardealer_test TO dealer;
\c cardealer
GRANT ALL ON SCHEMA public TO dealer;
\c cardealer_test
GRANT ALL ON SCHEMA public TO dealer;
```
The databases **must be UTF-8** (the seed data contains characters such as `★` and `°`). On Windows, PostgreSQL installers sometimes pick a WIN1252 default; specify `ENCODING 'UTF8'` as above.

No server available? `npm run dev:db` runs a throw-away embedded PostgreSQL on port 5433 (user `dev`, password `dev`) with both databases created — good for evaluating the project or CI. Data is kept in `.devdb/` (git-ignored).

## 4. Configure environment
Copy `.env.example` to `.env` and fill in:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://USER:PASSWORD@localhost:5432/cardealer?schema=public` |
| `TEST_DATABASE_URL` | A **different** database. Tests and e2e wipe it; they refuse to run if it equals `DATABASE_URL`. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Long random strings: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLIENT_URL` | Public site origin (used for CORS, password-reset links, sitemap) |
| `COOKIE_SECURE` | `true` in production (HTTPS) |
| `CLOUDINARY_*` | Optional. When all three are set, images go to Cloudinary; otherwise to `./uploads` |
| `SMTP_*`, `EMAIL_FROM` | Optional. When `SMTP_HOST` is empty, emails are printed to the API console |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional. Enables the Maps Embed API; a keyless embed is used otherwise |

Never commit `.env`. All secrets are read from the environment; none are in the frontend bundle.

## 5. Database
```bash
npm run db:migrate    # development: applies migrations (creates one on schema change)
npm run db:seed       # demo content/vehicles, roles & permissions — safe to re-run
```
Production uses `npm run db:deploy` (applies existing migrations only) followed by `npm run db:seed:minimal`, which seeds only the required roles/permissions, settings, navigation and starter pages — no demo vehicles, customers or leads.

## 6. Create the Super Admin
```bash
npm run admin:create
```
It prompts for email, name and password (hidden input; 10+ chars with upper, lower and a number). There are **no default accounts or passwords**. For automation set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` in the environment of that one command. Running it again for an existing email resets that user's password and re-activates them.

## 7. Run
```bash
npm run dev
```

## 8. Run the tests
```bash
npm test             # API + UI tests (needs TEST_DATABASE_URL migrated: DATABASE_URL=<test url> npm run db:deploy)
npm run test:e2e     # Playwright; resets and seeds the TEST database, starts API :4100 + web :5174 itself
```
First-time test database: `DATABASE_URL="<your TEST_DATABASE_URL>" npm run db:deploy`.
E2E uses the system-installed Google Chrome (`channel: "chrome"`); if you don't have Chrome run `npx playwright install chromium` and remove the `channel` line in `apps/web/playwright.config.ts`.

## Troubleshooting
* *`character with byte sequence … in encoding "UTF8" has no equivalent in encoding "WIN1252"`* — the database isn't UTF-8; recreate it with `ENCODING 'UTF8'`.
* *`Invalid environment configuration`* on API start — a required `.env` value is missing (secrets need 16+ characters).
* *Login says "Too many attempts"* — 20 failed sign-ins per 15 minutes per IP; wait or restart the API in development.
* *Images 404 in development* — Vite proxies `/uploads` to the API; make sure the API is running.
