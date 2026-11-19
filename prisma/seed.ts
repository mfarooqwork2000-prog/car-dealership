/**
 * Development seed. Idempotent: safe to re-run (CMS/vehicle data is only inserted when empty).
 * Creates NO user accounts and NO passwords — run `npm run admin:create` afterwards.
 * Vehicle images are generated SVG placeholders written to /uploads (replace via the admin portal).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_KEYS, ROLE_LABELS, ROLE_PERMISSIONS, slugify } from "../packages/shared/src/index.js";

const prisma = new PrismaClient();
// --minimal: only what the app needs to run (roles, permissions, theme, settings, navigation, categories, pages) — no demo vehicles, customers, leads, reviews or posts.
const minimal = process.argv.includes("--minimal");
const uploads = path.resolve(import.meta.dirname ?? ".", "../uploads");
fs.mkdirSync(uploads, { recursive: true });

function placeholder(name: string, label: string, hue: number, variant: number) {
  const file = `seed-${name}-${variant}.svg`;
  const bodyY = 250 + variant * 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},25%,18%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},30%,8%)"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><ellipse cx="600" cy="620" rx="420" ry="28" fill="#000" opacity=".35"/><path d="M200 ${bodyY + 250} q10-110 120-130 l130-90 q50-35 120-35 h180 q80 0 130 40 l90 85 q110 10 120 130 v30 h-890z" fill="hsl(${hue},45%,${42 + variant * 4}%)"/><path d="M430 ${bodyY + 110} l90-60 h150 q60 0 90 40 l50 20z" fill="#cfe4f2" opacity=".75"/><circle cx="360" cy="${bodyY + 290}" r="62" fill="#111"/><circle cx="360" cy="${bodyY + 290}" r="32" fill="#9aa4ad"/><circle cx="840" cy="${bodyY + 290}" r="62" fill="#111"/><circle cx="840" cy="${bodyY + 290}" r="32" fill="#9aa4ad"/><text x="600" y="110" text-anchor="middle" font-family="Georgia,serif" font-size="54" fill="#fff" opacity=".92">${label}</text><text x="600" y="160" text-anchor="middle" font-family="Arial" font-size="24" fill="#fff" opacity=".5">PLACEHOLDER IMAGE · ${["FRONT", "SIDE", "REAR"][variant] ?? "VIEW"}</text></svg>`;
  fs.writeFileSync(path.join(uploads, file), svg);
  return `/uploads/${file}`;
}

async function main() {
  // ── Roles & permissions ──
  for (const [key, label] of Object.entries(PERMISSIONS)) await prisma.permission.upsert({ where: { key }, update: { label }, create: { key, label } });
  for (const key of ROLE_KEYS) {
    const role = await prisma.role.upsert({ where: { key }, update: { name: ROLE_LABELS[key] }, create: { key, name: ROLE_LABELS[key] } });
    const perms = await prisma.permission.findMany({ where: { key: { in: ROLE_PERMISSIONS[key] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }

  await prisma.themeSetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });

  const defaults: Record<string, object> = {
    general: { dealershipName: "Aurelian Motors", tagline: "Exceptional vehicles. Exceptional service.", currency: "CAD", units: "metric", locale: "en-CA" },
    contact: { phone: "(416) 555-0142", email: "sales@aurelianmotors.example", address: "1200 Lakeshore Blvd W", city: "Toronto", province: "ON", postalCode: "M8V 1A1", mapsQuery: "1200 Lakeshore Blvd W, Toronto, ON" },
    hours: { monday: "9:00 AM – 7:00 PM", tuesday: "9:00 AM – 7:00 PM", wednesday: "9:00 AM – 7:00 PM", thursday: "9:00 AM – 7:00 PM", friday: "9:00 AM – 7:00 PM", saturday: "10:00 AM – 5:00 PM", sunday: "Closed" },
    social: { facebook: "https://facebook.com", instagram: "https://instagram.com", youtube: "", x: "" },
    seo: { titleSuffix: "Aurelian Motors", defaultDescription: "Premium pre-owned and new vehicles in Toronto. Financing, trade-ins and test drives available." },
    images: { maxUploadMb: 8 },
    notifications: { notifyOnNewLead: true },
    privacy: { showCookieNotice: true },
    footer: { about: "Aurelian Motors is a family-owned dealership offering carefully inspected vehicles and transparent pricing.", copyright: "© Aurelian Motors. All rights reserved." },
  };
  for (const [key, value] of Object.entries(defaults)) await prisma.websiteSetting.upsert({ where: { key }, update: {}, create: { key, value } });

  // ── Navigation ──
  if ((await prisma.navigationMenu.count()) === 0) {
    const header = await prisma.navigationMenu.create({ data: { key: "header", name: "Header" } });
    const footer = await prisma.navigationMenu.create({ data: { key: "footer", name: "Footer" } });
    const h = [["Inventory", "/inventory"], ["Financing", "/financing"], ["Trade-In", "/trade-in"], ["Services", "/services"], ["About", "/about"], ["Blog", "/blog"], ["Contact", "/contact"]];
    const f = [["FAQ", "/faq"], ["Privacy Policy", "/privacy-policy"], ["Terms & Conditions", "/terms"], ["Contact", "/contact"]];
    await prisma.navigationItem.createMany({ data: h.map(([label, url], position) => ({ menuId: header.id, label, url, position })) });
    await prisma.navigationItem.createMany({ data: f.map(([label, url], position) => ({ menuId: footer.id, label, url, position })) });
  }

  // ── Categories ──
  if ((await prisma.vehicleCategory.count()) === 0) {
    const cats = [["SUVs & Crossovers", "Space, capability and comfort."], ["Sedans", "Refined everyday driving."], ["Trucks", "Built to work and tow."], ["Electric & Hybrid", "Efficient, modern, quiet."], ["Luxury", "Premium craftsmanship."], ["Sports & Coupes", "Performance with presence."]];
    await prisma.vehicleCategory.createMany({ data: cats.map(([name, description], position) => ({ name, slug: slugify(name), description, position })) });
  }

  // ── Testimonials / FAQs / Services ──
  if (!minimal && (await prisma.testimonial.count()) === 0)
    await prisma.testimonial.createMany({ data: [
      { author: "Priya N.", role: "Bought a 2022 Audi Q5", body: "No pressure, clear pricing, and the financing team got me a great rate. Easiest car purchase I've ever made.", position: 0 },
      { author: "Marcus T.", role: "Traded in a 2016 F-150", body: "They gave me a fair trade-in value and the paperwork was done in under an hour.", position: 1 },
      { author: "Sophie L.", role: "Bought a 2023 Tesla Model 3", body: "Knowledgeable staff who actually explained the EV ownership details. Highly recommend.", position: 2 },
    ] });
  if (!minimal && (await prisma.fAQ.count()) === 0)
    await prisma.fAQ.createMany({ data: [
      { question: "Do you offer financing for all credit situations?", answer: "We work with a network of lenders to find options for a wide range of credit profiles. Submit a no-obligation application and our team will follow up.", position: 0 },
      { question: "Can I trade in my current vehicle?", answer: "Yes. Submit our trade-in form with your vehicle details and photos and we'll provide a valuation, typically within one business day.", position: 1 },
      { question: "Are your vehicles inspected?", answer: "Every pre-owned vehicle undergoes a multi-point inspection before listing. History reports are available on request.", position: 2 },
      { question: "Can I book a test drive?", answer: "Absolutely — use the Book a Test Drive button on any vehicle page, or call us.", position: 3 },
    ] });
  if (!minimal && (await prisma.service.count()) === 0)
    await prisma.service.createMany({ data: [
      { title: "Vehicle Financing", description: "Flexible terms and competitive rates through trusted lending partners.", icon: "banknote", position: 0 },
      { title: "Trade-In Appraisals", description: "Fast, fair valuations for your current vehicle.", icon: "repeat", position: 1 },
      { title: "Certified Inspection", description: "Multi-point safety and mechanical inspection on every pre-owned vehicle.", icon: "shield-check", position: 2 },
      { title: "Extended Warranty", description: "Optional coverage plans for added peace of mind.", icon: "umbrella", position: 3 },
    ] });

  // ── Pages ──
  if ((await prisma.websitePage.count()) === 0) {
    const mk = (slug: string, title: string, sections: { type: string; content: object }[], desc?: string) =>
      prisma.websitePage.create({ data: { slug, title, isSystem: true, status: "PUBLISHED", publishedAt: new Date(), metaDescription: desc, sections: { create: sections.map((s, position) => ({ ...s, position })) } } });
    await mk("home", "Home", [
      { type: "hero", content: { heading: "Drive something exceptional", subheading: "Hand-picked new and pre-owned vehicles, transparent pricing and a team that's genuinely on your side.", primaryCta: { label: "Browse Inventory", url: "/inventory" }, secondaryCta: { label: "Get Pre-Approved", url: "/financing" }, showSearch: true } },
      { type: "featured-vehicles", content: { heading: "Featured Vehicles", subheading: "Our team's current favourites", limit: 6 } },
      { type: "categories", content: { heading: "Shop by Category", subheading: "Find the right type of vehicle" } },
      { type: "latest-arrivals", content: { heading: "Latest Arrivals", subheading: "Just landed on the lot", limit: 6 } },
      { type: "why-choose-us", content: { heading: "Why Choose Us", subheading: "The Aurelian difference", items: [{ title: "Inspected & Certified", description: "Every vehicle passes a rigorous multi-point inspection." }, { title: "Transparent Pricing", description: "No hidden fees. The price you see is the price you pay." }, { title: "Financing Made Easy", description: "Fast approvals with options for every situation." }, { title: "Award-Winning Service", description: "Rated 4.9★ by hundreds of happy customers." }] } },
      { type: "info-cta", content: { variant: "financing", heading: "Flexible Financing", body: "Get pre-approved in minutes with no impact on your credit score. Competitive rates and terms that fit your budget.", cta: { label: "Apply for Financing", url: "/financing" } } },
      { type: "info-cta", content: { variant: "trade-in", heading: "What's Your Car Worth?", body: "Request a fast, no-obligation trade-in valuation and put the value toward your next vehicle.", cta: { label: "Value My Trade", url: "/trade-in" } } },
      { type: "testimonials", content: { heading: "What Our Customers Say", subheading: "Real reviews from real drivers" } },
      { type: "services", content: { heading: "Our Services", subheading: "Everything you need under one roof" } },
      { type: "contact-info", content: { heading: "Visit Our Showroom", subheading: "We'd love to meet you" } },
    ], "Premium new and pre-owned vehicles with financing, trade-ins and test drives.");
    await mk("about", "About Us", [{ type: "rich-text", content: { heading: "About Aurelian Motors", html: "<p>Founded in 2005, Aurelian Motors has helped thousands of drivers find the right vehicle. We're a family-owned dealership focused on honest advice, quality inventory and long-term relationships.</p><p>Our team brings decades of combined automotive experience, and every vehicle on our lot is hand-selected and carefully inspected.</p>" } }]);
    await mk("services", "Our Services", [{ type: "services", content: { heading: "Our Services", subheading: "Sales, financing, trade-ins and more" } }]);
    await mk("faq", "FAQ", [{ type: "faq", content: { heading: "Frequently Asked Questions", subheading: "Quick answers to common questions" } }]);
    await mk("privacy-policy", "Privacy Policy", [{ type: "rich-text", content: { heading: "Privacy Policy", html: "<p>This is a sample privacy policy. Replace it with your own text in the admin portal under CMS → Pages. We collect contact details you submit through our forms solely to respond to your enquiry.</p>" } }]);
    await mk("terms", "Terms & Conditions", [{ type: "rich-text", content: { heading: "Terms & Conditions", html: "<p>This is a sample terms page. Replace it with your own legal text in the admin portal. Vehicle prices and availability are subject to change without notice.</p>" } }]);
    await prisma.websitePage.createMany({ data: [
      { slug: "contact", title: "Contact Us", isSystem: true, status: "PUBLISHED", publishedAt: new Date() },
      { slug: "financing", title: "Financing", isSystem: true, status: "PUBLISHED", publishedAt: new Date() },
      { slug: "trade-in", title: "Trade-In", isSystem: true, status: "PUBLISHED", publishedAt: new Date() },
    ] });
    // Contact / Financing / Trade-In pages: editable intro section + a built-in form rendered by the route
    for (const [slug, heading, html] of [["contact", "Contact Us", "<p>Questions about a vehicle, financing or a visit? Send us a message and we'll respond within one business day.</p>"], ["financing", "Vehicle Financing", "<p>Apply in minutes with no obligation. We work with multiple lenders to find a rate and term that suits you.</p>"], ["trade-in", "Trade-In Valuation", "<p>Tell us about your vehicle and we'll provide a fast, no-obligation valuation.</p>"]] as const) {
      const p = await prisma.websitePage.findUniqueOrThrow({ where: { slug } });
      await prisma.pageSection.create({ data: { pageId: p.id, type: "rich-text", position: 0, content: { heading, html } } });
    }
  }

  if (!minimal && (await prisma.blogPost.count()) === 0)
    await prisma.blogPost.create({ data: { slug: "how-to-choose-your-next-suv", title: "How to Choose Your Next SUV", excerpt: "Five questions to ask before you buy.", body: "<p>Choosing an SUV starts with how you'll use it. Consider passenger count, cargo needs, fuel type and drivetrain before you shop.</p><p>Visit us for a no-pressure test drive.</p>", status: "PUBLISHED", publishedAt: new Date() } });

  // ── Vehicles ──
  if (!minimal && (await prisma.vehicle.count()) === 0) {
    const cats = Object.fromEntries((await prisma.vehicleCategory.findMany()).map((c) => [c.slug, c.id]));
    type Seed = [string, string, number, string, number, number, string, string, string, string, string, string, string, string[], string, boolean, string?];
    const rows: Seed[] = [
      ["BMW", "X5", 2021, "xDrive40i", 62900, 48500, "SUV", "Gasoline", "Automatic", "AWD", "Black Sapphire", "Cognac", "suvs-crossovers", ["Panoramic Sunroof", "Heated Seats", "Apple CarPlay", "Adaptive Cruise Control", "360° Camera"], "USED", true],
      ["Audi", "Q5", 2022, "Premium Plus", 54900, 31200, "SUV", "Gasoline", "Automatic", "AWD", "Glacier White", "Black", "suvs-crossovers", ["Virtual Cockpit", "Leather Seats", "Blind Spot Monitor", "Heated Steering Wheel"], "USED", true],
      ["Tesla", "Model 3", 2023, "Long Range", 51900, 18400, "Sedan", "Electric", "Automatic", "AWD", "Pearl White", "White", "electric-hybrid", ["Autopilot", "15\" Touchscreen", "Glass Roof", "Supercharging Capable"], "USED", true],
      ["Ford", "F-150", 2022, "Lariat", 68900, 29800, "Truck", "Gasoline", "Automatic", "4WD", "Agate Black", "Brown", "trucks", ["Tow Package", "B&O Sound", "Heated/Cooled Seats", "Pro Trailer Backup"], "USED", false],
      ["Mercedes-Benz", "C300", 2020, "4MATIC", 38900, 52000, "Sedan", "Gasoline", "Automatic", "AWD", "Selenite Grey", "Black", "luxury", ["MBUX Infotainment", "Burmester Audio", "Ambient Lighting", "Parking Assist"], "USED", false],
      ["Toyota", "RAV4 Hybrid", 2023, "XLE", 43900, 12600, "SUV", "Hybrid", "Automatic", "AWD", "Lunar Rock", "Black", "electric-hybrid", ["Toyota Safety Sense", "Wireless Charging", "Power Liftgate"], "CERTIFIED", true],
      ["Honda", "Civic", 2024, "Sport", 31900, 0, "Sedan", "Gasoline", "CVT", "FWD", "Sonic Grey", "Black", "sedans", ["Honda Sensing", "Apple CarPlay", "Android Auto", "LED Headlights"], "NEW", false],
      ["Porsche", "911 Carrera", 2019, "S", 129900, 24800, "Coupe", "Gasoline", "PDK", "RWD", "Guards Red", "Black", "sports-coupes", ["Sport Chrono", "PASM", "Bose Audio", "Sport Exhaust"], "USED", true],
      ["Chevrolet", "Silverado 1500", 2021, "RST", 54900, 41000, "Truck", "Gasoline", "Automatic", "4WD", "Summit White", "Jet Black", "trucks", ["Z71 Off-Road", "Bed Liner", "Heated Seats"], "USED", false],
      ["Lexus", "RX 350", 2022, "F Sport", 58900, 27300, "SUV", "Gasoline", "Automatic", "AWD", "Nebula Grey", "Red", "luxury", ["Mark Levinson Audio", "Head-Up Display", "Sunroof"], "USED", false],
      ["Hyundai", "Ioniq 5", 2023, "Preferred", 47900, 15900, "SUV", "Electric", "Automatic", "AWD", "Gravity Gold", "Grey", "electric-hybrid", ["V2L Power Outlet", "Fast Charging", "Highway Driving Assist"], "USED", false],
      ["Mazda", "Mazda3", 2021, "GT", 27900, 38200, "Sedan", "Gasoline", "Automatic", "FWD", "Soul Red", "Black", "sedans", ["Bose Audio", "Heated Seats", "Head-Up Display"], "USED", false, "SOLD"],
    ];
    let n = 0;
    for (const [make, model, year, trim, price, mileage, body, fuel, trans, drive, ext, int, cat, feats, cond, featured, forced] of rows) {
      n++;
      const makeRec = await prisma.make.upsert({ where: { slug: slugify(make) }, update: {}, create: { name: make, slug: slugify(make) } });
      const modelRec = await prisma.model.upsert({ where: { makeId_slug: { makeId: makeRec.id, slug: slugify(model) } }, update: {}, create: { name: model, slug: slugify(model), makeId: makeRec.id } });
      const title = `${year} ${make} ${model} ${trim}`;
      const hue = (n * 47) % 360;
      await prisma.vehicle.create({
        data: {
          slug: slugify(`${title}-${1000 + n}`), stockNumber: `AM${1000 + n}`, vin: `SEEDVIN${String(n).padStart(10, "0")}`.slice(0, 17), title, makeId: makeRec.id, modelId: modelRec.id, categoryId: cats[cat] ?? null,
          year, trim, price, mileage, condition: cond as never, bodyType: body, fuelType: fuel, transmission: trans, drivetrain: drive, exteriorColor: ext, interiorColor: int,
          engine: fuel === "Electric" ? "Dual Motor Electric" : fuel === "Hybrid" ? "2.5L 4-cyl Hybrid" : "3.0L Turbo I6", doors: body === "Coupe" ? 2 : 4, seats: body === "Truck" ? 5 : 5,
          description: `This ${title} is presented in ${ext} over ${int} and has been through our full multi-point inspection. A fantastic example with a clean history and plenty of life left. Contact us to book a test drive today.`,
          history: "Clean history report available. No reported accidents. Serviced regularly.", status: (forced as never) ?? (n === 6 ? "PENDING" : "AVAILABLE"), soldAt: forced === "SOLD" ? new Date() : null,
          publishStatus: "PUBLISHED", isFeatured: featured, arrivedAt: new Date(Date.now() - (n <= 3 ? n * 2 : n * 9) * 864e5),
          features: { create: feats.map((name) => ({ name })) },
          images: { create: [0, 1, 2].map((i) => ({ url: placeholder(slugify(`${make}-${model}`), `${make} ${model}`, hue, i), publicId: null, alt: title, position: i, isPrimary: i === 0 })) },
        },
      });
    }
  }

  // ── Sample customers & leads ──
  if (!minimal && (await prisma.customer.count()) === 0) {
    const vehicles = await prisma.vehicle.findMany({ take: 4, orderBy: { createdAt: "asc" } });
    const people = [["Olivia", "Bennett", "olivia.bennett@example.com", "(647) 555-0110"], ["Daniel", "Okafor", "daniel.okafor@example.com", "(416) 555-0174"], ["Mei", "Tanaka", "mei.tanaka@example.com", "(905) 555-0129"], ["Lucas", "Fournier", "lucas.fournier@example.com", "(647) 555-0188"]];
    const cs = await Promise.all(people.map(([firstName, lastName, email, phone]) => prisma.customer.create({ data: { firstName, lastName, email, phone, city: "Toronto", province: "ON" } })));
    await prisma.lead.create({ data: { type: "VEHICLE", customerId: cs[0].id, vehicleId: vehicles[0]?.id, subject: "Enquiry about the X5", message: "Is this vehicle still available? Can I see the service records?" } });
    await prisma.lead.create({ data: { type: "TEST_DRIVE", status: "CONTACTED", customerId: cs[1].id, vehicleId: vehicles[1]?.id, subject: "Test drive", testDrive: { create: { customerId: cs[1].id, vehicleId: vehicles[1]?.id, preferredDate: new Date(Date.now() + 3 * 864e5), preferredTime: "Afternoon" } } } });
    await prisma.lead.create({ data: { type: "FINANCING", status: "QUALIFIED", customerId: cs[2].id, subject: "Financing application", financing: { create: { customerId: cs[2].id, employmentStatus: "Full-time", annualIncome: 92000, downPayment: 8000, termMonths: 72, creditRating: "Good" } } } });
    await prisma.lead.create({ data: { type: "TRADE_IN", customerId: cs[3].id, subject: "Trade-in: 2017 Honda Accord", tradeIn: { create: { customerId: cs[3].id, make: "Honda", model: "Accord", year: 2017, mileage: 96000, condition: "Good" } } } });
    await prisma.lead.create({ data: { type: "GENERAL", customerId: cs[0].id, subject: "Opening hours", message: "Are you open on holiday Mondays?" } });
  }
  console.log(`Seed complete${minimal ? " (minimal)" : ""}. Next: npm run admin:create`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
