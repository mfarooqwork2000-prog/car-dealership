import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, EmptyState, ErrorState, Field, Input, Select, Skeleton } from "@/components/ui";
import { Pagination } from "@/components/ui/DataTable";
import { VehicleCard } from "@/components/public/VehicleCard";
import { Seo } from "@/features/site";
import { api, qs } from "@/services/api";
import { cn, titleCase } from "@/services/format";
import type { Facets, Vehicle } from "@/services/types";

const FILTER_KEYS = ["q", "make", "model", "category", "yearMin", "yearMax", "priceMin", "priceMax", "mileageMax", "bodyType", "fuelType", "transmission", "drivetrain", "exteriorColor", "condition", "availableOnly"] as const;

export default function Inventory() {
  const [sp, setSp] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const view = sp.get("view") === "list" ? "list" : "grid";
  const page = Number(sp.get("page")) || 1;
  const params = Object.fromEntries(sp.entries());
  const facets = useQuery({ queryKey: ["facets"], queryFn: () => api.get<Facets>("/public/vehicles/facets") });
  const list = useQuery({ queryKey: ["inventory", params], queryFn: () => api.list<Vehicle>(`/public/vehicles${qs({ ...params, limit: 12, page })}`), placeholderData: (p) => p });

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    if (k === "make") n.delete("model");
    if (k !== "page") n.delete("page");
    setSp(n, { replace: true });
  };
  const clear = () => setSp(new URLSearchParams(view === "list" ? { view: "list" } : {}));
  const active = FILTER_KEYS.filter((k) => sp.get(k));
  const f = facets.data;
  const models = f?.models.filter((m) => !sp.get("make") || m.makeSlug === sp.get("make")) ?? [];
  const total = list.data?.meta?.total as number | undefined;
  const years = f?.range.yearMin && f.range.yearMax ? Array.from({ length: f.range.yearMax - f.range.yearMin + 1 }, (_, i) => f.range.yearMax! - i) : [];
  const opts = (a?: string[]) => a?.map((x) => <option key={x} value={x}>{x}</option>);

  const FilterPanel = (
    <div className="space-y-4">
      <Field label="Search"><Input type="search" placeholder="Make, model, stock #, VIN" defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)} onBlur={(e) => e.currentTarget.value !== (sp.get("q") ?? "") && set("q", e.currentTarget.value)} /></Field>
      <Field label="Make"><Select value={sp.get("make") ?? ""} onChange={(e) => set("make", e.target.value)}><option value="">All makes</option>{f?.makes.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</Select></Field>
      <Field label="Model"><Select value={sp.get("model") ?? ""} onChange={(e) => set("model", e.target.value)}><option value="">All models</option>{models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</Select></Field>
      <Field label="Category"><Select value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)}><option value="">All categories</option>{f?.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Year from"><Select value={sp.get("yearMin") ?? ""} onChange={(e) => set("yearMin", e.target.value)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field><Field label="Year to"><Select value={sp.get("yearMax") ?? ""} onChange={(e) => set("yearMax", e.target.value)}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select></Field></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Min price"><Input type="number" min={0} placeholder="0" defaultValue={sp.get("priceMin") ?? ""} onBlur={(e) => set("priceMin", e.target.value)} /></Field><Field label="Max price"><Input type="number" min={0} placeholder="Any" defaultValue={sp.get("priceMax") ?? ""} onBlur={(e) => set("priceMax", e.target.value)} /></Field></div>
      <Field label="Max mileage (km)"><Input type="number" min={0} placeholder="Any" defaultValue={sp.get("mileageMax") ?? ""} onBlur={(e) => set("mileageMax", e.target.value)} /></Field>
      <Field label="Body type"><Select value={sp.get("bodyType") ?? ""} onChange={(e) => set("bodyType", e.target.value)}><option value="">Any</option>{opts(f?.bodyTypes)}</Select></Field>
      <Field label="Fuel type"><Select value={sp.get("fuelType") ?? ""} onChange={(e) => set("fuelType", e.target.value)}><option value="">Any</option>{opts(f?.fuelTypes)}</Select></Field>
      <Field label="Transmission"><Select value={sp.get("transmission") ?? ""} onChange={(e) => set("transmission", e.target.value)}><option value="">Any</option>{opts(f?.transmissions)}</Select></Field>
      <Field label="Drivetrain"><Select value={sp.get("drivetrain") ?? ""} onChange={(e) => set("drivetrain", e.target.value)}><option value="">Any</option>{opts(f?.drivetrains)}</Select></Field>
      <Field label="Exterior colour"><Select value={sp.get("exteriorColor") ?? ""} onChange={(e) => set("exteriorColor", e.target.value)}><option value="">Any</option>{opts(f?.colors)}</Select></Field>
      <Field label="Condition"><Select value={sp.get("condition") ?? ""} onChange={(e) => set("condition", e.target.value)}><option value="">Any</option>{["NEW", "USED", "CERTIFIED"].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sp.get("availableOnly") === "true"} onChange={(e) => set("availableOnly", e.target.checked ? "true" : "")} />Available vehicles only (hide sold)</label>
      {active.length > 0 && <Button variant="outline" className="w-full" onClick={clear}><X className="h-4 w-4" />Clear all filters</Button>}
    </div>
  );

  return (
    <div className="container-x py-10">
      <Seo title="Vehicle Inventory" description="Browse our current inventory of new and pre-owned vehicles." />
      <header className="mb-8"><p className="eyebrow">Inventory</p><h1 className="text-4xl">Find your next vehicle</h1></header>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className={cn("h-fit rounded-lg border border-ink/10 bg-white p-5 lg:sticky lg:top-24", showFilters ? "block" : "hidden lg:block")} aria-label="Filters">{FilterPanel}</aside>
        <section aria-live="polite">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><Button variant="outline" className="lg:hidden" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal className="h-4 w-4" />Filters{active.length > 0 && ` (${active.length})`}</Button><p className="text-sm text-ink/70" data-testid="result-count">{total != null ? `${total} vehicle${total === 1 ? "" : "s"} found` : "Loading…"}</p></div>
            <div className="flex items-center gap-2">
              <Select aria-label="Sort" className="w-44" value={sp.get("sort") ?? "newest"} onChange={(e) => set("sort", e.target.value)}><option value="newest">Newest arrivals</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="mileage-asc">Lowest mileage</option><option value="year-desc">Year: newest</option></Select>
              <Button variant={view === "grid" ? "primary" : "outline"} size="icon" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => set("view", "")}><LayoutGrid className="h-4 w-4" /></Button>
              <Button variant={view === "list" ? "primary" : "outline"} size="icon" aria-label="List view" aria-pressed={view === "list"} onClick={() => set("view", "list")}><List className="h-4 w-4" /></Button>
            </div>
          </div>
          {list.error ? <ErrorState error={list.error} retry={() => list.refetch()} /> : list.isLoading ? <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-80" />)}</div>
            : !list.data?.data.length ? <EmptyState title="No vehicles match your filters" description="Try removing a filter or widening your price range." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
            : <div className={cn("grid gap-6", view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>{list.data.data.map((v) => <VehicleCard key={v.id} v={v} layout={view} />)}</div>}
          <div className="mt-8 rounded-lg border border-ink/10 bg-white"><Pagination page={page} totalPages={(list.data?.meta?.totalPages as number) ?? 1} onPage={(p) => set("page", String(p))} /></div>
        </section>
      </div>
    </div>
  );
}
