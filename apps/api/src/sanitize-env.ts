// Hosting dashboards/CLIs sometimes store values with a BOM or trailing whitespace; normalise before config is parsed.
for (const [k, v] of Object.entries(process.env)) {
  if (typeof v === "string") {
    const clean = v.replace(/^\uFEFF/, "").trim();
    if (clean !== v) process.env[k] = clean;
  }
}
// Serverless: many short-lived instances exhaust Supabase's session pooler (port 5432).
// Use the transaction pooler (6543) with Prisma's pgbouncer mode and one connection per instance.
if (process.env.VERCEL && process.env.DATABASE_URL?.includes(".pooler.supabase.com")) {
  try {
    const u = new URL(process.env.DATABASE_URL);
    if (u.port === "5432" || u.port === "") u.port = "6543";
    u.searchParams.set("pgbouncer", "true");
    u.searchParams.set("connection_limit", "1");
    process.env.DATABASE_URL = u.toString();
  } catch { /* leave as is */ }
}