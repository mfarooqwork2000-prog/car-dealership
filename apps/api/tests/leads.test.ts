import { beforeAll, describe, expect, it } from "vitest";
import { app, loginAs, prisma, request, resetDb, vehicleBody } from "./helpers.js";

let admin: Awaited<ReturnType<typeof loginAs>>;
let vehicleId = "";
let draftId = "";
const person = { firstName: "Jane", lastName: "Doe", email: "Jane.Doe@Example.com", phone: "416-555-0100" };

beforeAll(async () => {
  await resetDb();
  admin = await loginAs("ADMIN");
  vehicleId = (await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: "L1", title: "Lead Car" }))).body.data.id;
  draftId = (await admin.post("/api/admin/vehicles").send(vehicleBody({ stockNumber: "L2", publishStatus: "DRAFT" }))).body.data.id;
});
const submit = (kind: string, body: object) => request(app).post(`/api/public/leads/${kind}`).send(body);

describe("public lead creation", () => {
  it("saves a general enquiry and creates a customer (email normalised)", async () => {
    const r = await submit("general", { ...person, subject: "Hours", message: "Are you open Monday?" });
    expect(r.status).toBe(201);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { customer: true } });
    expect(lead.type).toBe("GENERAL");
    expect(lead.status).toBe("NEW");
    expect(lead.customer.email).toBe("jane.doe@example.com");
  });

  it("reuses the customer record for repeat enquiries (same email)", async () => {
    await submit("general", { ...person, message: "Second message here" });
    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.lead.count()).toBe(2);
  });

  it("saves a vehicle enquiry linked to the vehicle", async () => {
    const r = await submit("vehicle", { ...person, vehicleId, message: "Is it available?" });
    expect(r.status).toBe(201);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: r.body.data.id } })).vehicleId).toBe(vehicleId);
  });

  it("rejects enquiries about unpublished or unknown vehicles", async () => {
    expect((await submit("vehicle", { ...person, vehicleId: draftId, message: "Hello there" })).status).toBe(404);
    expect((await submit("vehicle", { ...person, vehicleId: "nope", message: "Hello there" })).status).toBe(404);
  });

  it("saves a test-drive request with its details; rejects past dates", async () => {
    const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const r = await submit("test-drive", { ...person, vehicleId, preferredDate: date, preferredTime: "Morning" });
    expect(r.status).toBe(201);
    const td = await prisma.testDriveRequest.findUniqueOrThrow({ where: { leadId: r.body.data.id } });
    expect(td.preferredTime).toBe("Morning");
    expect((await submit("test-drive", { ...person, vehicleId, preferredDate: "2001-01-01" })).status).toBe(400);
  });

  it("saves a financing application, accepting blank optional numbers", async () => {
    const r = await submit("financing", { ...person, vehicleId, employmentStatus: "Full-time", annualIncome: "85000", downPayment: "", termMonths: "72", monthlyHousing: "" });
    expect(r.status).toBe(201);
    const f = await prisma.financingApplication.findUniqueOrThrow({ where: { leadId: r.body.data.id } });
    expect(Number(f.annualIncome)).toBe(85000);
    expect(f.downPayment).toBeNull();
    expect(f.termMonths).toBe(72);
  });

  it("saves a trade-in request", async () => {
    const r = await submit("trade-in", { ...person, make: "Honda", model: "Accord", year: 2017, mileage: 96000, vin: "", condition: "Good" });
    expect(r.status).toBe(201);
    expect((await prisma.tradeInRequest.findUniqueOrThrow({ where: { leadId: r.body.data.id } })).model).toBe("Accord");
  });

  it("validates input with a field-level error envelope", async () => {
    const r = await submit("general", { firstName: "", email: "bad", message: "hi" });
    expect(r.status).toBe(422);
    expect(r.body.success).toBe(false);
    expect(Object.keys(r.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(["firstName", "email", "message", "lastName"]));
    expect((await submit("trade-in", { ...person, make: "A", model: "B", year: 1800, mileage: -1 })).status).toBe(422);
  });

  it("notifies staff in-app about new leads", async () => {
    expect(await prisma.notification.count({ where: { title: { startsWith: "New" } } })).toBeGreaterThan(0);
  });

  it("stores script content as inert text (no execution surface on the API)", async () => {
    const r = await submit("general", { ...person, message: "<script>alert(1)</script> hello" });
    expect(r.status).toBe(201);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: r.body.data.id } })).message).toContain("<script>");
  });
});

