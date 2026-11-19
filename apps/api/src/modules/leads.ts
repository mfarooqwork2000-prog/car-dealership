import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { financingSchema, generalEnquirySchema, LEAD_STATUSES, LEAD_TYPES, testDriveSchema, tradeInSchema, vehicleEnquirySchema } from "@cd/shared";
import { prisma } from "../db.js";
import { authenticate, can, requirePermission } from "../middleware/auth.js";
import { audit, notifyStaff, sendEmail } from "../services/core.js";
import { created, forbidden, notFound, ok, pageMeta, pageParams, parse, wrap } from "../utils/http.js";

// ═════════ PUBLIC FORM SUBMISSIONS ═════════
export const publicLeads = Router();
publicLeads.use(rateLimit({ windowMs: 60 * 60 * 1000, limit: process.env.NODE_ENV === "test" ? 10000 : 30, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: "RATE_LIMITED", message: "Too many submissions, please try again later" } } }));

type Person = { firstName: string; lastName: string; email: string; phone?: string };
async function upsertCustomer(p: Person) {
  return prisma.customer.upsert({ where: { email: p.email }, update: { firstName: p.firstName, lastName: p.lastName, ...(p.phone ? { phone: p.phone } : {}) }, create: { email: p.email, firstName: p.firstName, lastName: p.lastName, phone: p.phone || null } });
}
async function afterLead(leadId: string, p: Person, label: string) {
  await notifyStaff(`New ${label}`, `${p.firstName} ${p.lastName} (${p.email})`, `/admin/leads/${leadId}`);
  await sendEmail(p.email, "We received your request", `<p>Hi ${escapeHtml(p.firstName)},</p><p>Thanks for contacting us about your ${label.toLowerCase()}. A member of our team will be in touch shortly.</p>`).catch(() => undefined);
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function vehicleOr404(id?: string) {
  if (!id) return null;
  const v = await prisma.vehicle.findFirst({ where: { id, publishStatus: "PUBLISHED" } });
  if (!v) throw notFound("Vehicle not found");
  return v;
}

publicLeads.post("/general", wrap(async (req, res) => {
  const d = parse(generalEnquirySchema, req.body);
  const c = await upsertCustomer(d);
  const lead = await prisma.lead.create({ data: { type: "GENERAL", customerId: c.id, subject: d.subject, message: d.message } });
  await afterLead(lead.id, d, "enquiry");
  created(res, { id: lead.id });
}));

publicLeads.post("/vehicle", wrap(async (req, res) => {
  const d = parse(vehicleEnquirySchema, req.body);
  const v = await vehicleOr404(d.vehicleId);
  const c = await upsertCustomer(d);
  const lead = await prisma.lead.create({ data: { type: "VEHICLE", customerId: c.id, vehicleId: v!.id, subject: d.subject || `Enquiry: ${v!.title}`, message: d.message } });
  await afterLead(lead.id, d, "vehicle enquiry");
  created(res, { id: lead.id });
}));

publicLeads.post("/test-drive", wrap(async (req, res) => {
  const d = parse(testDriveSchema, req.body);
  if (d.preferredDate.getTime() < Date.now() - 864e5) throw (await import("../utils/http.js")).badRequest("Preferred date must be in the future");
  const v = await vehicleOr404(d.vehicleId);
  const c = await upsertCustomer(d);
  const lead = await prisma.lead.create({
    data: { type: "TEST_DRIVE", customerId: c.id, vehicleId: v!.id, subject: `Test drive: ${v!.title}`, message: d.message, testDrive: { create: { customerId: c.id, vehicleId: v!.id, preferredDate: d.preferredDate, preferredTime: d.preferredTime } } },
  });
  await afterLead(lead.id, d, "test-drive request");
  created(res, { id: lead.id });
}));

publicLeads.post("/financing", wrap(async (req, res) => {
  const d = parse(financingSchema, req.body);
  const v = await vehicleOr404(d.vehicleId);
  const c = await upsertCustomer(d);
  const lead = await prisma.lead.create({
    data: {
      type: "FINANCING", customerId: c.id, vehicleId: v?.id, subject: v ? `Financing: ${v.title}` : "Financing application", message: d.message,
      financing: { create: { customerId: c.id, vehicleId: v?.id, employmentStatus: d.employmentStatus, employer: d.employer, annualIncome: d.annualIncome, monthlyHousing: d.monthlyHousing, downPayment: d.downPayment, termMonths: d.termMonths, creditRating: d.creditRating } },
    },
  });
  await afterLead(lead.id, d, "financing enquiry");
  created(res, { id: lead.id });
}));

publicLeads.post("/trade-in", wrap(async (req, res) => {
  const d = parse(tradeInSchema, req.body);
  const c = await upsertCustomer(d);
  const lead = await prisma.lead.create({
    data: { type: "TRADE_IN", customerId: c.id, subject: `Trade-in: ${d.year} ${d.make} ${d.model}`, message: d.details, tradeIn: { create: { customerId: c.id, make: d.make, model: d.model, year: d.year, mileage: d.mileage, vin: d.vin, condition: d.condition, details: d.details } } },
  });
  await afterLead(lead.id, d, "trade-in request");
  created(res, { id: lead.id });
}));

// ═════════ ADMIN LEADS ═════════
export const adminLeads = Router();
adminLeads.use(authenticate, requirePermission("leads:read:all", "leads:read:assigned"));

const leadInclude = { customer: true, vehicle: { select: { id: true, title: true, slug: true, stockNumber: true } }, assignee: { select: { id: true, firstName: true, lastName: true } } };

/** Reps without leads:read:all only ever see leads assigned to them — enforced here, not in the UI. */
const scope = (req: import("express").Request): Prisma.LeadWhereInput => (can(req.user, "leads:read:all") ? {} : { assigneeId: req.user!.id });

function leadWhere(req: import("express").Request): Prisma.LeadWhereInput {
  const q = req.query as Record<string, string | undefined>;
  const and: Prisma.LeadWhereInput[] = [scope(req)];
  if (q.status && (LEAD_STATUSES as readonly string[]).includes(q.status)) and.push({ status: q.status as never });
  if (q.type && (LEAD_TYPES as readonly string[]).includes(q.type)) and.push({ type: q.type as never });
  if (q.assigneeId === "unassigned") and.push({ assigneeId: null });
  else if (q.assigneeId) and.push({ assigneeId: q.assigneeId });
  if (q.from) and.push({ createdAt: { gte: new Date(q.from) } });
  if (q.to) and.push({ createdAt: { lte: new Date(q.to) } });
  if (q.q?.trim()) {
    const t = q.q.trim();
    and.push({ OR: [{ subject: { contains: t, mode: "insensitive" } }, { message: { contains: t, mode: "insensitive" } }, { customer: { OR: [{ firstName: { contains: t, mode: "insensitive" } }, { lastName: { contains: t, mode: "insensitive" } }, { email: { contains: t, mode: "insensitive" } }, { phone: { contains: t } }] } }] });
  }
  return { AND: and };
}

adminLeads.get("/", wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 20);
  const where = leadWhere(req);
  const [total, items] = await Promise.all([prisma.lead.count({ where }), prisma.lead.findMany({ where, include: leadInclude, orderBy: { createdAt: "desc" }, skip, take })]);
  ok(res, items, pageMeta(total, page, limit));
}));

