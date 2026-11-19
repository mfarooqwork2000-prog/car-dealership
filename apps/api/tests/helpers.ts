import bcrypt from "bcryptjs";
import request from "supertest";
import { PERMISSIONS, ROLE_KEYS, ROLE_LABELS, ROLE_PERMISSIONS, type RoleKey } from "@cd/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

export const app = createApp();
export const PASSWORD = "TestPassw0rd!";
// bcrypt cost 4 keeps the suite fast; production uses 12
const HASH = bcrypt.hashSync(PASSWORD, 4);

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  for (const [key, label] of Object.entries(PERMISSIONS)) await prisma.permission.create({ data: { key, label } });
  for (const key of ROLE_KEYS) {
    const role = await prisma.role.create({ data: { key, name: ROLE_LABELS[key] } });
    const perms = await prisma.permission.findMany({ where: { key: { in: ROLE_PERMISSIONS[key] } } });
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
}

export async function makeUser(role: RoleKey, email = `${role.toLowerCase()}@test.dev`) {
  const r = await prisma.role.findUniqueOrThrow({ where: { key: role } });
  return prisma.user.create({ data: { email, firstName: role, lastName: "User", passwordHash: HASH, roleId: r.id } });
}

/** Returns an authenticated supertest "as" helper carrying a bearer token. */
export async function loginAs(role: RoleKey) {
  const email = `${role.toLowerCase()}@test.dev`;
  if (!(await prisma.user.findUnique({ where: { email } }))) await makeUser(role);
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  const token = res.body.data.accessToken as string;
  const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
  return {
    token,
    get: (p: string) => auth(request(app).get(p)),
    post: (p: string) => auth(request(app).post(p)),
    put: (p: string) => auth(request(app).put(p)),
    patch: (p: string) => auth(request(app).patch(p)),
    del: (p: string) => auth(request(app).delete(p)),
  };
}

export const vehicleBody = (over: Record<string, unknown> = {}) => ({
  title: "2022 Test Make Model", stockNumber: `T${Math.random().toString(36).slice(2, 8)}`, makeName: "Testmake", modelName: "Modelx", year: 2022, price: 30000, mileage: 15000,
  condition: "USED", status: "AVAILABLE", publishStatus: "PUBLISHED", isFeatured: false, bodyType: "SUV", fuelType: "Gasoline", transmission: "Automatic", drivetrain: "AWD", exteriorColor: "Blue", features: [{ name: "Sunroof" }], ...over,
});

// 1x1 transparent PNG
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
export { prisma, request };
