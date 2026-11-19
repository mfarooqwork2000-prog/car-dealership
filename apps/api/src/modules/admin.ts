import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema, ROLE_KEYS, ROLE_LABELS, ROLE_PERMISSIONS, PERMISSIONS } from "@cd/shared";
import { prisma } from "../db.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { audit } from "../services/core.js";
import { badRequest, conflict, created, forbidden, notFound, ok, pageMeta, pageParams, parse, wrap } from "../utils/http.js";

export const adminRouter = Router();
adminRouter.use(authenticate);

// ═════════ Users & roles ═════════
const userSelect = { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true, role: { select: { key: true, name: true } } };
const users = Router();

users.get("/", requirePermission("users:read"), wrap(async (_req, res) => ok(res, await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } }))));
// lightweight list for assignee pickers (anyone who can see leads)
users.get("/assignable", requirePermission("leads:assign", "users:read"), wrap(async (_req, res) => ok(res, await prisma.user.findMany({ where: { isActive: true, role: { key: { in: ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "SALES_REP"] } } }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" } }))));

const guardSuper = (actorRole: string, targetRole: string) => {
  if (targetRole === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") throw forbidden("Only a Super Admin can manage Super Admin accounts");
};
const userBase = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), phone: z.string().trim().max(30).optional().nullable(), role: z.enum(ROLE_KEYS), isActive: z.boolean().default(true) });

users.post("/", requirePermission("users:write"), wrap(async (req, res) => {
  const d = parse(userBase.extend({ email: z.string().trim().toLowerCase().email(), password: passwordSchema }), req.body);
  guardSuper(req.user!.role, d.role);
  if (await prisma.user.findUnique({ where: { email: d.email } })) throw conflict("Email already registered");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: d.role } });
  const u = await prisma.user.create({ data: { email: d.email, firstName: d.firstName, lastName: d.lastName, phone: d.phone, isActive: d.isActive, roleId: role.id, passwordHash: await bcrypt.hash(d.password, 12) }, select: userSelect });
  await audit(req, "create", "User", u.id, { role: d.role });
  created(res, u);
}));

users.put("/:id", requirePermission("users:write"), wrap(async (req, res) => {
  const d = parse(userBase.partial().extend({ password: passwordSchema.optional() }), req.body);
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
  if (!target) throw notFound();
  guardSuper(req.user!.role, target.role.key);
  if (d.role) guardSuper(req.user!.role, d.role);
  if (target.id === req.user!.id && (d.isActive === false || (d.role && d.role !== target.role.key))) throw badRequest("You cannot deactivate or change the role of your own account");
  // never remove the last active super admin
  if (target.role.key === "SUPER_ADMIN" && (d.isActive === false || (d.role && d.role !== "SUPER_ADMIN"))) {
    if ((await prisma.user.count({ where: { isActive: true, role: { key: "SUPER_ADMIN" } } })) <= 1) throw badRequest("At least one active Super Admin is required");
  }
  const { password, role, ...rest } = d;
  const u = await prisma.user.update({
    where: { id: target.id },
    data: { ...rest, ...(role ? { roleId: (await prisma.role.findUniqueOrThrow({ where: { key: role } })).id } : {}), ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
    select: userSelect,
  });
  if (d.isActive === false || password) await prisma.refreshSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, "update", "User", u.id, { ...rest, role, passwordChanged: !!password });
  ok(res, u);
}));

users.delete("/:id", requirePermission("users:write"), wrap(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
  if (!target) throw notFound();
  guardSuper(req.user!.role, target.role.key);
  if (target.id === req.user!.id) throw badRequest("You cannot delete your own account");
  if (target.role.key === "SUPER_ADMIN" && (await prisma.user.count({ where: { role: { key: "SUPER_ADMIN" } } })) <= 1) throw badRequest("Cannot delete the last Super Admin");
  await prisma.user.delete({ where: { id: target.id } });
  await audit(req, "delete", "User", target.id, { email: target.email });
  ok(res, { deleted: true });
}));
adminRouter.use("/users", users);

adminRouter.get("/roles", requirePermission("users:read"), wrap(async (_req, res) => {
  const counts = await prisma.user.groupBy({ by: ["roleId"], _count: true });
  const roles = await prisma.role.findMany();
  ok(res, ROLE_KEYS.map((k) => ({ key: k, name: ROLE_LABELS[k], permissions: ROLE_PERMISSIONS[k], users: counts.find((c) => c.roleId === roles.find((r) => r.key === k)?.id)?._count ?? 0 })), { allPermissions: PERMISSIONS });
}));

