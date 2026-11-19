/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { Banknote, ChevronDown, Mail, MapPin, Phone, Repeat, ShieldCheck, Star, Umbrella, Award, Clock, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SECTION_SCHEMAS, type SectionType } from "@cd/shared";
import { Button, Select, Skeleton } from "@/components/ui";
import { useSettings, useSite } from "@/features/site";
import { api, qs } from "@/services/api";
import type { Facets, SectionRow, Vehicle } from "@/services/types";
import { VehicleCard } from "./VehicleCard";

const icons: Record<string, LucideIcon> = { banknote: Banknote, repeat: Repeat, "shield-check": ShieldCheck, umbrella: Umbrella, star: Star, award: Award, clock: Clock };
const Icon = ({ name, className }: { name?: string; className?: string }) => { const C = icons[name ?? ""] ?? ShieldCheck; return <C className={className} />; };

function SectionShell({ heading, subheading, children, tone = "light", id }: { heading?: string; subheading?: string; children: ReactNode; tone?: "light" | "white" | "dark"; id?: string }) {
  return (
    <section id={id} className={tone === "dark" ? "bg-primary py-16 text-white md:py-24" : tone === "white" ? "bg-white py-16 md:py-24" : "py-16 md:py-24"}>
      <div className="container-x">
        {(heading || subheading) && (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            {subheading && <p className="eyebrow mb-2">{subheading}</p>}
            {heading && <h2 className="text-3xl md:text-4xl">{heading}</h2>}
            <div className="mx-auto mt-4 h-px w-16 bg-accent" />
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

// ───── Individual sections ─────
function Hero({ c }: { c: any }) {
  const nav = useNavigate();
  const { data: f } = useQuery({ queryKey: ["facets"], queryFn: () => api.get<Facets>("/public/vehicles/facets"), enabled: c.showSearch });
  const [s, setS] = useState({ make: "", bodyType: "", priceMax: "" });
  return (
    <section className="relative isolate overflow-hidden bg-primary text-white" style={c.imageUrl ? { backgroundImage: `linear-gradient(rgb(var(--primary)/.72), rgb(var(--primary)/.88)), url(${c.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { backgroundImage: "radial-gradient(1200px 500px at 70% -10%, rgb(var(--accent)/.25), transparent), linear-gradient(135deg, rgb(var(--primary)), rgb(var(--secondary)))" }}>
      <div className="container-x py-20 md:py-32">
        <div className="max-w-3xl animate-fade-up">
          <p className="eyebrow mb-4">Premium Automotive</p>
          <h1 className="text-4xl leading-tight md:text-6xl">{c.heading}</h1>
          {c.subheading && <p className="mt-5 max-w-xl text-lg text-white/75">{c.subheading}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            {c.primaryCta?.label && <Button asChild variant="accent" size="lg"><Link to={c.primaryCta.url}>{c.primaryCta.label}</Link></Button>}
            {c.secondaryCta?.label && <Button asChild variant="outline-light" size="lg"><Link to={c.secondaryCta.url}>{c.secondaryCta.label}</Link></Button>}
          </div>
        </div>
        {c.showSearch && (
          <form onSubmit={(e) => { e.preventDefault(); nav(`/inventory${qs(s)}`); }} className="mt-12 grid gap-3 rounded-lg bg-white/95 p-4 text-ink shadow-2xl backdrop-blur sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Search vehicles">
            <Select aria-label="Make" value={s.make} onChange={(e) => setS({ ...s, make: e.target.value })}><option value="">Any make</option>{f?.makes.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</Select>
            <Select aria-label="Body type" value={s.bodyType} onChange={(e) => setS({ ...s, bodyType: e.target.value })}><option value="">Any body type</option>{f?.bodyTypes.map((b) => <option key={b}>{b}</option>)}</Select>
            <Select aria-label="Max price" value={s.priceMax} onChange={(e) => setS({ ...s, priceMax: e.target.value })}><option value="">Any price</option>{[30000, 50000, 75000, 100000].map((p) => <option key={p} value={p}>Under ${p.toLocaleString()}</option>)}</Select>
            <Button type="submit" variant="accent" className="h-10">Search Inventory</Button>
          </form>
        )}
      </div>
    </section>
  );
}

function VehicleGrid({ c, params }: { c: any; params: Record<string, unknown> }) {
  const { data, isLoading } = useQuery({ queryKey: ["vehicles", params], queryFn: () => api.list<Vehicle>(`/public/vehicles${qs(params)}`) });
  return (
    <SectionShell heading={c.heading} subheading={c.subheading}>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80" />) : data?.data.map((v) => <VehicleCard key={v.id} v={v} />)}
      </div>
      {!isLoading && !data?.data.length && <p className="text-center text-ink/60">No vehicles to show right now.</p>}
      <div className="mt-10 text-center"><Button asChild variant="outline"><Link to="/inventory">View all inventory</Link></Button></div>
    </SectionShell>
  );
}

function Categories({ c }: { c: any }) {
  const { categories } = useSite();
  return (
    <SectionShell heading={c.heading} subheading={c.subheading} tone="white">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <Link key={cat.id} to={`/inventory?category=${cat.slug}`} className="group relative overflow-hidden rounded-lg border border-ink/10 bg-gradient-to-br from-primary to-secondary p-6 text-white transition-all hover:-translate-y-0.5 hover:shadow-xl">
            <h3 className="text-xl">{cat.name}</h3>
            {cat.description && <p className="mt-1 text-sm text-white/65">{cat.description}</p>}
            <span className="mt-6 inline-block text-sm font-medium text-accent transition-transform group-hover:translate-x-1">Browse →</span>
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}

function WhyChooseUs({ c }: { c: any }) {
  const defaults = ["shield-check", "banknote", "award", "star"];
  return (
    <SectionShell heading={c.heading} subheading={c.subheading}>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {(c.items ?? []).map((it: any, i: number) => (
          <div key={i} className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent"><Icon name={it.icon ?? defaults[i % 4]} className="h-7 w-7" /></div>
            <h3 className="text-lg">{it.title}</h3>
            <p className="mt-2 text-sm text-ink/65">{it.description}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function InfoCta({ c }: { c: any }) {
  return (
    <section className="py-6">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-secondary px-8 py-14 text-white md:px-14" style={c.imageUrl ? { backgroundImage: `linear-gradient(rgb(var(--primary)/.85), rgb(var(--primary)/.85)), url(${c.imageUrl})`, backgroundSize: "cover" } : undefined}>
          <div className="max-w-xl"><h2 className="text-3xl md:text-4xl">{c.heading}</h2>{c.body && <p className="mt-4 text-white/75">{c.body}</p>}{c.cta?.label && <Button asChild variant="accent" size="lg" className="mt-7"><Link to={c.cta.url}>{c.cta.label}</Link></Button>}</div>
        </div>
      </div>
    </section>
  );
}

function Testimonials({ c }: { c: any }) {
  const { data } = useQuery({ queryKey: ["content", "testimonials"], queryFn: () => api.get<any[]>("/public/content/testimonials") });
  if (data && !data.length) return null;
  return (
    <SectionShell heading={c.heading} subheading={c.subheading} tone="dark">
      <div className="grid gap-6 md:grid-cols-3">
        {data?.map((t) => (
          <figure key={t.id} className="rounded-lg border border-white/10 bg-white/5 p-6">
            <div className="mb-3 flex gap-0.5 text-accent" aria-label={`${t.rating} out of 5 stars`}>{Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
            <blockquote className="text-white/85">“{t.body}”</blockquote>
            <figcaption className="mt-4 text-sm"><span className="font-semibold">{t.author}</span>{t.role && <span className="text-white/50"> · {t.role}</span>}</figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

function Services({ c }: { c: any }) {
  const { data } = useQuery({ queryKey: ["content", "services"], queryFn: () => api.get<any[]>("/public/content/services") });
  return (
    <SectionShell heading={c.heading} subheading={c.subheading} tone="white">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {data?.map((s) => (
          <div key={s.id} className="rounded-lg border border-ink/10 p-6 transition-shadow hover:shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded bg-primary text-accent"><Icon name={s.icon} className="h-6 w-6" /></div>
            <h3 className="text-lg">{s.title}</h3><p className="mt-2 text-sm text-ink/65">{s.description}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function Faq({ c }: { c: any }) {
  const { data } = useQuery({ queryKey: ["content", "faqs"], queryFn: () => api.get<any[]>("/public/content/faqs") });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <SectionShell heading={c.heading} subheading={c.subheading}>
      <div className="mx-auto max-w-3xl divide-y divide-ink/10 rounded-lg border border-ink/10 bg-white">
        {data?.map((f) => (
          <div key={f.id}>
            <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>{f.question}<ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open === f.id ? "rotate-180" : ""}`} /></button>
            {open === f.id && <div className="px-5 pb-5 text-ink/70">{f.answer}</div>}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

export function ContactInfo({ c }: { c: any }) {
  const { contact, hours } = useSettings();
  const { mapsKey } = useSite();
  const q = encodeURIComponent(contact.mapsQuery || `${contact.address ?? ""} ${contact.city ?? ""}`);
  return (
    <SectionShell heading={c.heading} subheading={c.subheading} tone="white">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="flex gap-3"><MapPin className="mt-1 h-5 w-5 shrink-0 text-accent" /><p>{contact.address}<br />{contact.city}, {contact.province} {contact.postalCode}</p></div>
          {contact.phone && <div className="flex gap-3"><Phone className="mt-1 h-5 w-5 shrink-0 text-accent" /><a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a></div>}
          {contact.email && <div className="flex gap-3"><Mail className="mt-1 h-5 w-5 shrink-0 text-accent" /><a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a></div>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">{Object.entries(hours).map(([d, h]) => <div key={d} className="contents"><dt className="font-medium capitalize">{d}</dt><dd className="text-ink/65">{String(h)}</dd></div>)}</dl>
        </div>
        <div className="min-h-[280px] overflow-hidden rounded-lg border border-ink/10 bg-ink/5">
          <iframe title="Dealership location" loading="lazy" className="h-full min-h-[280px] w-full" referrerPolicy="no-referrer-when-downgrade" src={mapsKey ? `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${q}` : `https://www.google.com/maps?q=${q}&output=embed`} />
        </div>
      </div>
    </SectionShell>
  );
}

/** Rich text is authored by trusted CMS users; still, strip script-ish content defensively. */
function sanitize(html: string) {
  return html.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
}
export const RichHtml = ({ html }: { html: string }) => <div className="prose-cms" dangerouslySetInnerHTML={{ __html: sanitize(html) }} />;
function RichText({ c }: { c: any }) {
  return <section className="py-12 md:py-16"><div className="container-x max-w-3xl">{c.heading && <h1 className="mb-6 text-4xl">{c.heading}</h1>}<RichHtml html={c.html} /></div></section>;
}

/** Section registry: adding a section type = schema in @cd/shared + a renderer here + editor fields in admin registry. */
const registry: Record<SectionType, (p: { c: any }) => ReactNode> = {
  hero: Hero,
  "featured-vehicles": ({ c }) => <VehicleGrid c={c} params={{ featured: "true", limit: c.limit, availableOnly: "true" }} />,
  "latest-arrivals": ({ c }) => <VehicleGrid c={c} params={{ sort: "newest", limit: c.limit, availableOnly: "true" }} />,
  categories: Categories, "why-choose-us": WhyChooseUs, "info-cta": InfoCta, testimonials: Testimonials, services: Services, faq: Faq, "contact-info": ContactInfo, "rich-text": RichText,
};

export function SectionRenderer({ section }: { section: SectionRow }) {
  const schema = SECTION_SCHEMAS[section.type as SectionType];
  const Comp = registry[section.type as SectionType];
  if (!schema || !Comp) return null;
  const parsed = schema.safeParse(section.content);
  if (!parsed.success) return null; // never crash a page on bad content
  return <Comp c={parsed.data} />;
}
export const SectionList = ({ sections }: { sections: SectionRow[] }) => <>{sections.filter((s) => s.isVisible).map((s) => <SectionRenderer key={s.id} section={s} />)}</>;
