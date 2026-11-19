/* eslint-disable @typescript-eslint/no-explicit-any */
export interface VehicleImage { id: string; url: string; alt?: string | null; position: number; isPrimary: boolean }
export interface Vehicle {
  id: string; slug: string; stockNumber: string; vin?: string | null; title: string; makeName: string; modelName: string; year: number; trim?: string | null;
  price: number; salePrice?: number | null; mileage: number; condition: "NEW" | "USED" | "CERTIFIED"; bodyType?: string | null; fuelType?: string | null;
  transmission?: string | null; drivetrain?: string | null; engine?: string | null; cylinders?: number | null; horsepower?: number | null;
  exteriorColor?: string | null; interiorColor?: string | null; doors?: number | null; seats?: number | null; description?: string | null; history?: string | null;
  status: "AVAILABLE" | "PENDING" | "SOLD" | "ARCHIVED"; publishStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED"; isFeatured: boolean; isNewArrival: boolean;
  primaryImage: string | null; images: VehicleImage[]; features: { id: string; name: string; category?: string | null }[]; categoryId?: string | null; similar?: Vehicle[];
  make?: { name: string; slug: string }; model?: { name: string; slug: string }; updatedAt: string;
}
export interface SectionRow { id: string; type: string; position: number; isVisible: boolean; content: any }
export interface PageData { id: string; slug: string; title: string; metaTitle?: string | null; metaDescription?: string | null; ogImageUrl?: string | null; status: string; isSystem: boolean; sections: SectionRow[] }
export interface Theme { primaryColor: string; secondaryColor: string; accentColor: string; headingFont: string; bodyFont: string; logoUrl?: string | null; faviconUrl?: string | null; buttonRadius: string; layoutWidth: string }
export interface NavItem { id: string; label: string; url: string; openInNewTab: boolean; children: NavItem[]; position: number; isVisible: boolean }
export interface SiteData {
  theme: Theme; settings: Record<string, any>; navigation: { header: NavItem[]; footer: NavItem[] };
  banners: { id: string; title: string; body?: string; ctaLabel?: string; ctaUrl?: string; imageUrl?: string; placement: string }[];
  categories: { id: string; name: string; slug: string; description?: string; imageUrl?: string }[]; mapsKey: string | null;
}
export interface Facets {
  makes: { name: string; slug: string }[]; models: { name: string; slug: string; makeSlug: string }[]; categories: { name: string; slug: string }[];
  bodyTypes: string[]; fuelTypes: string[]; transmissions: string[]; drivetrains: string[]; colors: string[];
  range: { priceMin: number; priceMax: number; yearMin: number | null; yearMax: number | null; mileageMax: number | null };
}
export interface Lead {
  id: string; type: string; status: string; subject?: string; message?: string; createdAt: string; customer: { id: string; firstName: string; lastName: string; email: string; phone?: string };
  vehicle?: { id: string; title: string; slug: string; stockNumber: string } | null; assignee?: { id: string; firstName: string; lastName: string } | null;
  notes?: any[]; followUps?: any[]; testDrive?: any; financing?: any; tradeIn?: any; history?: any[];
}
export interface AuthUser { id: string; email: string; firstName: string; lastName: string; role: string; roleName: string; permissions: string[] }
