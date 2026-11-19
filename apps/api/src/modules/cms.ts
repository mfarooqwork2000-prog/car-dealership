import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { PUBLISH_STATUSES, SECTION_SCHEMAS, SECTION_TYPES, slugify, type SectionType } from "@cd/shared";
import { prisma } from "../db.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { audit, deleteImage, MAX_IMAGE_BYTES, storeImage } from "../services/core.js";
import { badRequest, conflict, created, forbidden, notFound, ok, pageMeta, pageParams, parse, wrap } from "../utils/http.js";

export const cmsRouter = Router();
cmsRouter.use(authenticate);

// ═════════ Generic reorderable CRUD for simple content entities ═════════
type Delegate = {
  findMany: (a?: object) => Promise<unknown[]>; findUnique: (a: object) => Promise<unknown>; create: (a: object) => Promise<{ id: string }>;
  update: (a: object) => Promise<unknown>; delete: (a: object) => Promise<unknown>;
};
function crud(path: string, delegate: () => Delegate, entity: string, schema: z.ZodObject<z.ZodRawShape>, opts: { orderBy?: object; prep?: (d: Record<string, unknown>) => Record<string, unknown> } = {}) {
  const r = Router();
  r.get("/", requirePermission("cms:read"), wrap(async (_req, res) => ok(res, await delegate().findMany({ orderBy: opts.orderBy ?? [{ position: "asc" }, { createdAt: "asc" }] }))));
  r.get("/:id", requirePermission("cms:read"), wrap(async (req, res) => {
    const x = await delegate().findUnique({ where: { id: req.params.id } });
    if (!x) throw notFound();
    ok(res, x);
  }));
  r.post("/", requirePermission("cms:write"), wrap(async (req, res) => {
    const parsed = parse(schema, req.body);
    const x = await delegate().create({ data: opts.prep ? opts.prep(parsed) : parsed });
    await audit(req, "create", entity, x.id);
    created(res, x);
  }));
  r.put("/reorder", requirePermission("cms:write"), wrap(async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(z.string()).min(1) }), req.body);
    await prisma.$transaction(ids.map((id, position) => (delegate() as never as { update: (a: object) => never }).update({ where: { id }, data: { position } })));
    ok(res, { ordered: true });
  }));
  r.put("/:id", requirePermission("cms:write"), wrap(async (req, res) => {
    const data = parse(schema.partial(), req.body);
    const x = await delegate().update({ where: { id: req.params.id }, data });
    await audit(req, "update", entity, req.params.id);
    ok(res, x);
  }));
  r.delete("/:id", requirePermission("cms:write"), wrap(async (req, res) => {
    await delegate().delete({ where: { id: req.params.id } });
    await audit(req, "delete", entity, req.params.id);
    ok(res, { deleted: true });
  }));
  cmsRouter.use(`/${path}`, r);
}
const status = z.enum(PUBLISH_STATUSES);
const opt = (n: number) => z.string().trim().max(n).optional().nullable();
crud("testimonials", () => prisma.testimonial as never, "Testimonial", z.object({ author: z.string().trim().min(1).max(100), role: opt(100), body: z.string().trim().min(1).max(2000), rating: z.coerce.number().int().min(1).max(5).default(5), position: z.coerce.number().int().default(0), status: status.default("PUBLISHED") }));
crud("faqs", () => prisma.fAQ as never, "FAQ", z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(4000), category: opt(60), position: z.coerce.number().int().default(0), status: status.default("PUBLISHED") }));
crud("services", () => prisma.service as never, "Service", z.object({ title: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(2000), icon: opt(40), imageUrl: opt(500), position: z.coerce.number().int().default(0), status: status.default("PUBLISHED") }));
crud("banners", () => prisma.banner as never, "Banner", z.object({ title: z.string().trim().min(1).max(200), body: opt(1000), imageUrl: opt(500), ctaLabel: opt(60), ctaUrl: opt(300), placement: z.string().max(40).default("top"), position: z.coerce.number().int().default(0), status: status.default("DRAFT") }));
crud("categories", () => prisma.vehicleCategory as never, "VehicleCategory", z.object({ name: z.string().trim().min(1).max(80), slug: z.string().trim().max(80).regex(/^[a-z0-9-]+$/).optional(), description: opt(500), imageUrl: opt(500), position: z.coerce.number().int().default(0), isActive: z.boolean().default(true) }), { prep: (d) => ({ ...d, slug: d.slug || slugify(String(d.name)) }) });

