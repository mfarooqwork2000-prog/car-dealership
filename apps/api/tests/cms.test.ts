import { beforeAll, describe, expect, it } from "vitest";
import { PNG, app, loginAs, prisma, request, resetDb } from "./helpers.js";

let cm: Awaited<ReturnType<typeof loginAs>>;
beforeAll(async () => {
  await resetDb();
  cm = await loginAs("CONTENT_MANAGER");
  await prisma.navigationMenu.create({ data: { key: "header", name: "Header" } });
  await prisma.websitePage.create({ data: { slug: "home", title: "Home", isSystem: true, status: "PUBLISHED" } });
});

describe("pages and homepage sections", () => {
  let pageId = "";
  it("creates a draft page that is NOT visible publicly until published", async () => {
    const r = await cm.post("/api/admin/cms/pages").send({ slug: "summer-sale", title: "Summer Sale" });
    expect(r.status).toBe(201);
    pageId = r.body.data.id;
    expect(r.body.data.status).toBe("DRAFT");
    expect((await request(app).get("/api/public/pages/summer-sale")).status).toBe(404);
  });

  it("enforces unique, well-formed slugs", async () => {
    expect((await cm.post("/api/admin/cms/pages").send({ slug: "summer-sale", title: "Dup" })).status).toBe(409);
    expect((await cm.post("/api/admin/cms/pages").send({ slug: "Bad Slug!", title: "Bad" })).status).toBe(422);
  });

  it("adds sections validated against their type schema", async () => {
    const ok = await cm.post(`/api/admin/cms/pages/${pageId}/sections`).send({ type: "rich-text", content: { heading: "Hi", html: "<p>Sale</p>" } });
    expect(ok.status).toBe(201);
    expect((await cm.post(`/api/admin/cms/pages/${pageId}/sections`).send({ type: "hero", content: { subheading: "no heading" } })).status).toBe(422);
    expect((await cm.post(`/api/admin/cms/pages/${pageId}/sections`).send({ type: "does-not-exist", content: {} })).status).toBe(400);
    expect((await cm.post(`/api/admin/cms/pages/${pageId}/sections`).send({ type: "featured-vehicles", content: { heading: "Top", limit: 99 } })).status).toBe(422);
  });

  it("reorders, hides and edits sections; publishing exposes only visible ones in order", async () => {
    const mk = async (heading: string) => (await cm.post(`/api/admin/cms/pages/${pageId}/sections`).send({ type: "rich-text", content: { heading, html: "<p>x</p>" } })).body.data.id as string;
    const b = await mk("B"), c = await mk("C");
    const all = (await cm.get(`/api/admin/cms/pages/${pageId}`)).body.data.sections as { id: string }[];
    const a = all[0].id;
    expect((await cm.put(`/api/admin/cms/pages/${pageId}/sections/reorder`).send({ ids: [c, b, a] })).status).toBe(200);
    expect((await cm.put(`/api/admin/cms/pages/${pageId}/sections/${b}`).send({ isVisible: false })).status).toBe(200);
    expect((await cm.put(`/api/admin/cms/pages/${pageId}/sections/${c}`).send({ content: { heading: "C edited", html: "<p>y</p>" } })).status).toBe(200);
    expect((await cm.put(`/api/admin/cms/pages/${pageId}/sections/${c}`).send({ content: { heading: 5 } })).status).toBe(422);
    expect((await cm.put(`/api/admin/cms/pages/${pageId}`).send({ status: "PUBLISHED" })).status).toBe(200);
    const pub = (await request(app).get("/api/public/pages/summer-sale")).body.data;
    expect(pub.sections.map((s: { content: { heading: string } }) => s.content.heading)).toEqual(["C edited", "Summer Sale".length ? "Hi" : ""]);
    expect(pub.sections.find((s: { id: string }) => s.id === b)).toBeUndefined();
    expect((await cm.put(`/api/admin/cms/pages/${pageId}`).send({ status: "DRAFT" })).status).toBe(200);
    expect((await request(app).get("/api/public/pages/summer-sale")).status).toBe(404); // unpublish works
  });

  it("deletes sections and pages, but protects system pages", async () => {
    const sec = (await cm.get(`/api/admin/cms/pages/${pageId}`)).body.data.sections[0].id;
    expect((await cm.del(`/api/admin/cms/pages/${pageId}/sections/${sec}`)).status).toBe(200);
    expect((await cm.del(`/api/admin/cms/pages/${pageId}`)).status).toBe(200);
    expect(await prisma.pageSection.count({ where: { pageId } })).toBe(0);
    const home = await prisma.websitePage.findUniqueOrThrow({ where: { slug: "home" } });
    expect((await cm.del(`/api/admin/cms/pages/${home.id}`)).status).toBe(403);
    expect((await cm.put(`/api/admin/cms/pages/${home.id}`).send({ slug: "renamed" })).status).toBe(400);
  });
});

