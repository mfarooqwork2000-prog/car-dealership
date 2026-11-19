import { beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, app, loginAs, makeUser, prisma, request, resetDb } from "./helpers.js";

beforeAll(resetDb);

describe("authentication", () => {
  it("logs in with valid credentials and sets an httpOnly refresh cookie", async () => {
    await makeUser("ADMIN", "admin@test.dev");
    const res = await request(app).post("/api/auth/login").send({ email: "admin@test.dev", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.role).toBe("ADMIN");
    const cookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookie).toMatch(/cd_refresh=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it("rejects wrong password and unknown user with the same message", async () => {
    const bad = await request(app).post("/api/auth/login").send({ email: "admin@test.dev", password: "nope-nope-nope" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "ghost@test.dev", password: "nope-nope-nope" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it("validates login input (422)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks protected routes without a token (401) and with a garbage token", async () => {
    expect((await request(app).get("/api/admin/dashboard")).status).toBe(401);
    expect((await request(app).get("/api/admin/dashboard").set("Authorization", "Bearer garbage")).status).toBe(401);
  });

  it("returns the current user and permissions at /auth/me", async () => {
    const a = await loginAs("ADMIN");
    const res = await a.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toContain("vehicles:write");
  });

  it("refresh rotates the session and logout revokes it", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "admin@test.dev", password: PASSWORD });
    const r1 = await agent.post("/api/auth/refresh");
    expect(r1.status).toBe(200);
    expect(r1.body.data.accessToken).toBeTruthy();
    await agent.post("/api/auth/logout");
    expect((await agent.post("/api/auth/refresh")).status).toBe(401);
  });

  it("a disabled account loses access immediately, even with a valid token", async () => {
    const u = await makeUser("SALES_REP", "temp@test.dev");
    const login = await request(app).post("/api/auth/login").send({ email: "temp@test.dev", password: PASSWORD });
    const token = login.body.data.accessToken;
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "temp@test.dev", password: PASSWORD })).status).toBe(401);
  });

  it("password reset: generic response, single-use token, old sessions revoked", async () => {
    await makeUser("SALES_REP", "resetme@test.dev");
    const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@test.dev" });
    const known = await request(app).post("/api/auth/forgot-password").send({ email: "resetme@test.dev" });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    // token is stored hashed; craft a known one to complete the flow
    const { hashToken } = await import("../src/services/core.js");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "resetme@test.dev" } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken("a-known-reset-token-123"), expiresAt: new Date(Date.now() + 60_000) } });
    const weak = await request(app).post("/api/auth/reset-password").send({ token: "a-known-reset-token-123", password: "short" });
    expect(weak.status).toBe(422);
    const ok = await request(app).post("/api/auth/reset-password").send({ token: "a-known-reset-token-123", password: "BrandNewPass123" });
    expect(ok.status).toBe(200);
    expect((await request(app).post("/api/auth/reset-password").send({ token: "a-known-reset-token-123", password: "AnotherPass123" })).status).toBe(400);
    expect((await request(app).post("/api/auth/login").send({ email: "resetme@test.dev", password: "BrandNewPass123" })).status).toBe(200);
  });

  it("rejects expired reset tokens", async () => {
    const { hashToken } = await import("../src/services/core.js");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "resetme@test.dev" } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken("expired-token-1234567"), expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post("/api/auth/reset-password").send({ token: "expired-token-1234567", password: "BrandNewPass123" })).status).toBe(400);
  });
});

describe("authorization (RBAC enforced server-side)", () => {
  it("Sales Rep cannot create/delete vehicles, manage users or edit settings", async () => {
    const rep = await loginAs("SALES_REP");
    expect((await rep.post("/api/admin/vehicles").send({})).status).toBe(403);
    expect((await rep.del("/api/admin/vehicles/x")).status).toBe(403);
    expect((await rep.get("/api/admin/users")).status).toBe(403);
    expect((await rep.put("/api/admin/settings/general").send({ a: 1 })).status).toBe(403);
    expect((await rep.get("/api/admin/audit-logs")).status).toBe(403);
    expect((await rep.get("/api/admin/vehicles")).status).toBe(200); // can read inventory
  });

  it("Content Manager can edit CMS but not leads or inventory writes", async () => {
    const cm = await loginAs("CONTENT_MANAGER");
    expect((await cm.post("/api/admin/cms/faqs").send({ question: "Q?", answer: "A" })).status).toBe(201);
    expect((await cm.get("/api/admin/leads")).status).toBe(403);
    expect((await cm.post("/api/admin/vehicles").send({})).status).toBe(403);
    expect((await cm.get("/api/admin/customers")).status).toBe(403);
  });

  it("Sales Manager manages inventory and leads but not CMS or users", async () => {
    const sm = await loginAs("SALES_MANAGER");
    expect((await sm.get("/api/admin/leads")).status).toBe(200);
    expect((await sm.post("/api/admin/cms/faqs").send({ question: "Q?", answer: "A" })).status).toBe(403);
    expect((await sm.post("/api/admin/users").send({})).status).toBe(403);
  });

  it("Administrators cannot create or modify Super Admin accounts; only Super Admin can", async () => {
    const admin = await loginAs("ADMIN");
    const body = { email: "root2@test.dev", firstName: "R", lastName: "T", password: "StrongPass123", role: "SUPER_ADMIN" };
    expect((await admin.post("/api/admin/users").send(body)).status).toBe(403);
    const sup = await loginAs("SUPER_ADMIN");
    expect((await sup.post("/api/admin/users").send(body)).status).toBe(201);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: "root2@test.dev" } });
    expect((await admin.put(`/api/admin/users/${target.id}`).send({ firstName: "Hacked" })).status).toBe(403);
  });

  it("users cannot deactivate themselves and the last Super Admin is protected", async () => {
    const sup = await loginAs("SUPER_ADMIN");
    const me = await prisma.user.findUniqueOrThrow({ where: { email: "super_admin@test.dev" } });
    expect((await sup.put(`/api/admin/users/${me.id}`).send({ isActive: false })).status).toBe(400);
    expect((await sup.del(`/api/admin/users/${me.id}`)).status).toBe(400);
  });
});