adminLeads.get("/export", requirePermission("leads:export"), wrap(async (req, res) => {
  const items = await prisma.lead.findMany({ where: leadWhere(req), include: leadInclude, orderBy: { createdAt: "desc" }, take: 10000 });
  // prefix formula-triggering chars to prevent CSV/Excel injection
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [["Created", "Type", "Status", "First name", "Last name", "Email", "Phone", "Vehicle", "Assigned to", "Subject", "Message"].map(cell).join(",")];
  for (const l of items) rows.push([l.createdAt.toISOString(), l.type, l.status, l.customer.firstName, l.customer.lastName, l.customer.email, l.customer.phone, l.vehicle?.title, l.assignee ? `${l.assignee.firstName} ${l.assignee.lastName}` : "", l.subject, l.message].map(cell).join(","));
  await audit(req, "export", "Lead", null, { count: items.length });
  res.setHeader("Content-Type", "text/csv; charset=utf-8").setHeader("Content-Disposition", 'attachment; filename="leads.csv"').send(rows.join("\r\n"));
}));

adminLeads.get("/:id", wrap(async (req, res) => {
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id: req.params.id }, scope(req)] },
    include: { ...leadInclude, notes: { include: { author: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } }, followUps: { orderBy: { dueAt: "asc" } }, testDrive: true, financing: true, tradeIn: true },
  });
  if (!lead) throw notFound();
  const history = await prisma.lead.findMany({ where: { customerId: lead.customerId, id: { not: lead.id } }, select: { id: true, type: true, status: true, subject: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 });
  ok(res, { ...lead, financing: lead.financing && { ...lead.financing, annualIncome: lead.financing.annualIncome && Number(lead.financing.annualIncome), monthlyHousing: lead.financing.monthlyHousing && Number(lead.financing.monthlyHousing), downPayment: lead.financing.downPayment && Number(lead.financing.downPayment) }, history });
}));

