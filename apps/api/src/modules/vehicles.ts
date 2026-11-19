import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { slugify, vehicleInputSchema, VEHICLE_STATUSES, PUBLISH_STATUSES } from "@cd/shared";
import { prisma } from "../db.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { audit, deleteImage, MAX_IMAGE_BYTES, storeImage } from "../services/core.js";
import { badRequest, conflict, created, notFound, ok, pageMeta, pageParams, parse, wrap } from "../utils/http.js";

const include = { make: true, model: true, category: true, images: { orderBy: [{ isPrimary: "desc" as const }, { position: "asc" as const }] }, features: true };
type V = Prisma.VehicleGetPayload<{ include: typeof include }>;

export const serializeVehicle = (v: V) => ({
  ...v,
  price: Number(v.price),
  salePrice: v.salePrice == null ? null : Number(v.salePrice),
  makeName: v.make.name,
  modelName: v.model.name,
  primaryImage: v.images[0]?.url ?? null,
  isNewArrival: Date.now() - v.arrivedAt.getTime() < 14 * 864e5,
});

async function ensureMakeModel(makeName: string, modelName: string) {
  const make = await prisma.make.upsert({ where: { slug: slugify(makeName) }, update: {}, create: { name: makeName, slug: slugify(makeName) } });
  const model = await prisma.model.upsert({ where: { makeId_slug: { makeId: make.id, slug: slugify(modelName) } }, update: {}, create: { name: modelName, slug: slugify(modelName), makeId: make.id } });
  return { makeId: make.id, modelId: model.id };
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base) || "vehicle";
  for (let i = 2; await prisma.vehicle.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } }); i++) slug = `${slugify(base)}-${i}`;
  return slug;
}

// ───── filter builder shared by public + admin ─────
const csv = (v: unknown) => (typeof v === "string" && v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
const num = (v: unknown) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);

function buildWhere(q: Record<string, unknown>): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = {};
  const and: Prisma.VehicleWhereInput[] = [];
  if (typeof q.make === "string" && q.make) where.make = { slug: q.make };
  if (typeof q.model === "string" && q.model) where.model = { slug: q.model };
  if (typeof q.category === "string" && q.category) where.category = { slug: q.category };
  const yMin = num(q.yearMin), yMax = num(q.yearMax);
  if (yMin !== undefined || yMax !== undefined) where.year = { gte: yMin, lte: yMax };
  const pMin = num(q.priceMin), pMax = num(q.priceMax);
  if (pMin !== undefined || pMax !== undefined) where.price = { gte: pMin, lte: pMax };
  const mMin = num(q.mileageMin), mMax = num(q.mileageMax);
  if (mMin !== undefined || mMax !== undefined) where.mileage = { gte: mMin, lte: mMax };
  for (const f of ["bodyType", "fuelType", "transmission", "drivetrain", "exteriorColor"] as const) {
    const vals = csv(q[f]);
    if (vals) and.push({ [f]: { in: vals, mode: "insensitive" } });
  }
  const cond = csv(q.condition);
  if (cond) where.condition = { in: cond as never };
  const status = csv(q.status);
  if (status) where.status = { in: status as never };
  if (q.featured === "true") where.isFeatured = true;
  if (typeof q.q === "string" && q.q.trim()) {
    const term = q.q.trim();
    and.push({ OR: [{ title: { contains: term, mode: "insensitive" } }, { make: { name: { contains: term, mode: "insensitive" } } }, { model: { name: { contains: term, mode: "insensitive" } } }, { stockNumber: { contains: term, mode: "insensitive" } }, { vin: { contains: term, mode: "insensitive" } }, { trim: { contains: term, mode: "insensitive" } }] });
  }
  if (and.length) where.AND = and;
  return where;
}

const sorts: Record<string, Prisma.VehicleOrderByWithRelationInput[]> = {
  newest: [{ arrivedAt: "desc" }],
  "price-asc": [{ price: "asc" }],
  "price-desc": [{ price: "desc" }],
  "mileage-asc": [{ mileage: "asc" }],
  "year-desc": [{ year: "desc" }, { price: "desc" }],
  "year-asc": [{ year: "asc" }],
};

