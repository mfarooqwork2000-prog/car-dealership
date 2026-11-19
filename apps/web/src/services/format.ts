import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

/** Currency/units come from settings (default CAD / metric). */
export const money = (n: number | null | undefined, currency = "CAD", locale = "en-CA") =>
  n == null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export const distance = (km: number | null | undefined, units = "metric", locale = "en-CA") => {
  if (km == null) return "—";
  return units === "imperial" ? `${new Intl.NumberFormat(locale).format(Math.round(km * 0.621371))} mi` : `${new Intl.NumberFormat(locale).format(km)} km`;
};

export const dateShort = (d: string | Date) => new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
export const dateTime = (d: string | Date) => new Date(d).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** "#c8a45c" -> "200 164 92" for Tailwind rgb(var(--x) / alpha) tokens */
export const hexToRgbTriplet = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : "0 0 0";
};

/** Monthly payment estimate (standard amortisation) */
export const monthlyPayment = (principal: number, aprPct: number, months: number) => {
  const r = aprPct / 100 / 12;
  return r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
};