describe("lead management (admin)", () => {
  let leadId = "";
  beforeAll(async () => { leadId = (await prisma.lead.findFirstOrThrow({ where: { type: "VEHICLE" } })).id; });

  it("lists with filters, search and pagination", async () => {
    const all = await admin.get("/api/admin/leads");
    expect(all.body.meta.total).toBeGreaterThanOrEqual(7);
    expect((await admin.get("/api/admin/leads?type=FINANCING")).body.meta.total).toBe(1);
    expect((await admin.get("/api/admin/leads?q=accord")).body.meta.total).toBe(1);
    expect((await admin.get("/api/admin/leads?status=LOST")).body.meta.total).toBe(0);
    expect((await admin.get("/api/admin/leads?limit=2&page=2")).body.data).toHaveLength(2);
  });

  it("changes status and assigns to an employee (who gets notified)", async () => {
    const rep = await loginAs("SALES_REP");
    const repUser = await prisma.user.findUniqueOrThrow({ where: { email: "sales_rep@test.dev" } });
    expect((await admin.patch(`/api/admin/leads/${leadId}`).send({ status: "CONTACTED", assigneeId: repUser.id })).status).toBe(200);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(l.status).toBe("CONTACTED");
    expect(l.assigneeId).toBe(repUser.id);
    expect(await prisma.notification.count({ where: { userId: repUser.id, title: "Lead assigned to you" } })).toBe(1);
    expect((await rep.get("/api/admin/notifications")).body.meta.unread).toBe(1);
  });

  it("rejects invalid status values and unknown assignees", async () => {
    expect((await admin.patch(`/api/admin/leads/${leadId}`).send({ status: "BOGUS" })).status).toBe(422);
    expect((await admin.patch(`/api/admin/leads/${leadId}`).send({ assigneeId: "ghost" })).status).toBe(404);
  });

  it("Sales Rep sees only assigned leads and cannot reach others (IDOR check)", async () => {
    const rep = await loginAs("SALES_REP");
    const mine = await rep.get("/api/admin/leads");
    expect(mine.body.meta.total).toBe(1);
    expect(mine.body.data[0].id).toBe(leadId);
    const other = await prisma.lead.findFirstOrThrow({ where: { id: { not: leadId } } });
    expect((await rep.get(`/api/admin/leads/${other.id}`)).status).toBe(404);
    expect((await rep.patch(`/api/admin/leads/${other.id}`).send({ status: "LOST" })).status).toBe(404);
    expect((await rep.post(`/api/admin/leads/${other.id}/notes`).send({ body: "x" })).status).toBe(404);
  });

  it("Sales Rep can work their lead (status, notes) but cannot reassign it or export", async () => {
    const rep = await loginAs("SALES_REP");
    expect((await rep.patch(`/api/admin/leads/${leadId}`).send({ status: "QUALIFIED" })).status).toBe(200);
    expect((await rep.patch(`/api/admin/leads/${leadId}`).send({ assigneeId: null })).status).toBe(403);
    expect((await rep.get("/api/admin/leads/export")).status).toBe(403);
  });

  it("adds notes and follow-ups, and returns contact history", async () => {
    expect((await admin.post(`/api/admin/leads/${leadId}/notes`).send({ body: "Called, left voicemail" })).status).toBe(201);
    expect((await admin.post(`/api/admin/leads/${leadId}/notes`).send({ body: "   " })).status).toBe(422);
    const fu = await admin.post(`/api/admin/leads/${leadId}/follow-ups`).send({ dueAt: new Date(Date.now() + 864e5).toISOString(), note: "Call back" });
    expect(fu.status).toBe(201);
    expect((await admin.patch(`/api/admin/leads/${leadId}/follow-ups/${fu.body.data.id}`)).body.data.completedAt).toBeTruthy();
    const detail = (await admin.get(`/api/admin/leads/${leadId}`)).body.data;
    expect(detail.notes).toHaveLength(1);
    expect(detail.notes[0].author.firstName).toBe("ADMIN");
    expect(detail.history.length).toBeGreaterThan(0); // other enquiries from the same customer
  });

  it("exports CSV and neutralises spreadsheet-formula injection", async () => {
    await submit("general", { ...person, message: "=HYPERLINK(\"http://evil\",\"x\") payload", subject: "+cmd" });
    const r = await admin.get("/api/admin/leads/export");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.text.split("\r\n")[0]).toContain('"Email"');
    expect(r.text).toContain("\"'=HYPERLINK");
    expect(r.text).toContain("\"'+cmd\"");
  });

  it("customer management: list, history, edit and internal notes", async () => {
    const list = await admin.get("/api/admin/customers");
    expect(list.body.data[0]._count.leads).toBeGreaterThan(3);
    const id = list.body.data[0].id;
    const upd = await admin.patch(`/api/admin/customers/${id}`).send({ city: "Toronto", notes: "VIP" });
    expect(upd.body.data.notes).toBe("VIP");
    const d = await admin.get(`/api/admin/customers/${id}`);
    expect(d.body.data.leads.length).toBeGreaterThan(3);
    const rep = await loginAs("SALES_REP");
    expect((await rep.patch(`/api/admin/customers/${id}`).send({ notes: "x" })).status).toBe(403);
  });

  it("dashboard statistics reflect real data", async () => {
    const d = (await admin.get("/api/admin/dashboard")).body.data;
    expect(d.vehicles.total).toBe(2);
    expect(d.leads.testDrives).toBe(1);
    expect(d.leads.financing).toBe(1);
    expect(d.leads.tradeIns).toBe(1);
    expect(d.leads.total).toBeGreaterThan(5);
  });
});