// ═════════ PUBLIC ═════════
export const publicVehicles = Router();

const publicBase: Prisma.VehicleWhereInput = { publishStatus: "PUBLISHED", status: { not: "ARCHIVED" } };

publicVehicles.get("/", wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 12, 48);
  const where: Prisma.VehicleWhereInput = { AND: [publicBase, buildWhere(req.query)] };
  // status default: Available + Pending + Sold shown; "availableOnly" hides sold
  if (req.query.availableOnly === "true") (where.AND as Prisma.VehicleWhereInput[]).push({ status: "AVAILABLE" });
  const orderBy = [{ status: "asc" as const }, ...(sorts[String(req.query.sort)] ?? sorts.newest)];
  // AVAILABLE < PENDING < SOLD in enum order, so sold vehicles sink to the bottom
  const [total, items] = await Promise.all([prisma.vehicle.count({ where }), prisma.vehicle.findMany({ where, include, orderBy, skip, take })]);
  ok(res, items.map(serializeVehicle), pageMeta(total, page, limit));
}));

publicVehicles.get("/facets", wrap(async (_req, res) => {
  const where = publicBase;
  const [makes, models, categories, agg, distinct] = await Promise.all([
    prisma.make.findMany({ where: { vehicles: { some: where } }, orderBy: { name: "asc" }, select: { name: true, slug: true } }),
    prisma.model.findMany({ where: { vehicles: { some: where } }, orderBy: { name: "asc" }, select: { name: true, slug: true, make: { select: { slug: true } } } }),
    prisma.vehicleCategory.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: { name: true, slug: true, imageUrl: true, description: true } }),
    prisma.vehicle.aggregate({ where, _min: { price: true, year: true, mileage: true }, _max: { price: true, year: true, mileage: true } }),
    prisma.vehicle.findMany({ where, select: { bodyType: true, fuelType: true, transmission: true, drivetrain: true, exteriorColor: true } }),
  ]);
  const uniq = (k: "bodyType" | "fuelType" | "transmission" | "drivetrain" | "exteriorColor") => [...new Set(distinct.map((d) => d[k]).filter(Boolean) as string[])].sort();
  ok(res, {
    makes, models: models.map((m) => ({ name: m.name, slug: m.slug, makeSlug: m.make.slug })), categories,
    bodyTypes: uniq("bodyType"), fuelTypes: uniq("fuelType"), transmissions: uniq("transmission"), drivetrains: uniq("drivetrain"), colors: uniq("exteriorColor"),
    range: { priceMin: Number(agg._min.price ?? 0), priceMax: Number(agg._max.price ?? 0), yearMin: agg._min.year, yearMax: agg._max.year, mileageMax: agg._max.mileage },
  });
}));

publicVehicles.get("/:slug", wrap(async (req, res) => {
  const v = await prisma.vehicle.findFirst({ where: { slug: req.params.slug, ...publicBase }, include });
  if (!v) throw notFound("Vehicle not found");
  const similar = await prisma.vehicle.findMany({ where: { ...publicBase, status: "AVAILABLE", id: { not: v.id }, OR: [{ makeId: v.makeId }, { bodyType: v.bodyType ?? undefined }] }, include, take: 4, orderBy: { arrivedAt: "desc" } });
  ok(res, { ...serializeVehicle(v), similar: similar.map(serializeVehicle) });
}));

// ═════════ ADMIN ═════════
export const adminVehicles = Router();
adminVehicles.use(authenticate);

adminVehicles.get("/", requirePermission("vehicles:read"), wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 20);
  const where: Prisma.VehicleWhereInput = { AND: [buildWhere(req.query), req.query.publishStatus ? { publishStatus: req.query.publishStatus as never } : {}] };
  const orderBy = sorts[String(req.query.sort)] ?? [{ updatedAt: "desc" as const }];
  const [total, items] = await Promise.all([prisma.vehicle.count({ where }), prisma.vehicle.findMany({ where, include, orderBy, skip, take })]);
  ok(res, items.map(serializeVehicle), pageMeta(total, page, limit));
}));

adminVehicles.get("/:id", requirePermission("vehicles:read"), wrap(async (req, res) => {
  const v = await prisma.vehicle.findUnique({ where: { id: req.params.id }, include });
  if (!v) throw notFound();
  ok(res, serializeVehicle(v));
}));

