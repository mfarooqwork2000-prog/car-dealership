import { z } from "zod";

// ───── RBAC ─────
export const ROLE_KEYS = ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "SALES_REP", "CONTENT_MANAGER"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = {
  "dashboard:view": "View dashboard",
  "vehicles:read": "View inventory (admin)",
  "vehicles:write": "Create/edit vehicles",
  "vehicles:delete": "Delete vehicles",
  "leads:read:all": "View all leads",
  "leads:read:assigned": "View assigned leads",
  "leads:write": "Update leads, notes, follow-ups",
  "leads:assign": "Assign leads",
  "leads:export": "Export leads",
  "customers:read": "View customers",
  "customers:write": "Edit customers",
  "cms:read": "View CMS",
  "cms:write": "Manage CMS content",
  "media:write": "Upload media",
  "settings:read": "View settings",
  "settings:write": "Change settings & theme",
  "users:read": "View users",
  "users:write": "Manage users",
  "audit:read": "View audit log",
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL, // same permissions as Super Admin, but cannot create/modify Super Admin accounts (enforced in users service)
  SALES_MANAGER: ["dashboard:view", "vehicles:read", "vehicles:write", "vehicles:delete", "leads:read:all", "leads:write", "leads:assign", "leads:export", "customers:read", "customers:write", "media:write", "users:read"],
  SALES_REP: ["dashboard:view", "vehicles:read", "leads:read:assigned", "leads:write", "customers:read"],
  CONTENT_MANAGER: ["dashboard:view", "cms:read", "cms:write", "media:write", "settings:read", "vehicles:read"],
};
export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrator",
  SALES_MANAGER: "Sales Manager",
  SALES_REP: "Sales Representative",
  CONTENT_MANAGER: "Content Manager",
};

// ───── Common enums ─────
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "FOLLOW_UP", "CONVERTED", "LOST"] as const;
export const LEAD_TYPES = ["GENERAL", "VEHICLE", "TEST_DRIVE", "FINANCING", "TRADE_IN"] as const;
export const VEHICLE_STATUSES = ["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"] as const;
export const VEHICLE_CONDITIONS = ["NEW", "USED", "CERTIFIED"] as const;
export const PUBLISH_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

// Blank form inputs arrive as "" — treat as "not provided" instead of coercing to 0.
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);
const optNum = (s: z.ZodNumber) => z.preprocess(blank, z.coerce.number().pipe(s).optional());
const nullNum = (s: z.ZodNumber) => z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().pipe(s).nullable());
// ───── Public lead forms ─────
const phone = z.string().trim().max(30).optional().or(z.literal(""));
const person = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  phone,
};
export const generalEnquirySchema = z.object({ ...person, subject: z.string().trim().max(200).optional(), message: z.string().trim().min(5).max(4000) });
export const vehicleEnquirySchema = generalEnquirySchema.extend({ vehicleId: z.string().min(1) });
export const testDriveSchema = z.object({
  ...person,
  vehicleId: z.string().min(1),
  preferredDate: z.coerce.date(),
  preferredTime: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
});
export const financingSchema = z.object({
  ...person,
  vehicleId: z.string().optional(),
  employmentStatus: z.string().trim().max(80).optional(),
  employer: z.string().trim().max(120).optional(),
  annualIncome: optNum(z.number().min(0).max(10_000_000)),
  monthlyHousing: optNum(z.number().min(0).max(1_000_000)),
  downPayment: optNum(z.number().min(0).max(10_000_000)),
  termMonths: optNum(z.number().int().min(6).max(120)),
  creditRating: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
});
export const tradeInSchema = z.object({
  ...person,
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1),
  mileage: z.coerce.number().int().min(0).max(2_000_000),
  vin: z.string().trim().max(17).optional(),
  condition: z.string().trim().max(40).optional(),
  details: z.string().trim().max(3000).optional(),
});