// ═════════ Pages & sections ═════════
const pageSchema = z.object({ slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"), title: z.string().trim().min(1).max(200), metaTitle: opt(200), metaDescription: opt(300), ogImageUrl: opt(500), status: status.default("DRAFT") });
const pages = Router();
pages.get("/", requirePermission("cms:read"), wrap(async (_req, res) => ok(res, await prisma.websitePage.findMany({ include: { _count: { select: { sections: true } } }, orderBy: { createdAt: "asc" } }))));
pages.get("/:id", requirePermission("cms:read"), wrap(async (req, res) => {
  const p = await prisma.websitePage.findUnique({ where: { id: req.params.id }, include: { sections: { orderBy: { position: "asc" } } } });
  if (!p) throw notFound();
  ok(res, p);
}));
pages.post("/", requirePermission("cms:write"), wrap(async (req, res) => {
  const d = parse(pageSchema, req.body);
  if (await prisma.websitePage.findUnique({ where: { slug: d.slug } })) throw conflict("A page with this slug already exists");
  const p = await prisma.websitePage.create({ data: { ...d, publishedAt: d.status === "PUBLISHED" ? new Date() : null } });
  await audit(req, "create", "WebsitePage", p.id);
  created(res, p);
}));
pages.put("/:id", requirePermission("cms:write"), wrap(async (req, res) => {
  const existing = await prisma.websitePage.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound();
  const d = parse(pageSchema.partial(), req.body);
  if (existing.isSystem && d.slug && d.slug !== existing.slug) throw badRequest("System page slugs cannot be changed");
  const p = await prisma.websitePage.update({ where: { id: existing.id }, data: { ...d, ...(d.status === "PUBLISHED" && !existing.publishedAt ? { publishedAt: new Date() } : {}) } });
  await audit(req, "update", "WebsitePage", p.id, { status: d.status });
  ok(res, p);
}));
pages.delete("/:id", requirePermission("cms:write"), wrap(async (req, res) => {
  const p = await prisma.websitePage.findUnique({ where: { id: req.params.id } });
  if (!p) throw notFound();
  if (p.isSystem) throw forbidden("System pages cannot be deleted (you can unpublish them instead)");
  await prisma.websitePage.delete({ where: { id: p.id } });
  await audit(req, "delete", "WebsitePage", p.id);
  ok(res, { deleted: true });
}));

/** Validate section content against the registry schema for its type. */
function validateSection(type: string, content: unknown) {
  if (!SECTION_TYPES.includes(type as SectionType)) throw badRequest(`Unknown section type "${type}"`);
  return parse(SECTION_SCHEMAS[type as SectionType], content);
}
pages.post("/:id/sections", requirePermission("cms:write"), wrap(async (req, res) => {
  const { type, content, isVisible } = parse(z.object({ type: z.string(), content: z.unknown().default({}), isVisible: z.boolean().default(true) }), req.body);
  const page = await prisma.websitePage.findUnique({ where: { id: req.params.id }, include: { sections: true } });
  if (!page) throw notFound();
  const s = await prisma.pageSection.create({ data: { pageId: page.id, type, content: validateSection(type, content) as object, isVisible, position: page.sections.length ? Math.max(...page.sections.map((x) => x.position)) + 1 : 0 } });
  await audit(req, "create", "PageSection", s.id);
  created(res, s);
}));
pages.put("/:id/sections/reorder", requirePermission("cms:write"), wrap(async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).min(1) }), req.body);
  await prisma.$transaction(ids.map((id, position) => prisma.pageSection.updateMany({ where: { id, pageId: req.params.id }, data: { position } })));
  ok(res, { ordered: true });
}));
pages.put("/:id/sections/:sid", requirePermission("cms:write"), wrap(async (req, res) => {
  const s = await prisma.pageSection.findFirst({ where: { id: req.params.sid, pageId: req.params.id } });
  if (!s) throw notFound();
  const d = parse(z.object({ content: z.unknown().optional(), isVisible: z.boolean().optional() }), req.body);
  const updated = await prisma.pageSection.update({ where: { id: s.id }, data: { ...(d.content !== undefined ? { content: validateSection(s.type, d.content) as object } : {}), ...(d.isVisible !== undefined ? { isVisible: d.isVisible } : {}) } });
  await audit(req, "update", "PageSection", s.id);
  ok(res, updated);
}));
pages.delete("/:id/sections/:sid", requirePermission("cms:write"), wrap(async (req, res) => {
  const r = await prisma.pageSection.deleteMany({ where: { id: req.params.sid, pageId: req.params.id } });
  if (!r.count) throw notFound();
  ok(res, { deleted: true });
}));
cmsRouter.use("/pages", pages);

cmsRouter.get("/section-types", requirePermission("cms:read"), (_req, res) => ok(res, SECTION_TYPES));