adminVehicles.post("/", requirePermission("vehicles:write"), wrap(async (req, res) => {
  const { makeName, modelName, features, ...data } = parse(vehicleInputSchema, req.body);
  if (await prisma.vehicle.findUnique({ where: { stockNumber: data.stockNumber } })) throw conflict("Stock number already exists");
  if (data.vin && (await prisma.vehicle.findUnique({ where: { vin: data.vin } }))) throw conflict("VIN already exists");
  const ids = await ensureMakeModel(makeName, modelName);
  const v = await prisma.vehicle.create({
    data: { ...data, ...ids, categoryId: data.categoryId || null, slug: await uniqueSlug(`${data.year}-${makeName}-${modelName}-${data.stockNumber}`), soldAt: data.status === "SOLD" ? new Date() : null, features: { create: dedupe(features) } },
    include,
  });
  await audit(req, "create", "Vehicle", v.id, { stockNumber: v.stockNumber });
  created(res, serializeVehicle(v));
}));

const dedupe = (f: { name: string; category?: string | null }[]) => [...new Map(f.map((x) => [x.name.toLowerCase(), x])).values()];

adminVehicles.put("/:id", requirePermission("vehicles:write"), wrap(async (req, res) => {
  const { makeName, modelName, features, ...data } = parse(vehicleInputSchema, req.body);
  const existing = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound();
  const dupe = await prisma.vehicle.findFirst({ where: { id: { not: existing.id }, OR: [{ stockNumber: data.stockNumber }, ...(data.vin ? [{ vin: data.vin }] : [])] } });
  if (dupe) throw conflict("Stock number or VIN already used by another vehicle");
  const ids = await ensureMakeModel(makeName, modelName);
  const v = await prisma.$transaction(async (tx) => {
    await tx.vehicleFeature.deleteMany({ where: { vehicleId: existing.id } });
    return tx.vehicle.update({
      where: { id: existing.id },
      data: { ...data, ...ids, categoryId: data.categoryId || null, soldAt: data.status === "SOLD" ? existing.soldAt ?? new Date() : null, features: { create: dedupe(features) } },
      include,
    });
  });
  await audit(req, "update", "Vehicle", v.id);
  ok(res, serializeVehicle(v));
}));

adminVehicles.delete("/:id", requirePermission("vehicles:delete"), wrap(async (req, res) => {
  const v = await prisma.vehicle.findUnique({ where: { id: req.params.id }, include: { images: true } });
  if (!v) throw notFound();
  await prisma.vehicle.delete({ where: { id: v.id } });
  await Promise.all(v.images.map((i) => deleteImage(i.publicId)));
  await audit(req, "delete", "Vehicle", v.id, { stockNumber: v.stockNumber });
  ok(res, { deleted: true });
}));

