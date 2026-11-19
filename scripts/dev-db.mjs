/**
 * Zero-config throwaway PostgreSQL for development/CI when you don't want to use a system install.
 *   node scripts/dev-db.mjs          â†’ starts on :5433, creates databases "cardealer" and "cardealer_test"
 * Data lives in ./.devdb (git-ignored). Stop with Ctrl+C.
 * Connection string: postgresql://dev:dev@localhost:5433/cardealer
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../.devdb");
const fresh = !fs.existsSync(path.join(dir, "PG_VERSION"));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "dev", password: "dev", port: 5433, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"] });
if (fresh) await pg.initialise();
await pg.start();
for (const db of ["cardealer", "cardealer_test"]) {
  try { await pg.createDatabase(db); } catch { /* exists */ }
}
console.log("Dev PostgreSQL ready on localhost:5433 (user dev / password dev). Ctrl+C to stop.");
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