const patchSchema = z.object({ status: z.enum(LEAD_STATUSES).optional(), assigneeId: z.string().nullable().optional() });
adminLeads.patch("/:id", requirePermission("leads:write"), wrap(async (req, res) => {
  const d = parse(patchSchema, req.body);
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id: req.params.id }, scope(req)] } });
  if (!lead) throw notFound();
  if (d.assigneeId !== undefined) {
    if (!can(req.user, "leads:assign")) throw forbidden("You cannot assign leads");
    if (d.assigneeId && !(await prisma.user.findFirst({ where: { id: d.assigneeId, isActive: true } }))) throw notFound("Assignee not found");
  }
  const updated = await prisma.lead.update({ where: { id: lead.id }, data: d, include: leadInclude });
  if (d.assigneeId && d.assigneeId !== req.user!.id && d.assigneeId !== lead.assigneeId) await prisma.notification.create({ data: { userId: d.assigneeId, title: "Lead assigned to you", body: `${updated.customer.firstName} ${updated.customer.lastName}`, link: `/admin/leads/${lead.id}` } });
  await audit(req, "update", "Lead", lead.id, d);
  ok(res, updated);
}));

adminLeads.post("/:id/notes", requirePermission("leads:write"), wrap(async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id: req.params.id }, scope(req)] } });
  if (!lead) throw notFound();
  const note = await prisma.leadNote.create({ data: { leadId: lead.id, authorId: req.user!.id, body }, include: { author: { select: { firstName: true, lastName: true } } } });
  created(res, note);
}));

adminLeads.post("/:id/follow-ups", requirePermission("leads:write"), wrap(async (req, res) => {
  const d = parse(z.object({ dueAt: z.coerce.date(), note: z.string().trim().max(1000).optional() }), req.body);
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id: req.params.id }, scope(req)] } });
  if (!lead) throw notFound();
  const fu = await prisma.leadFollowUp.create({ data: { leadId: lead.id, userId: req.user!.id, ...d } });
  if (lead.status === "NEW" || lead.status === "CONTACTED") await prisma.lead.update({ where: { id: lead.id }, data: { status: "FOLLOW_UP" } });
  created(res, fu);
}));

adminLeads.patch("/:id/follow-ups/:fid", requirePermission("leads:write"), wrap(async (req, res) => {
  const lead = await prisma.lead.findFirst({ where: { AND: [{ id: req.params.id }, scope(req)] } });
  if (!lead) throw notFound();
  const fu = await prisma.leadFollowUp.update({ where: { id: req.params.fid }, data: { completedAt: new Date() } });
  ok(res, fu);
}));

// ═════════ CUSTOMERS ═════════
export const adminCustomers = Router();
adminCustomers.use(authenticate, requirePermission("customers:read"));

adminCustomers.get("/", wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 20);
  const t = String(req.query.q ?? "").trim();
  const where: Prisma.CustomerWhereInput = t ? { OR: [{ firstName: { contains: t, mode: "insensitive" } }, { lastName: { contains: t, mode: "insensitive" } }, { email: { contains: t, mode: "insensitive" } }, { phone: { contains: t } }] } : {};
  const [total, items] = await Promise.all([prisma.customer.count({ where }), prisma.customer.findMany({ where, include: { _count: { select: { leads: true } } }, orderBy: { createdAt: "desc" }, skip, take })]);
  ok(res, items, pageMeta(total, page, limit));
}));

adminCustomers.get("/:id", wrap(async (req, res) => {
  const c = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { leads: { include: { vehicle: { select: { id: true, title: true, slug: true } }, notes: { include: { author: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!c) throw notFound();
  ok(res, c);
}));

adminCustomers.patch("/:id", requirePermission("customers:write"), wrap(async (req, res) => {
  const d = parse(z.object({ firstName: z.string().trim().min(1).max(80).optional(), lastName: z.string().trim().min(1).max(80).optional(), phone: z.string().trim().max(30).nullable().optional(), city: z.string().trim().max(80).nullable().optional(), province: z.string().trim().max(40).nullable().optional(), notes: z.string().max(5000).nullable().optional() }), req.body);
  const c = await prisma.customer.update({ where: { id: req.params.id }, data: d });
  await audit(req, "update", "Customer", c.id);
  ok(res, c);
}));