describe("navigation, content collections and blog", () => {
  it("replaces the header menu with nested items and exposes it publicly", async () => {
    const r = await cm.put("/api/admin/cms/navigation/header").send({ items: [{ label: "Inventory", url: "/inventory" }, { label: "More", url: "/more", children: [{ label: "FAQ", url: "/faq" }] }] });
    expect(r.status).toBe(200);
    const site = (await request(app).get("/api/public/site")).body.data;
    expect(site.navigation.header.map((i: { label: string }) => i.label)).toEqual(["Inventory", "More"]);
    expect(site.navigation.header[1].children[0].label).toBe("FAQ");
    expect(site.settings.email).toBeUndefined(); // private config never leaks
  });

  it("rejects javascript: links in navigation", async () => {
    expect((await cm.put("/api/admin/cms/navigation/header").send({ items: [{ label: "x", url: "javascript:alert(1)" }] })).status).toBe(422);
  });

  it("testimonials: create, disable, reorder and delete; only published show publicly", async () => {
    const a = (await cm.post("/api/admin/cms/testimonials").send({ author: "A", body: "Great", rating: 5 })).body.data.id;
    const b = (await cm.post("/api/admin/cms/testimonials").send({ author: "B", body: "Good", rating: 4 })).body.data.id;
    expect((await request(app).get("/api/public/content/testimonials")).body.data).toHaveLength(2);
    expect((await cm.put(`/api/admin/cms/testimonials/${b}`).send({ status: "DRAFT" })).status).toBe(200);
    expect((await request(app).get("/api/public/content/testimonials")).body.data).toHaveLength(1);
    expect((await cm.put("/api/admin/cms/testimonials/reorder").send({ ids: [b, a] })).status).toBe(200);
    expect((await cm.post("/api/admin/cms/testimonials").send({ author: "C", body: "x", rating: 9 })).status).toBe(422);
    expect((await cm.del(`/api/admin/cms/testimonials/${a}`)).status).toBe(200);
  });

  it("vehicle categories auto-generate slugs; banners only show when published", async () => {
    const cat = await cm.post("/api/admin/cms/categories").send({ name: "Sports & Coupes" });
    expect(cat.body.data.slug).toBe("sports-coupes");
    await cm.post("/api/admin/cms/banners").send({ title: "Winter Event" });
    expect((await request(app).get("/api/public/site")).body.data.banners).toHaveLength(0);
    const id = (await prisma.banner.findFirstOrThrow()).id;
    await cm.put(`/api/admin/cms/banners/${id}`).send({ status: "PUBLISHED" });
    expect((await request(app).get("/api/public/site")).body.data.banners[0].title).toBe("Winter Event");
  });

  it("blog: draft hidden, published visible, slug uniqueness", async () => {
    const p = await cm.post("/api/admin/cms/blog").send({ title: "Hello World", body: "<p>Post</p>" });
    expect(p.status).toBe(201);
    expect((await request(app).get("/api/public/blog")).body.data).toHaveLength(0);
    expect((await cm.post("/api/admin/cms/blog").send({ title: "Hello World", body: "<p>Dup</p>" })).status).toBe(409);
    await cm.put(`/api/admin/cms/blog/${p.body.data.id}`).send({ status: "PUBLISHED" });
    expect((await request(app).get("/api/public/blog")).body.data).toHaveLength(1);
    expect((await request(app).get("/api/public/blog/hello-world")).status).toBe(200);
  });

  it("a Sales Manager cannot modify CMS content", async () => {
    const sm = await loginAs("SALES_MANAGER");
    expect((await sm.post("/api/admin/cms/testimonials").send({ author: "A", body: "x" })).status).toBe(403);
    expect((await sm.put("/api/admin/cms/navigation/header").send({ items: [] })).status).toBe(403);
  });
});

