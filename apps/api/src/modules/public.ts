import { Router } from "express";
import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { notFound, ok, pageMeta, pageParams, wrap } from "../utils/http.js";

export const publicRouter = Router();

/** Everything the site shell needs in one request: theme, settings, navigation, banners. */
publicRouter.get("/site", wrap(async (_req, res) => {
  const [theme, settingRows, menus, banners, categories] = await Promise.all([
    prisma.themeSetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    prisma.websiteSetting.findMany(),
    prisma.navigationMenu.findMany({ include: { items: { where: { isVisible: true }, orderBy: { position: "asc" } } } }),
    prisma.banner.findMany({ where: { status: "PUBLISHED" }, orderBy: { position: "asc" } }),
    prisma.vehicleCategory.findMany({ where: { isActive: true }, orderBy: { position: "asc" } }),
  ]);
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  // never leak email/SMTP config to the public
  delete (settings as Record<string, unknown>).email;
  delete (settings as Record<string, unknown>).notifications;
  const menu = (key: string) => {
    const items = menus.find((m) => m.key === key)?.items ?? [];
    return items.filter((i) => !i.parentId).map((i) => ({ ...i, children: items.filter((c) => c.parentId === i.id) }));
  };
  ok(res, { theme, settings, navigation: { header: menu("header"), footer: menu("footer") }, banners, categories, mapsKey: process.env.VITE_GOOGLE_MAPS_API_KEY || null });
}));

/** Published page (incl. home) with its visible sections and any data those sections need. */
publicRouter.get("/pages/:slug", wrap(async (req, res) => {
  const page = await prisma.websitePage.findFirst({ where: { slug: req.params.slug, status: "PUBLISHED" }, include: { sections: { where: { isVisible: true }, orderBy: { position: "asc" } } } });
  if (!page) throw notFound("Page not found");
  ok(res, page);
}));

/** Draft preview for authenticated CMS users (token verified by the admin API via ?preview). */
publicRouter.get("/content/:kind", wrap(async (req, res) => {
  const k = req.params.kind;
  if (k === "testimonials") return ok(res, await prisma.testimonial.findMany({ where: { status: "PUBLISHED" }, orderBy: { position: "asc" } }));
  if (k === "faqs") return ok(res, await prisma.fAQ.findMany({ where: { status: "PUBLISHED" }, orderBy: { position: "asc" } }));
  if (k === "services") return ok(res, await prisma.service.findMany({ where: { status: "PUBLISHED" }, orderBy: { position: "asc" } }));
  throw notFound();
}));

publicRouter.get("/blog", wrap(async (req, res) => {
  const { page, limit, skip, take } = pageParams(req.query, 9, 30);
  const where = { status: "PUBLISHED" as const };
  const [total, items] = await Promise.all([prisma.blogPost.count({ where }), prisma.blogPost.findMany({ where, orderBy: { publishedAt: "desc" }, skip, take, select: { id: true, slug: true, title: true, excerpt: true, coverUrl: true, publishedAt: true } })]);
  ok(res, items, pageMeta(total, page, limit));
}));
publicRouter.get("/blog/:slug", wrap(async (req, res) => {
  const p = await prisma.blogPost.findFirst({ where: { slug: req.params.slug, status: "PUBLISHED" }, include: { author: { select: { firstName: true, lastName: true } } } });
  if (!p) throw notFound();
  ok(res, p);
}));

// ───── SEO files ─────
export const seoRouter = Router();
seoRouter.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${env.CLIENT_URL}/sitemap.xml\n`);
});
seoRouter.get("/sitemap.xml", wrap(async (_req, res) => {
  const [vehicles, pages, posts] = await Promise.all([
    prisma.vehicle.findMany({ where: { publishStatus: "PUBLISHED", status: { not: "ARCHIVED" } }, select: { slug: true, updatedAt: true } }),
    prisma.websitePage.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
  ]);
  const u = (loc: string, d?: Date) => `<url><loc>${env.CLIENT_URL}${loc}</loc>${d ? `<lastmod>${d.toISOString()}</lastmod>` : ""}</url>`;
  const xml = [u("/"), u("/inventory"), u("/blog"), ...pages.filter((p) => p.slug !== "home").map((p) => u(`/${p.slug}`, p.updatedAt)), ...vehicles.map((v) => u(`/inventory/${v.slug}`, v.updatedAt)), ...posts.map((p) => u(`/blog/${p.slug}`, p.updatedAt))].join("");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${xml}</urlset>`);
}));
