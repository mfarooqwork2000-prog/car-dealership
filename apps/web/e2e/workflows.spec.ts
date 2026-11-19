import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_REP } from "./global-setup";

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
test.afterAll(() => db.$disconnect());

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function login(page: Page, who = E2E_ADMIN) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("customer website → database → admin portal", () => {
  test("homepage is rendered from CMS content stored in the database", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Drive something exceptional");
    await expect(page.getByRole("heading", { name: "Featured Vehicles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What Our Customers Say" })).toBeVisible();
  });

  test("inventory filters use real data and update the result count", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByTestId("result-count")).toHaveText("12 vehicles found");
    await page.getByLabel("Make", { exact: true }).selectOption({ label: "BMW" });
    await expect(page.getByTestId("result-count")).toHaveText("1 vehicle found");
    await expect(page).toHaveURL(/make=bmw/);
    await page.getByRole("button", { name: "Clear all filters" }).click();
    await page.getByLabel("Fuel type").selectOption("Electric");
    await expect(page.getByTestId("result-count")).toHaveText("2 vehicles found");
    await page.getByRole("button", { name: "List view" }).click();
    await expect(page).toHaveURL(/view=list/);
  });

  test("a customer enquiry is saved in PostgreSQL and the admin can manage it", async ({ page }) => {
    const email = `buyer.${Date.now()}@example.com`;
    await page.goto("/inventory");
    await page.getByRole("link", { name: /2021 BMW X5/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: /2021 BMW X5/ })).toBeVisible();
    await page.getByRole("button", { name: "Contact dealership" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel(/First name/).fill("Casey");
    await dlg.getByLabel(/Last name/).fill("Buyer");
    await dlg.getByLabel(/^Email/).fill(email);
    await dlg.getByLabel(/^Message/).fill("Is the X5 still available this weekend?");
    await dlg.getByRole("button", { name: "Send enquiry" }).click();
    await expect(dlg.getByText("Enquiry sent")).toBeVisible();

    // persisted in PostgreSQL with the right relations
    const lead = await db.lead.findFirstOrThrow({ where: { customer: { email } }, include: { customer: true, vehicle: true } });
    expect(lead.type).toBe("VEHICLE");
    expect(lead.status).toBe("NEW");
    expect(lead.vehicle?.title).toContain("BMW X5");

    // admin works the lead
    await login(page);
    await page.goto("/admin/leads");
    await page.getByLabel("Search leads").fill(email);
    await page.getByLabel("Search leads").press("Enter");
    await page.getByRole("row", { name: /Casey Buyer/ }).click();
    await expect(page.getByRole("heading", { name: "Casey Buyer" })).toBeVisible();
    await page.getByLabel("Status").selectOption("CONTACTED");
    await expect(page.getByText("Lead updated")).toBeVisible();
    await page.getByLabel("New note").fill("Called customer, booked for Saturday");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Called customer, booked for Saturday")).toBeVisible();
    await page.getByLabel("Assigned to").selectOption({ label: "E2E Owner" });
    await expect(page.getByText("Lead updated").first()).toBeVisible();

    await expect.poll(async () => (await db.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { assignee: true } })).assignee?.email).toBe(E2E_ADMIN.email);
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { notes: true } });
    expect(after.status).toBe("CONTACTED");
    expect(after.notes).toHaveLength(1);
  });

  test("financing, trade-in and contact forms submit successfully", async ({ page }) => {
    await page.goto("/trade-in");
    await page.getByLabel(/First name/).fill("Tara");
    await page.getByLabel(/Last name/).fill("Trader");
    await page.getByLabel(/^Email/).fill("tara.trader@example.com");
    await page.getByLabel(/^Make/).fill("Honda");
    await page.getByLabel(/^Model/).fill("Accord");
    await page.getByLabel(/^Year/).fill("2017");
    await page.getByLabel(/^Mileage/).fill("96000");
    await page.getByRole("button", { name: "Request valuation" }).click();
    await expect(page.getByText("Valuation requested")).toBeVisible();
    expect(await db.tradeInRequest.count({ where: { customer: { email: "tara.trader@example.com" } } })).toBe(1);

    await page.goto("/financing");
    await page.getByLabel(/First name/).fill("Finn");
    await page.getByLabel(/Last name/).fill("Financer");
    await page.getByLabel(/^Email/).fill("finn@example.com");
    await page.getByLabel("Annual income (CAD)").fill("80000");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Application received")).toBeVisible();
    expect(await db.financingApplication.count()).toBeGreaterThan(0);

    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible(); // validation blocks empty submit
  });
});

