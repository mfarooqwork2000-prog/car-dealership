# Deployment

The system is three parts: **PostgreSQL**, the **API** (Node process) and the **web build** (static files). Pick any host; the steps are the same.

## 1. Provision
* A managed PostgreSQL (UTF-8). Create a dedicated, least-privilege user.
* Node.js 22+ for the API.
* HTTPS everywhere (set `COOKIE_SECURE=true`).
* Persistent storage for `./uploads` **or** a Cloudinary account (recommended on hosts with ephemeral disks).

## 2. Production environment
```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://dealer:***@db-host:5432/cardealer?schema=public
CLIENT_URL=https://www.example.com          # exact public origin; comma-separate if several
JWT_ACCESS_SECRET=<64 hex chars>            # different from dev, never reused
JWT_REFRESH_SECRET=<64 hex chars>
COOKIE_SECURE=true
CLOUDINARY_CLOUD_NAME= / _API_KEY= / _API_SECRET=
SMTP_HOST= SMTP_PORT=587 SMTP_USER= SMTP_PASS= EMAIL_FROM="Dealership <no-reply@example.com>"
```
Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Rotating `JWT_REFRESH_SECRET` is not required to revoke sessions (refresh tokens are server-side, hashed); rotating `JWT_ACCESS_SECRET` signs everyone out within 15 minutes.

## 3. Build & migrate
```bash
npm ci
npm run db:deploy            # applies migrations (never `migrate dev` in production)
npm run db:seed:minimal      # first deploy: roles, permissions, theme, settings, navigation, categories and starter pages — NO demo vehicles/customers/leads
npm run admin:create         # first Super Admin
npm run build                # type-checks API, builds apps/web/dist
```
Use `npm run db:seed` instead of `db:seed:minimal` only on a demo/staging server: it also inserts sample vehicles (with placeholder images), customers, leads, testimonials, FAQs and a blog post. Both are idempotent. The roles and permissions seeded here are required — `admin:create` fails without them. The starter pages mention the sample dealership name ("Aurelian Motors"); change it under **Settings** and edit the page text under **Pages**.

## 4. Run the API
```bash
npm run start                # tsx apps/api/src/server.ts
```
Run it under a supervisor (systemd, PM2, Docker, your PaaS) with restart-on-failure. Health check: `GET /api/health`. API docs at `/api/docs` — restrict or disable that route at your proxy if you don't want it public.

## 5. Serve the web build
Serve `apps/web/dist` as static files with an SPA fallback (all unknown paths → `index.html`), and reverse-proxy these paths to the API on the **same origin** (this keeps cookies first-party and avoids CORS):
```
/api/*  /uploads/*  /sitemap.xml  /robots.txt   →  http://127.0.0.1:4000
```
Example nginx:
```nginx
server {
  listen 443 ssl http2;
  server_name www.example.com;
  root /srv/dealership/apps/web/dist;
  client_max_body_size 25m;

  location ~ ^/(api|uploads)/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
  location = /sitemap.xml     { proxy_pass http://127.0.0.1:4000; }
  location = /robots.txt      { proxy_pass http://127.0.0.1:4000; }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
  location / { try_files $uri /index.html; }
}
```
The API trusts one proxy hop (`trust proxy = 1`) so rate limiting sees real client IPs behind nginx. If you put another proxy/CDN in front, adjust that setting in `apps/api/src/app.ts`.

## 6. After go-live
1. Sign in, open **Settings** and enter real contact details, hours and SEO text; **Appearance** for logo and colours.
2. Replace or delete the sample pages, vehicles, testimonials and blog post.
3. Create staff accounts under **Users & Roles** with the lowest role that fits.
4. Set up database backups (daily `pg_dump` or your provider's PITR) and back up `uploads/` if not using Cloudinary.
5. Submit `https://your-domain/sitemap.xml` to Google Search Console.
6. Send a test enquiry and confirm the email/notification flow (needs SMTP configured).

## Updating
```bash
git pull && npm ci && npm run db:deploy && npm run build   # then restart the API and publish apps/web/dist
```
Always take a database backup before `db:deploy`.