// ═════════ Navigation ═════════
const nav = Router();
nav.get("/", requirePermission("cms:read"), wrap(async (_req, res) => ok(res, await prisma.navigationMenu.findMany({ include: { items: { orderBy: { position: "asc" } } } }))));
nav.put("/:key", requirePermission("cms:write"), wrap(async (req, res) => {
  const { items } = parse(z.object({ items: z.array(z.object({ label: z.string().trim().min(1).max(80), url: z.string().trim().min(1).max(300).refine((u) => /^(\/|https?:\/\/|mailto:|tel:)/.test(u), "Invalid URL"), isVisible: z.boolean().default(true), openInNewTab: z.boolean().default(false), children: z.array(z.object({ label: z.string().trim().min(1).max(80), url: z.string().trim().min(1).max(300) })).default([]) })).max(30) }), req.body);
  const menu = await prisma.navigationMenu.findUnique({ where: { key: req.params.key } });
  if (!menu) throw notFound("Menu not found");
  // Replace the whole tree atomically; order = array order
  await prisma.$transaction(async (tx) => {
    await tx.navigationItem.deleteMany({ where: { menuId: menu.id } });
    for (const [i, it] of items.entries()) {
      const parent = await tx.navigationItem.create({ data: { menuId: menu.id, label: it.label, url: it.url, position: i, isVisible: it.isVisible, openInNewTab: it.openInNewTab } });
      for (const [j, c] of it.children.entries()) await tx.navigationItem.create({ data: { menuId: menu.id, parentId: parent.id, label: c.label, url: c.url, position: j } });
    }
  });
  await audit(req, "update", "NavigationMenu", menu.id);
  ok(res, await prisma.navigationMenu.findUnique({ where: { id: menu.id }, include: { items: { orderBy: { position: "asc" } } } }));
}));
cmsRouter.use("/navigation", nav);

// ═════════ Blog ═════════
const blogSchema = z.object({ title: z.string().trim().min(1).max(200), slug: z.string().trim().max(120).regex(/^[a-z0-9-]*$/).optional(), excerpt: opt(500), body: z.string().min(1).max(100000), coverUrl: opt(500), status: status.default("DRAFT") });
const blog = Router();
blog.get("/", requirePermission("cms:read"), wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 20);
  const [total, items] = await Promise.all([prisma.blogPost.count(), prisma.blogPost.findMany({ orderBy: { createdAt: "desc" }, skip, take })]);
  ok(res, items, pageMeta(total, page, limit));
}));
blog.get("/:id", requirePermission("cms:read"), wrap(async (req, res) => ok(res, (await prisma.blogPost.findUnique({ where: { id: req.params.id } })) ?? (() => { throw notFound(); })())));
blog.post("/", requirePermission("cms:write"), wrap(async (req, res) => {
  const d = parse(blogSchema, req.body);
  const slug = d.slug || slugify(d.title);
  if (await prisma.blogPost.findUnique({ where: { slug } })) throw conflict("Slug already in use");
  const p = await prisma.blogPost.create({ data: { ...d, slug, authorId: req.user!.id, publishedAt: d.status === "PUBLISHED" ? new Date() : null } });
  await audit(req, "create", "BlogPost", p.id);
  created(res, p);
}));
blog.put("/:id", requirePermission("cms:write"), wrap(async (req, res) => {
  const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound();
  const d = parse(blogSchema.partial(), req.body);
  const p = await prisma.blogPost.update({ where: { id: existing.id }, data: { ...d, ...(d.status === "PUBLISHED" && !existing.publishedAt ? { publishedAt: new Date() } : {}) } });
  await audit(req, "update", "BlogPost", p.id);
  ok(res, p);
}));
blog.delete("/:id", requirePermission("cms:write"), wrap(async (req, res) => {
  await prisma.blogPost.delete({ where: { id: req.params.id } });
  await audit(req, "delete", "BlogPost", req.params.id);
  ok(res, { deleted: true });
}));
cmsRouter.use("/blog", blog);

// ═════════ Media library ═════════
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 10 } });
const media = Router();
media.get("/", requirePermission("cms:read", "media:write"), wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 30);
  const [total, items] = await Promise.all([prisma.mediaAsset.count(), prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, skip, take })]);
  ok(res, items, pageMeta(total, page, limit));
}));
media.post("/", requirePermission("media:write"), upload.array("files", 10), wrap(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw badRequest("No files uploaded");
  const out = [];
  for (const f of files) {
    let s;
    try {
      s = await storeImage(f.buffer);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    out.push(await prisma.mediaAsset.create({ data: { url: s.url, publicId: s.publicId, filename: f.originalname.slice(0, 200), mimeType: s.mimeType, size: f.size, width: s.width, height: s.height } }));
  }
  await audit(req, "upload", "MediaAsset", null, { count: out.length });
  created(res, out);
}));
media.delete("/:id", requirePermission("media:write"), wrap(async (req, res) => {
  const m = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
  if (!m) throw notFound();
  await prisma.mediaAsset.delete({ where: { id: m.id } });
  await deleteImage(m.publicId);
  ok(res, { deleted: true });
}));
cmsRouter.use("/media", media);