test.describe("admin portal", () => {
  test("add a vehicle with a photo, publish it, then unpublish and delete it", async ({ page }) => {
    await login(page);
    await page.goto("/admin/vehicles/new");
    await page.getByLabel(/Listing title/).fill("2024 Mazda CX-50 Turbo");
    await page.getByLabel(/^Make/).fill("Mazda");
    await page.getByLabel(/^Model/).fill("CX-50");
    await page.getByLabel(/^Year/).fill("2024");
    await page.getByLabel(/Stock number/).fill("E2E-001");
    await page.getByLabel(/Price/).first().fill("44900");
    await page.getByLabel("Visibility").selectOption("PUBLISHED");
    await page.getByRole("button", { name: "Create vehicle" }).click();
    await expect(page.getByText(/Vehicle created/)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/vehicles\/[a-z0-9]+$/);

    await page.locator('input[type="file"]').setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Images uploaded")).toBeVisible();
    await expect(page.getByText("Primary", { exact: true })).toBeVisible();

    // visible on the public site, backed by the database
    await page.goto("/inventory?q=CX-50");
    await expect(page.getByTestId("result-count")).toHaveText("1 vehicle found");
    const v = await db.vehicle.findUniqueOrThrow({ where: { stockNumber: "E2E-001" }, include: { images: true } });
    expect(v.images).toHaveLength(1);

    // bad upload is rejected with a clear message
    await page.goto(`/admin/vehicles/${v.id}`);
    await page.locator('input[type="file"]').setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("not really a png at all, just text") });
    await expect(page.getByText(/Images uploaded|Unsupported/)).toBeVisible();
    expect(await db.vehicleImage.count({ where: { vehicleId: v.id } })).toBe(1);

    // unpublish → disappears from the public site
    await page.getByLabel("Visibility").selectOption("DRAFT");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Vehicle saved")).toBeVisible();
    await page.goto("/inventory?q=CX-50");
    await expect(page.getByTestId("result-count")).toHaveText("0 vehicles found");

    // delete from the list
    await page.goto("/admin/vehicles");
    await page.getByLabel("Search vehicles").fill("E2E-001");
    await page.getByLabel("Search vehicles").press("Enter");
    await expect(page.getByRole("row", { name: /E2E-001/ })).toHaveCount(1);
    await expect(page.getByRole("row")).toHaveCount(2); // header + the one match
    await page.getByRole("row", { name: /E2E-001/ }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("Deleted")).toBeVisible();
    expect(await db.vehicle.count({ where: { stockNumber: "E2E-001" } })).toBe(0);
  });

  test("CMS: edit the homepage hero, hide a section, and the public site follows", async ({ page }) => {
    await login(page);
    await page.goto("/admin/cms/pages");
    await page.getByRole("link", { name: "Home", exact: true }).first().click();
    await page.getByRole("button", { name: "Edit section" }).first().click(); // hero
    await page.getByLabel(/^Heading/).fill("Find your perfect ride");
    await page.getByRole("button", { name: "Save section" }).click();
    await expect(page.getByText("Section saved")).toBeVisible();

    // hide the Testimonials section
    const row = page.getByRole("listitem").filter({ hasText: "Testimonials" }).first();
    await row.getByRole("button", { name: "Hide section" }).click();

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find your perfect ride");
    await expect(page.getByRole("heading", { name: "What Our Customers Say" })).toHaveCount(0);

    // restore
    await page.goto("/admin/cms/pages");
    await page.getByRole("link", { name: "Home", exact: true }).first().click();
    await page.getByRole("listitem").filter({ hasText: "Testimonials" }).first().getByRole("button", { name: "Show section" }).click();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "What Our Customers Say" })).toBeVisible();
  });

  test("create, publish and unpublish a custom landing page", async ({ page }) => {
    await login(page);
    await page.goto("/admin/cms/pages");
    await page.getByRole("button", { name: "New landing page" }).click();
    await page.getByLabel(/^Title/).fill("Spring Event");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { name: "Spring Event" })).toBeVisible();
    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByLabel("Section type").selectOption("rich-text");
    await page.getByRole("dialog").getByRole("button", { name: "Add section" }).click();
    await page.getByLabel(/^Heading/).fill("Spring savings");
    await page.getByRole("button", { name: "Save section" }).click();
    await page.goto("/spring-event");
    await expect(page.getByText("Page not found")).toBeVisible(); // still a draft
    await page.goBack();
    await page.getByRole("button", { name: "Publish" }).click();
    await page.goto("/spring-event");
    await expect(page.getByRole("heading", { name: "Spring savings" })).toBeVisible();
  });

  test("branding: the dealership name from Settings appears on the public site", async ({ page }) => {
    await login(page);
    await page.goto("/admin/settings");
    const card = page.locator("h3", { hasText: /^Dealership$/ }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    await card.getByLabel("Dealership name").fill("Northern Lights Auto");
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Dealership saved")).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Northern Lights Auto home" })).toBeVisible();
    const s = await db.websiteSetting.findUniqueOrThrow({ where: { key: "general" } });
    expect((s.value as { dealershipName: string }).dealershipName).toBe("Northern Lights Auto");
  });

  test("appearance: changing the accent colour restyles the public site", async ({ page }) => {
    await login(page);
    await page.goto("/admin/appearance");
    const hexInputs = page.locator('input[type="color"]');
    await hexInputs.nth(2).fill("#ff0000");
    await page.getByRole("button", { name: "Save appearance" }).click();
    await expect(page.getByText(/Appearance saved/)).toBeVisible();
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("255 0 0");
  });
});

