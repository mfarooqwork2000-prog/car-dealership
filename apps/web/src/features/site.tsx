import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { api } from "@/services/api";
import { hexToRgbTriplet } from "@/services/format";
import type { SiteData } from "@/services/types";
import { PageSpinner, ErrorState } from "@/components/ui";

const SiteCtx = createContext<SiteData>(null as never);
export const useSite = () => useContext(SiteCtx);
export const useSettings = () => {
  const { settings } = useSite();
  const general = settings.general ?? {};
  return { general, contact: settings.contact ?? {}, hours: settings.hours ?? {}, social: settings.social ?? {}, seo: settings.seo ?? {}, footer: settings.footer ?? {}, currency: general.currency ?? "CAD", units: general.units ?? "metric", locale: general.locale ?? "en-CA", name: general.dealershipName ?? "Dealership" };
};

/** Loads site config (theme, settings, nav) and applies the centralized theme as CSS variables. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ["site"], queryFn: () => api.get<SiteData>("/public/site"), staleTime: 60_000 });
  const t = q.data?.theme;
  useEffect(() => {
    if (!t) return;
    const s = document.documentElement.style;
    s.setProperty("--primary", hexToRgbTriplet(t.primaryColor));
    s.setProperty("--secondary", hexToRgbTriplet(t.secondaryColor));
    s.setProperty("--accent", hexToRgbTriplet(t.accentColor));
    s.setProperty("--font-heading", `"${t.headingFont}"`);
    s.setProperty("--font-body", `"${t.bodyFont}"`);
    s.setProperty("--btn-radius", t.buttonRadius);
    s.setProperty("--layout-width", t.layoutWidth);
  }, [t]);
  if (q.isLoading) return <PageSpinner />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Could not load site")} retry={() => q.refetch()} />;
  const fonts = [...new Set([q.data.theme.headingFont, q.data.theme.bodyFont])].map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`).join("&");
  return (
    <SiteCtx.Provider value={q.data}>
      <Helmet>
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${fonts}&display=swap`} />
        {q.data.theme.faviconUrl && <link rel="icon" href={q.data.theme.faviconUrl} />}
      </Helmet>
      {children}
    </SiteCtx.Provider>
  );
}

/** Per-page SEO: title, description, Open Graph, canonical, optional JSON-LD. */
export function Seo({ title, description, image, path, jsonLd, noindex }: { title?: string; description?: string | null; image?: string | null; path?: string; jsonLd?: object; noindex?: boolean }) {
  const { seo, name } = useSettings();
  const suffix = seo.titleSuffix ?? name;
  const full = title ? `${title} | ${suffix}` : suffix;
  const desc = description || seo.defaultDescription;
  const url = `${window.location.origin}${path ?? window.location.pathname}`;
  return (
    <Helmet>
      <title>{full}</title>
      {desc && <meta name="description" content={desc} />}
      <link rel="canonical" href={url} />
      <meta property="og:title" content={full} />
      {desc && <meta property="og:description" content={desc} />}
      <meta property="og:type" content={jsonLd ? "product" : "website"} />
      <meta property="og:url" content={url} />
      {image && <meta property="og:image" content={image.startsWith("http") ? image : `${window.location.origin}${image}`} />}
      <meta name="twitter:card" content="summary_large_image" />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
