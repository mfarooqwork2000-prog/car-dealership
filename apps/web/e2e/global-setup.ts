import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export const E2E_ADMIN = { email: "e2e-owner@example.test", password: "E2eOnlyPassw0rd!" };
export const E2E_REP = { email: "e2e-rep@example.test", password: "E2eOnlyPassw0rd!" };

/** Resets the TEST database, seeds demo data and creates throwaway e2e accounts (never the dev DB). */
export default async function globalSetup() {
  const root = path.resolve(import.meta.dirname, "../../..");
  const url = process.env.TEST_DATABASE_URL!;
  if (url === process.env.DATABASE_URL) throw new Error("Refusing to reset the dev database");
  const env = { ...process.env, DATABASE_URL: url } as NodeJS.ProcessEnv;
  const run = (cmd: string, extra: NodeJS.ProcessEnv = {}) => execSync(cmd, { cwd: root, env: { ...env, ...extra }, stdio: "pipe" });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();

  run("npx tsx prisma/seed.ts");
  run("npx tsx apps/api/src/scripts/create-admin.ts", { ADMIN_EMAIL: E2E_ADMIN.email, ADMIN_PASSWORD: E2E_ADMIN.password, ADMIN_FIRST_NAME: "E2E", ADMIN_LAST_NAME: "Owner" });

  const db = new PrismaClient({ datasources: { db: { url } } });
  const bcrypt = (await import("bcryptjs")).default;
  const role = await db.role.findUniqueOrThrow({ where: { key: "SALES_REP" } });
  await db.user.create({ data: { email: E2E_REP.email, firstName: "Rita", lastName: "Rep", roleId: role.id, passwordHash: await bcrypt.hash(E2E_REP.password, 4) } });
  await db.$disconnect();
}