// ═════════ Settings ═════════
const SETTING_KEYS = ["general", "contact", "hours", "social", "seo", "email", "images", "notifications", "privacy", "footer", "header", "maps"] as const;
const settings = Router();
settings.get("/", requirePermission("settings:read"), wrap(async (_req, res) => {
  const rows = await prisma.websiteSetting.findMany();
  ok(res, Object.fromEntries(rows.map((r) => [r.key, r.value])));
}));
settings.put("/:key", requirePermission("settings:write"), wrap(async (req, res, next) => {
  const key = req.params.key;
  if (key === "theme") return next("route"); // handled by the dedicated theme route below
  if (!(SETTING_KEYS as readonly string[]).includes(key)) throw notFound("Unknown settings group");
  const value = parse(z.record(z.unknown()), req.body);
  if (JSON.stringify(value).length > 50_000) throw badRequest("Settings payload too large");
  const row = await prisma.websiteSetting.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } });
  await audit(req, "update", "WebsiteSetting", key);
  ok(res, row.value);
}));
settings.get("/theme", requirePermission("settings:read"), wrap(async (_req, res) => ok(res, await prisma.themeSetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }))));
settings.put("/theme", requirePermission("settings:write"), wrap(async (req, res) => {
  const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f172a");
  const font = z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9 \-]+$/, "Letters, numbers and spaces only");
  const d = parse(z.object({ primaryColor: hex, secondaryColor: hex, accentColor: hex, headingFont: font, bodyFont: font, logoUrl: z.string().max(500).nullable().optional(), faviconUrl: z.string().max(500).nullable().optional(), buttonRadius: z.string().regex(/^\d+(\.\d+)?(rem|px)$/), layoutWidth: z.string().regex(/^\d+(px|rem)$/) }).partial(), req.body);
  const t = await prisma.themeSetting.upsert({ where: { id: "default" }, update: d, create: { id: "default", ...d } });
  await audit(req, "update", "ThemeSetting", "default");
  ok(res, t);
}));
adminRouter.use("/settings", settings);

// ═════════ Dashboard ═════════
adminRouter.get("/dashboard", requirePermission("dashboard:view"), wrap(async (req, res) => {
  const reader = !req.user!.permissions.includes("leads:read:all");
  const lw = reader ? { assigneeId: req.user!.id } : {};
  const since = new Date(Date.now() - 30 * 864e5);
  const [vTotal, vByStatus, leadByType, leadByStatus, newLeads, totalLeads, recentLeads, recentActivity, perDay, inventoryValue] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.groupBy({ by: ["status"], _count: true }),
    prisma.lead.groupBy({ by: ["type"], where: lw, _count: true }),
    prisma.lead.groupBy({ by: ["status"], where: lw, _count: true }),
    prisma.lead.count({ where: { ...lw, status: "NEW" } }),
    prisma.lead.count({ where: lw }),
    prisma.lead.findMany({ where: lw, include: { customer: true, vehicle: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    req.user!.permissions.includes("audit:read") ? prisma.auditLog.findMany({ include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 8 }) : Promise.resolve([]),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, count(*) FROM "Lead" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.vehicle.aggregate({ where: { status: "AVAILABLE" }, _sum: { price: true } }),
  ]);
  const vs = (s: string) => vByStatus.find((x) => x.status === s)?._count ?? 0;
  const lt = (t: string) => leadByType.find((x) => x.type === t)?._count ?? 0;
  ok(res, {
    vehicles: { total: vTotal, available: vs("AVAILABLE"), sold: vs("SOLD"), pending: vs("PENDING"), archived: vs("ARCHIVED"), inventoryValue: Number(inventoryValue._sum.price ?? 0) },
    leads: { total: totalLeads, new: newLeads, testDrives: lt("TEST_DRIVE"), financing: lt("FINANCING"), tradeIns: lt("TRADE_IN"), vehicleEnquiries: lt("VEHICLE"), general: lt("GENERAL"), byStatus: leadByStatus.map((x) => ({ status: x.status, count: x._count })), perDay: perDay.map((d) => ({ day: d.day.toISOString().slice(0, 10), count: Number(d.count) })) },
    recentLeads, recentActivity,
  });
}));

// ═════════ Notifications ═════════
const notifications = Router();
notifications.get("/", wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 20);
  const where = { userId: req.user!.id };
  const [total, unread, items] = await Promise.all([prisma.notification.count({ where }), prisma.notification.count({ where: { ...where, readAt: null } }), prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take })]);
  ok(res, items, { ...pageMeta(total, page, limit), unread });
}));
notifications.post("/read-all", wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  ok(res, { done: true });
}));
notifications.post("/:id/read", wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { readAt: new Date() } });
  ok(res, { done: true });
}));
adminRouter.use("/notifications", notifications);

// ═════════ Audit log ═════════
adminRouter.get("/audit-logs", requirePermission("audit:read"), wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 30);
  const where = req.query.entity ? { entity: String(req.query.entity) } : {};
  const [total, items] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({ where, include: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: "desc" }, skip, take })]);
  ok(res, items, pageMeta(total, page, limit));
}));

// ═════════ Global admin search ═════════
adminRouter.get("/search", wrap(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return ok(res, { vehicles: [], leads: [], customers: [] });
  const p = req.user!.permissions;
  const ci = { contains: q, mode: "insensitive" as const };
  const [vehicles, leads, customers] = await Promise.all([
    p.includes("vehicles:read") ? prisma.vehicle.findMany({ where: { OR: [{ title: ci }, { stockNumber: ci }, { vin: ci }] }, select: { id: true, title: true, stockNumber: true }, take: 5 }) : [],
    p.includes("leads:read:all") ? prisma.lead.findMany({ where: { OR: [{ subject: ci }, { customer: { OR: [{ firstName: ci }, { lastName: ci }, { email: ci }] } }] }, select: { id: true, subject: true, customer: { select: { firstName: true, lastName: true } } }, take: 5 }) : [],
    p.includes("customers:read") ? prisma.customer.findMany({ where: { OR: [{ firstName: ci }, { lastName: ci }, { email: ci }] }, select: { id: true, firstName: true, lastName: true, email: true }, take: 5 }) : [],
  ]);
  ok(res, { vehicles, leads, customers });
}));
