import { beforeAll, describe, expect, it } from "vitest";
import { PNG, app, loginAs, prisma, request, resetDb, vehicleBody } from "./helpers.js";

let admin: Awaited<ReturnType<typeof loginAs>>;
beforeAll(async () => {
  await resetDb();
  admin = await loginAs("ADMIN");
});

describe("vehicle CRUD", () => {
  let id = "";
  it("creates a vehicle with make/model/features and a unique slug", async () => {
    const res = await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: "CRUD1", title: "2022 Audi Q5" }));
    expect(res.status).toBe(201);
    id = res.body.data.id;
    expect(res.body.data.slug).toMatch(/2022-testmake-modelx-crud1/);
    expect(res.body.data.features).toHaveLength(1);
    expect(res.body.data.price).toBe(30000);
    expect(await prisma.make.count({ where: { slug: "testmake" } })).toBe(1);
  });

  it("rejects duplicate stock numbers (409) and invalid input (422)", async () => {
    expect((await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: "CRUD1" }))).status).toBe(409);
    const bad = await admin.post("/api/admin/vehicles").send(vehicleBody({ price: -5, year: 1800, title: "x" }));
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(["price", "year", "title"]));
  });

  it("treats blank optional numeric inputs as empty instead of zero", async () => {
    const res = await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: "BLANK1", salePrice: "", cylinders: "", horsepower: "" }));
    expect(res.status).toBe(201);
    expect(res.body.data.salePrice).toBeNull();
    expect(res.body.data.cylinders).toBeNull();
  });

  it("reads, updates (replacing features) and sets soldAt when marked sold", async () => {
    expect((await admin.get(`/api/admin/vehicles/${id}`)).body.data.stockNumber).toBe("CRUD1");
    const upd = await admin.put(`/api/admin/vehicles/${id}`).send(vehicleBody({ stockNumber: "CRUD1", price: 28500, status: "SOLD", features: [{ name: "Heated seats" }, { name: "heated seats" }] }));
    expect(upd.status).toBe(200);
    expect(upd.body.data.price).toBe(28500);
    expect(upd.body.data.features).toHaveLength(1); // case-insensitive de-dupe
    expect(upd.body.data.soldAt).toBeTruthy();
  });

  it("duplicates as an unpublished draft with a new stock number and no VIN", async () => {
    const res = await admin.post(`/api/admin/vehicles/${id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.data.publishStatus).toBe("DRAFT");
    expect(res.body.data.stockNumber).toBe("CRUD1-COPY");
    expect(res.body.data.vin).toBeNull();
  });

  it("returns 404 for unknown ids and deletes vehicles", async () => {
    expect((await admin.get("/api/admin/vehicles/does-not-exist")).status).toBe(404);
    expect((await admin.del(`/api/admin/vehicles/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/admin/vehicles/${id}`)).status).toBe(404);
  });

  it("bulk actions: publish, feature, status, archive, delete", async () => {
    const ids: string[] = [];
    for (const s of ["B1", "B2", "B3"]) ids.push((await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: s, publishStatus: "DRAFT" }))).body.data.id);
    expect((await admin.post("/api/admin/vehicles/bulk").send({ ids, action: "publish" })).body.data.affected).toBe(3);
    expect((await prisma.vehicle.count({ where: { id: { in: ids }, publishStatus: "PUBLISHED" } }))).toBe(3);
    await admin.post("/api/admin/vehicles/bulk").send({ ids, action: "feature" });
    await admin.post("/api/admin/vehicles/bulk").send({ ids: [ids[0]], action: "status", status: "SOLD" });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: ids[0] } })).soldAt).toBeTruthy();
    await admin.post("/api/admin/vehicles/bulk").send({ ids: [ids[1]], action: "archive" });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: ids[1] } })).status).toBe("ARCHIVED");
    expect((await admin.post("/api/admin/vehicles/bulk").send({ ids, action: "delete" })).body.data.affected).toBe(3);
    expect((await admin.post("/api/admin/vehicles/bulk").send({ ids: [], action: "publish" })).status).toBe(422);
  });

  it("bulk delete requires the delete permission", async () => {
    const mgr = await loginAs("CONTENT_MANAGER");
    expect((await mgr.post("/api/admin/vehicles/bulk").send({ ids: ["x"], action: "publish" })).status).toBe(403);
  });
});

describe("vehicle image management and upload validation", () => {
  let vid = "";
  beforeAll(async () => {
    vid = (await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: "IMG1" }))).body.data.id;
  });

  it("accepts real images, makes the first one primary", async () => {
    const res = await admin.post(`/api/admin/vehicles/${vid}/images`).attach("images", PNG, { filename: "a.png", contentType: "image/png" }).attach("images", PNG, { filename: "b.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].isPrimary).toBe(true);
    expect(res.body.data[1].isPrimary).toBe(false);
  });

  it("rejects non-image content disguised with an image name/MIME type", async () => {
    const res = await admin.post(`/api/admin/vehicles/${vid}/images`).attach("images", Buffer.from("<?php echo 1; ?> this is not an image at all"), { filename: "evil.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/unsupported|corrupt/i);
  });

  it("rejects SVG uploads and oversized files", async () => {
    const svg = await admin.post(`/api/admin/vehicles/${vid}/images`).attach("images", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { filename: "x.svg", contentType: "image/svg+xml" });
    expect(svg.status).toBe(400);
    const big = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]);
    const res = await admin.post(`/api/admin/vehicles/${vid}/images`).attach("images", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(400);
  });

  it("requires at least one file and the right permission", async () => {
    expect((await admin.post(`/api/admin/vehicles/${vid}/images`)).status).toBe(400);
    const rep = await loginAs("SALES_REP");
    expect((await rep.post(`/api/admin/vehicles/${vid}/images`).attach("images", PNG, { filename: "a.png", contentType: "image/png" })).status).toBe(403);
  });

  it("reorders, changes primary and promotes another image when the primary is deleted", async () => {
    const images = (await admin.get(`/api/admin/vehicles/${vid}`)).body.data.images as { id: string; isPrimary: boolean }[];
    const [first, second] = images;
    expect((await admin.put(`/api/admin/vehicles/${vid}/images/order`).send({ ids: [second.id, first.id] })).status).toBe(200);
    expect((await admin.put(`/api/admin/vehicles/${vid}/images/${second.id}/primary`)).status).toBe(200);
    const after = (await admin.get(`/api/admin/vehicles/${vid}`)).body.data.images as { id: string; isPrimary: boolean }[];
    expect(after[0].id).toBe(second.id);
    expect(after.filter((i) => i.isPrimary)).toHaveLength(1);
    expect((await admin.del(`/api/admin/vehicles/${vid}/images/${second.id}`)).status).toBe(200);
    const left = (await admin.get(`/api/admin/vehicles/${vid}`)).body.data.images;
    expect(left).toHaveLength(1);
    expect(left[0].isPrimary).toBe(true);
  });
});

describe("public inventory search and filtering (real DB data)", () => {
  beforeAll(async () => {
    await resetDb();
    admin = await loginAs("ADMIN");
    const rows = [
      { stockNumber: "P1", title: "2020 BMW X5", makeName: "BMW", modelName: "X5", year: 2020, price: 60000, mileage: 50000, bodyType: "SUV", fuelType: "Gasoline", exteriorColor: "Black", condition: "USED" },
      { stockNumber: "P2", title: "2023 BMW M3", makeName: "BMW", modelName: "M3", year: 2023, price: 90000, mileage: 5000, bodyType: "Sedan", fuelType: "Gasoline", exteriorColor: "Blue", condition: "NEW", isFeatured: true },
      { stockNumber: "P3", title: "2022 Tesla Model 3", makeName: "Tesla", modelName: "Model 3", year: 2022, price: 45000, mileage: 20000, bodyType: "Sedan", fuelType: "Electric", exteriorColor: "White" },
      { stockNumber: "P4", title: "2019 Honda Civic", makeName: "Honda", modelName: "Civic", year: 2019, price: 20000, mileage: 80000, bodyType: "Sedan", fuelType: "Gasoline", exteriorColor: "Black", status: "SOLD" },
      { stockNumber: "P5", title: "Hidden Draft Car", makeName: "Ford", modelName: "Focus", year: 2021, price: 18000, mileage: 1000, publishStatus: "DRAFT" },
      { stockNumber: "P6", title: "Archived Car", makeName: "Ford", modelName: "Fiesta", year: 2018, price: 9000, mileage: 90000, status: "ARCHIVED" },
    ];
    for (const r of rows) expect((await admin.post("/api/admin/vehicles").send(vehicleBody(r))).status).toBe(201);
  });
  const list = async (qs = "") => (await request(app).get(`/api/public/vehicles${qs}`)).body;

  it("never exposes drafts or archived vehicles; includes sold ones (shown last)", async () => {
    const b = await list();
    const titles = b.data.map((v: { title: string }) => v.title);
    expect(b.meta.total).toBe(4);
    expect(titles).not.toContain("Hidden Draft Car");
    expect(titles).not.toContain("Archived Car");
    expect(titles[titles.length - 1]).toBe("2019 Honda Civic");
  });
  it("filters by make, model, body type, fuel, colour, condition", async () => {
    expect((await list("?make=bmw")).meta.total).toBe(2);
    expect((await list("?make=bmw&model=x5")).meta.total).toBe(1);
    expect((await list("?bodyType=Sedan")).meta.total).toBe(3);
    expect((await list("?fuelType=Electric")).data[0].title).toBe("2022 Tesla Model 3");
    expect((await list("?exteriorColor=black")).meta.total).toBe(2); // case-insensitive
    expect((await list("?condition=NEW")).meta.total).toBe(1);
  });
  it("filters by year, price and mileage ranges", async () => {
    expect((await list("?yearMin=2022")).meta.total).toBe(2);
    expect((await list("?priceMin=40000&priceMax=70000")).meta.total).toBe(2);
    expect((await list("?mileageMax=20000")).meta.total).toBe(2);
    expect((await list("?priceMax=1")).meta.total).toBe(0);
  });
  it("combines filters, searches text and hides sold when asked", async () => {
    expect((await list("?bodyType=Sedan&priceMax=50000")).meta.total).toBe(2);
    expect((await list("?q=tesla")).meta.total).toBe(1);
    expect((await list("?q=P2")).data[0].stockNumber).toBe("P2");
    expect((await list("?availableOnly=true")).meta.total).toBe(3);
    expect((await list("?featured=true")).meta.total).toBe(1);
  });
  it("sorts and paginates", async () => {
    const asc = await list("?sort=price-asc&availableOnly=true");
    expect(asc.data.map((v: { price: number }) => v.price)).toEqual([45000, 60000, 90000]);
    const p2 = await list("?limit=2&page=2");
    expect(p2.data).toHaveLength(2);
    expect(p2.meta).toMatchObject({ total: 4, page: 2, totalPages: 2, limit: 2 });
  });
  it("facets are derived from real published data", async () => {
    const f = (await request(app).get("/api/public/vehicles/facets")).body.data;
    expect(f.makes.map((m: { name: string }) => m.name)).toEqual(["BMW", "Honda", "Tesla"]);
    expect(f.bodyTypes).toEqual(["SUV", "Sedan"]);
    expect(f.range).toMatchObject({ priceMin: 20000, priceMax: 90000 });
  });
  it("detail page by slug returns similar vehicles; drafts 404", async () => {
    const slug = (await list("?q=X5")).data[0].slug;
    const d = await request(app).get(`/api/public/vehicles/${slug}`);
    expect(d.status).toBe(200);
    expect(d.body.data.similar.length).toBeGreaterThan(0);
    const draft = await prisma.vehicle.findFirstOrThrow({ where: { stockNumber: "P5" } });
    expect((await request(app).get(`/api/public/vehicles/${draft.slug}`)).status).toBe(404);
  });
  it("SQL-injection style input is handled safely", async () => {
    const r = await list("?q=%27%3B%20DROP%20TABLE%20%22Vehicle%22%3B--");
    expect(r.success).toBe(true);
    expect(await prisma.vehicle.count()).toBeGreaterThan(0);
  });
});
