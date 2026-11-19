import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";
import { Button, PageSpinner } from "@/components/ui";
import { ContactForm, FinancingForm, TradeInForm } from "@/components/public/forms";
import { SectionList } from "@/components/public/sections";
import { Seo } from "@/features/site";
import { api, ApiError } from "@/services/api";
import type { PageData } from "@/services/types";
import { Link } from "react-router-dom";

/** Pages whose CMS sections are followed by a built-in, working form. */
const pageForms: Record<string, { title: string; node: JSX.Element }> = {
  contact: { title: "Send us a message", node: <ContactForm /> },
  financing: { title: "Financing application", node: <FinancingForm /> },
  "trade-in": { title: "Request a valuation", node: <TradeInForm /> },
};

export function NotFound() {
  return <div className="container-x py-24 text-center"><Seo title="Page not found" noindex /><p className="eyebrow">404</p><h1 className="mt-2 text-4xl">Page not found</h1><p className="mt-3 text-ink/60">The page you're looking for doesn't exist or has moved.</p><Button asChild className="mt-6"><Link to="/">Go home</Link></Button></div>;
}

export default function CmsPage({ slug: fixed }: { slug?: string }) {
  const params = useParams();
  const loc = useLocation();
  const slug = fixed ?? params.slug ?? "home";
  const q = useQuery({ queryKey: ["page", slug], queryFn: () => api.get<PageData>(`/public/pages/${slug}`), retry: false });
  if (q.isLoading) return <PageSpinner />;
  if (q.error) return (q.error instanceof ApiError && q.error.status === 404) ? <NotFound /> : <div className="p-10 text-center text-red-600">Failed to load page.</div>;
  const p = q.data!;
  const form = pageForms[p.slug];
  return (
    <>
      <Seo title={slug === "home" ? undefined : p.metaTitle || p.title} description={p.metaDescription} image={p.ogImageUrl} path={slug === "home" ? "/" : loc.pathname} />
      <SectionList sections={p.sections} />
      {form && <section className="pb-20"><div className="container-x max-w-3xl"><div className="rounded-lg border border-ink/10 bg-white p-6 shadow-sm md:p-8"><h2 className="mb-5 text-2xl">{form.title}</h2>{form.node}</div></div></section>}
    </>
  );
}