describe("media library validation", () => {
  it("accepts valid images and records metadata", async () => {
    const r = await cm.post("/api/admin/cms/media").attach("files", PNG, { filename: "logo.png", contentType: "image/png" });
    expect(r.status).toBe(201);
    expect(r.body.data[0].mimeType).toBe("image/png");
    expect(r.body.data[0].url).toMatch(/^\/uploads\//);
    expect((await cm.get("/api/admin/cms/media")).body.meta.total).toBe(1);
  });
  it("rejects executables and mislabeled files", async () => {
    const r = await cm.post("/api/admin/cms/media").attach("files", Buffer.from("MZ\x90\x00 not an image"), { filename: "x.png", contentType: "image/png" });
    expect(r.status).toBe(400);
  });
  it("deletes media", async () => {
    const m = await prisma.mediaAsset.findFirstOrThrow();
    expect((await cm.del(`/api/admin/cms/media/${m.id}`)).status).toBe(200);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });
});

describe("settings and theme", () => {
  it("Administrators update theme and settings; invalid values rejected", async () => {
    const admin = await loginAs("ADMIN");
    const ok = await admin.put("/api/admin/settings/theme").send({ primaryColor: "#112233", headingFont: "Lora" });
    expect(ok.status).toBe(200);
    expect((await request(app).get("/api/public/site")).body.data.theme.primaryColor).toBe("#112233");
    expect((await admin.put("/api/admin/settings/theme").send({ primaryColor: "red" })).status).toBe(422);
    expect((await admin.put("/api/admin/settings/theme").send({ headingFont: "x; } body{display:none" })).status).toBe(422); // CSS/font injection
    expect((await admin.put("/api/admin/settings/general").send({ dealershipName: "Acme", currency: "CAD", units: "metric" })).status).toBe(200);
    expect((await request(app).get("/api/public/site")).body.data.settings.general.dealershipName).toBe("Acme");
    expect((await admin.put("/api/admin/settings/unknown-group").send({ a: 1 })).status).toBe(404);
  });
  it("Content Managers can read but not change settings", async () => {
    expect((await cm.get("/api/admin/settings")).status).toBe(200);
    expect((await cm.put("/api/admin/settings/theme").send({ primaryColor: "#000000" })).status).toBe(403);
  });
});

describe("audit log and SEO files", () => {
  it("records admin mutations; only authorised roles can read them", async () => {
    const admin = await loginAs("ADMIN");
    expect((await admin.get("/api/admin/audit-logs")).body.meta.total).toBeGreaterThan(5);
    expect((await cm.get("/api/admin/audit-logs")).status).toBe(403);
  });
  it("serves robots.txt and an XML sitemap with published content only", async () => {
    const robots = await request(app).get("/robots.txt");
    expect(robots.text).toMatch(/Disallow: \/admin/);
    expect(robots.text).toMatch(/Sitemap:/);
    const sm = await request(app).get("/sitemap.xml");
    expect(sm.headers["content-type"]).toMatch(/xml/);
    expect(sm.text).toContain("<urlset");
    expect(sm.text).toContain("/blog/hello-world");
  });
  it("sets security headers and a consistent 404 envelope", async () => {
    const r = await request(app).get("/api/nope");
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-powered-by"]).toBeUndefined();
  });
});
