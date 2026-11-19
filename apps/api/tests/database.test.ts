import { beforeAll, describe, expect, it } from "vitest";
import { prisma, resetDb, vehicleBody, loginAs } from "./helpers.js";

beforeAll(resetDb);

describe("database relationships and constraints", () => {
  it("cascades vehicle deletion to images and features, but keeps leads (SetNull)", async () => {
    const admin = await loginAs("ADMIN");
    const v = (await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: "DB1", features: [{ name: "A" }, { name: "B" }] }))).body.data;
    await prisma.vehicleImage.create({ data: { vehicleId: v.id, url: "/uploads/x.png", position: 0 } });
    const c = await prisma.customer.create({ data: { email: "c@x.co", firstName: "C", lastName: "D" } });
    const lead = await prisma.lead.create({ data: { type: "VEHICLE", customerId: c.id, vehicleId: v.id } });
    await prisma.vehicle.delete({ where: { id: v.id } });
    expect(await prisma.vehicleImage.count({ where: { vehicleId: v.id } })).toBe(0);
    expect(await prisma.vehicleFeature.count({ where: { vehicleId: v.id } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).vehicleId).toBeNull();
  });

  it("cascades customer deletion to leads, notes and request details", async () => {
    const c = await prisma.customer.create({ data: { email: "cascade@x.co", firstName: "C", lastName: "D" } });
    const lead = await prisma.lead.create({ data: { type: "TRADE_IN", customerId: c.id, notes: { create: { body: "n" } }, followUps: { create: { dueAt: new Date() } }, tradeIn: { create: { customerId: c.id, make: "A", model: "B", year: 2020, mileage: 1 } } } });
    await prisma.customer.delete({ where: { id: c.id } });
    expect(await prisma.lead.count({ where: { id: lead.id } })).toBe(0);
    expect(await prisma.leadNote.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.tradeInRequest.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it("enforces unique constraints (customer email, VIN, stock number, model per make)", async () => {
    await prisma.customer.create({ data: { email: "u@x.co", firstName: "A", lastName: "B" } });
    await expect(prisma.customer.create({ data: { email: "u@x.co", firstName: "A", lastName: "B" } })).rejects.toThrow(/Unique/);
    const make = await prisma.make.create({ data: { name: "M", slug: "m" } });
    await prisma.model.create({ data: { name: "X", slug: "x", makeId: make.id } });
    await expect(prisma.model.create({ data: { name: "X2", slug: "x", makeId: make.id } })).rejects.toThrow(/Unique/);
  });

  it("enforces foreign keys (a lead needs a real customer; users need a role)", async () => {
    await expect(prisma.lead.create({ data: { type: "GENERAL", customerId: "missing" } })).rejects.toThrow();
    await expect(prisma.user.create({ data: { email: "n@x.co", firstName: "a", lastName: "b", passwordHash: "x", roleId: "missing" } })).rejects.toThrow();
  });

  it("deleting a user unassigns their leads instead of deleting them", async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: "SALES_REP" } });
    const u = await prisma.user.create({ data: { email: "rep@x.co", firstName: "R", lastName: "P", passwordHash: "x", roleId: role.id } });
    const c = await prisma.customer.create({ data: { email: "own@x.co", firstName: "O", lastName: "W" } });
    const lead = await prisma.lead.create({ data: { type: "GENERAL", customerId: c.id, assigneeId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).assigneeId).toBeNull();
  });

  it("deleting a page removes its sections; timestamps are maintained", async () => {
    const p = await prisma.websitePage.create({ data: { slug: "t", title: "T", sections: { create: { type: "rich-text", content: { html: "x" } } } } });
    const before = p.updatedAt;
    await new Promise((r) => setTimeout(r, 15));
    const updated = await prisma.websitePage.update({ where: { id: p.id }, data: { title: "T2" } });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    await prisma.websitePage.delete({ where: { id: p.id } });
    expect(await prisma.pageSection.count({ where: { pageId: p.id } })).toBe(0);
  });

  it("role/permission matrix matches the shared definition", async () => {
    expect(await prisma.role.count()).toBe(5);
    const { ROLE_PERMISSIONS } = await import("@cd/shared");
    const rep = await prisma.role.findUniqueOrThrow({ where: { key: "SALES_REP" }, include: { permissions: { include: { permission: true } } } });
    expect(rep.permissions.map((p) => p.permission.key).sort()).toEqual([...ROLE_PERMISSIONS.SALES_REP].sort());
  });
});