adminVehicles.post("/:id/duplicate", requirePermission("vehicles:write"), wrap(async (req, res) => {
  const v = await prisma.vehicle.findUnique({ where: { id: req.params.id }, include: { features: true } });
  if (!v) throw notFound();
  const { id: _i, createdAt: _c, updatedAt: _u, slug: _s, stockNumber, vin: _v, features, ...rest } = v;
  let stock = `${stockNumber}-COPY`;
  for (let i = 2; await prisma.vehicle.findUnique({ where: { stockNumber: stock } }); i++) stock = `${stockNumber}-COPY${i}`;
  const copy = await prisma.vehicle.create({
    data: { ...rest, title: `${rest.title} (Copy)`, stockNumber: stock, vin: null, slug: await uniqueSlug(`${rest.title}-${stock}`), publishStatus: "DRAFT", status: "AVAILABLE", soldAt: null, isFeatured: false, arrivedAt: new Date(), features: { create: features.map((f) => ({ name: f.name, category: f.category })) } },
    include,
  });
  await audit(req, "duplicate", "Vehicle", copy.id, { from: v.id });
  created(res, serializeVehicle(copy));
}));

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["publish", "unpublish", "archive", "feature", "unfeature", "status", "delete"]),
  status: z.enum(VEHICLE_STATUSES).optional(),
});
adminVehicles.post("/bulk", wrap(async (req, res) => {
  const { ids, action, status } = parse(bulkSchema, req.body);
  // permission depends on action
  const need = action === "delete" ? "vehicles:delete" : "vehicles:write";
  if (!req.user!.permissions.includes(need)) throw (await import("../utils/http.js")).forbidden();
  const where = { id: { in: ids } };
  let count = 0;
  if (action === "publish") count = (await prisma.vehicle.updateMany({ where, data: { publishStatus: "PUBLISHED" } })).count;
  else if (action === "unpublish") count = (await prisma.vehicle.updateMany({ where, data: { publishStatus: "DRAFT" } })).count;
  else if (action === "archive") count = (await prisma.vehicle.updateMany({ where, data: { status: "ARCHIVED", publishStatus: "ARCHIVED" } })).count;
  else if (action === "feature") count = (await prisma.vehicle.updateMany({ where, data: { isFeatured: true } })).count;
  else if (action === "unfeature") count = (await prisma.vehicle.updateMany({ where, data: { isFeatured: false } })).count;
  else if (action === "status") {
    if (!status) throw badRequest("status is required");
    count = (await prisma.vehicle.updateMany({ where, data: { status, soldAt: status === "SOLD" ? new Date() : null } })).count;
  } else {
    const imgs = await prisma.vehicleImage.findMany({ where: { vehicleId: { in: ids } } });
    count = (await prisma.vehicle.deleteMany({ where })).count;
    await Promise.all(imgs.map((i) => deleteImage(i.publicId)));
  }
  await audit(req, `bulk-${action}`, "Vehicle", null, { ids, count });
  ok(res, { affected: count });
}));

// ───── images ─────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 20 } });

adminVehicles.post("/:id/images", requirePermission("vehicles:write"), upload.array("images", 20), wrap(async (req, res) => {
  const v = await prisma.vehicle.findUnique({ where: { id: req.params.id }, include: { images: true } });
  if (!v) throw notFound();
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw badRequest("No images uploaded");
  let pos = v.images.length ? Math.max(...v.images.map((i) => i.position)) + 1 : 0;
  const out = [];
  for (const f of files) {
    let stored;
    try {
      stored = await storeImage(f.buffer, "vehicles");
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    out.push(await prisma.vehicleImage.create({ data: { vehicleId: v.id, url: stored.url, publicId: stored.publicId, alt: v.title, position: pos++, isPrimary: !v.images.length && out.length === 0 } }));
  }
  await audit(req, "upload-images", "Vehicle", v.id, { count: out.length });
  created(res, out);
}));

adminVehicles.put("/:id/images/order", requirePermission("vehicles:write"), wrap(async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).min(1) }), req.body);
  await prisma.$transaction(ids.map((id, position) => prisma.vehicleImage.updateMany({ where: { id, vehicleId: req.params.id }, data: { position } })));
  ok(res, { ordered: true });
}));

adminVehicles.put("/:id/images/:imageId/primary", requirePermission("vehicles:write"), wrap(async (req, res) => {
  const img = await prisma.vehicleImage.findFirst({ where: { id: req.params.imageId, vehicleId: req.params.id } });
  if (!img) throw notFound();
  await prisma.$transaction([prisma.vehicleImage.updateMany({ where: { vehicleId: img.vehicleId }, data: { isPrimary: false } }), prisma.vehicleImage.update({ where: { id: img.id }, data: { isPrimary: true } })]);
  ok(res, { primary: img.id });
}));

adminVehicles.delete("/:id/images/:imageId", requirePermission("vehicles:write"), wrap(async (req, res) => {
  const img = await prisma.vehicleImage.findFirst({ where: { id: req.params.imageId, vehicleId: req.params.id } });
  if (!img) throw notFound();
  await prisma.vehicleImage.delete({ where: { id: img.id } });
  await deleteImage(img.publicId);
  if (img.isPrimary) {
    const next = await prisma.vehicleImage.findFirst({ where: { vehicleId: img.vehicleId }, orderBy: { position: "asc" } });
    if (next) await prisma.vehicleImage.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  ok(res, { deleted: true });
}));

export { PUBLISH_STATUSES };