// ───── Vehicle admin ─────
export const vehicleInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  stockNumber: z.string().trim().min(1).max(40),
  vin: z.string().trim().max(17).optional().nullable().or(z.literal("").transform(() => null)),
  makeName: z.string().trim().min(1).max(80),
  modelName: z.string().trim().min(1).max(80),
  categoryId: z.string().optional().nullable(),
  year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 2),
  trim: z.string().trim().max(80).optional().nullable(),
  price: z.coerce.number().min(0).max(100_000_000),
  salePrice: nullNum(z.number().min(0).max(100_000_000)),
  mileage: z.coerce.number().int().min(0).max(2_000_000).default(0),
  condition: z.enum(VEHICLE_CONDITIONS).default("USED"),
  bodyType: z.string().trim().max(40).optional().nullable(),
  fuelType: z.string().trim().max(40).optional().nullable(),
  transmission: z.string().trim().max(40).optional().nullable(),
  drivetrain: z.string().trim().max(40).optional().nullable(),
  engine: z.string().trim().max(120).optional().nullable(),
  cylinders: nullNum(z.number().int().min(0).max(16)),
  horsepower: nullNum(z.number().int().min(0).max(3000)),
  exteriorColor: z.string().trim().max(40).optional().nullable(),
  interiorColor: z.string().trim().max(40).optional().nullable(),
  doors: nullNum(z.number().int().min(1).max(8)),
  seats: nullNum(z.number().int().min(1).max(15)),
  description: z.string().max(10000).optional().nullable(),
  history: z.string().max(5000).optional().nullable(),
  status: z.enum(VEHICLE_STATUSES).default("AVAILABLE"),
  publishStatus: z.enum(PUBLISH_STATUSES).default("DRAFT"),
  isFeatured: z.boolean().default(false),
  features: z.array(z.object({ name: z.string().trim().min(1).max(120), category: z.string().trim().max(60).optional().nullable() })).default([]),
});
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

// ───── Auth ─────
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
export const passwordSchema = z.string().min(10, "At least 10 characters").max(200).regex(/[a-z]/, "Needs a lowercase letter").regex(/[A-Z]/, "Needs an uppercase letter").regex(/\d/, "Needs a number");
export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password: passwordSchema });

// ───── CMS section registry (content schemas, shared by API + web) ─────
const link = z.object({ label: z.string().max(80), url: z.string().max(300) });
export const SECTION_SCHEMAS = {
  hero: z.object({ heading: z.string(), subheading: z.string().optional(), imageUrl: z.string().optional(), primaryCta: link.optional(), secondaryCta: link.optional(), showSearch: z.boolean().default(true) }),
  "featured-vehicles": z.object({ heading: z.string(), subheading: z.string().optional(), limit: z.coerce.number().int().min(1).max(12).default(6) }),
  "latest-arrivals": z.object({ heading: z.string(), subheading: z.string().optional(), limit: z.coerce.number().int().min(1).max(12).default(6) }),
  categories: z.object({ heading: z.string(), subheading: z.string().optional() }),
  "why-choose-us": z.object({ heading: z.string(), subheading: z.string().optional(), items: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string().optional() })).default([]) }),
  "info-cta": z.object({ heading: z.string(), body: z.string().optional(), imageUrl: z.string().optional(), cta: link.optional(), variant: z.enum(["financing", "trade-in", "generic"]).default("generic") }),
  testimonials: z.object({ heading: z.string(), subheading: z.string().optional() }),
  services: z.object({ heading: z.string(), subheading: z.string().optional() }),
  faq: z.object({ heading: z.string(), subheading: z.string().optional() }),
  "contact-info": z.object({ heading: z.string(), subheading: z.string().optional() }),
  "rich-text": z.object({ heading: z.string().optional(), html: z.string() }),
} as const;
export type SectionType = keyof typeof SECTION_SCHEMAS;
export const SECTION_TYPES = Object.keys(SECTION_SCHEMAS) as SectionType[];
export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero", "featured-vehicles": "Featured Vehicles", "latest-arrivals": "Latest Arrivals", categories: "Vehicle Categories",
  "why-choose-us": "Why Choose Us", "info-cta": "Info / Call to Action", testimonials: "Testimonials", services: "Services",
  faq: "FAQ", "contact-info": "Contact Info", "rich-text": "Rich Text",
};

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ───── API envelope ─────
export type ApiResponse<T> = { success: true; data: T; meta?: Record<string, unknown> } | { success: false; error: { code: string; message: string; details?: unknown } };