test.describe("role-based access in the UI and API", () => {
  test("anonymous visitors are redirected away from the admin portal", async ({ page }) => {
    await page.goto("/admin/vehicles");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("a Sales Rep sees a reduced menu and is blocked from restricted pages", async ({ page }) => {
    await login(page, E2E_REP);
    await expect(page.getByRole("link", { name: "Leads" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users & Roles" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page.getByText("Access denied")).toBeVisible();
    // and the API itself refuses, independent of the UI
    const status = await page.evaluate(async () => {
      const t = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" }).then((r) => r.json()).then((j) => j.data.accessToken);
      return (await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${t}` } })).status;
    });
    expect(status).toBe(403);
  });

  test("invalid credentials show an error and stay on the login page", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(E2E_ADMIN.email);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid email or password");
    await expect(page).toHaveURL(/login/);
  });

  test("sign out ends the session", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("responsive and SEO", () => {
  test("mobile: navigation menu opens and the vehicle page is usable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Inventory" }).click();
    await expect(page).toHaveURL(/\/inventory/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await page.getByRole("link", { name: /2021 BMW X5/ }).click();
    await expect(page.getByRole("button", { name: "Book a test drive" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  });

  test("vehicle pages expose title, description, canonical, Open Graph and JSON-LD", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByRole("link", { name: /2022 Audi Q5/ }).click();
    await expect(page).toHaveTitle(/2022 Audi Q5/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Audi Q5/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/inventory\/2022-audi-q5/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Audi Q5/);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(ld["@type"]).toBe("Car");
    expect(ld.offers.priceCurrency).toBe("CAD");
  });

  test("sitemap.xml and robots.txt are served", async ({ request }) => {
    const sm = await request.get("/sitemap.xml");
    expect(sm.ok()).toBeTruthy();
    expect(await sm.text()).toContain("/inventory/");
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /admin");
  });
});
