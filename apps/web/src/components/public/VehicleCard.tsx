import { Fuel, Gauge, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";
import { useSettings } from "@/features/site";
import { cn, distance, money } from "@/services/format";
import type { Vehicle } from "@/services/types";

export function VehicleBadges({ v }: { v: Vehicle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {v.status === "SOLD" && <Badge tone="red">Sold</Badge>}
      {v.status === "PENDING" && <Badge tone="amber">Sale Pending</Badge>}
      {v.isFeatured && v.status !== "SOLD" && <Badge tone="accent">Featured</Badge>}
      {v.isNewArrival && v.status === "AVAILABLE" && <Badge tone="dark">New Arrival</Badge>}
      {v.condition === "CERTIFIED" && <Badge tone="blue">Certified</Badge>}
      {v.condition === "NEW" && <Badge tone="green">New</Badge>}
    </div>
  );
}

export function VehiclePrice({ v, className }: { v: Vehicle; className?: string }) {
  const { currency, locale } = useSettings();
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className="font-heading text-xl font-semibold">{money(v.salePrice ?? v.price, currency, locale)}</span>
      {v.salePrice != null && v.salePrice < v.price && <span className="text-sm text-ink/45 line-through">{money(v.price, currency, locale)}</span>}
    </div>
  );
}

export function VehicleCard({ v, layout = "grid" }: { v: Vehicle; layout?: "grid" | "list" }) {
  const { units, locale } = useSettings();
  const sold = v.status === "SOLD";
  return (
    <Link to={`/inventory/${v.slug}`} className={cn("group overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl", layout === "list" ? "flex flex-col sm:flex-row" : "flex flex-col")} aria-label={v.title}>
      <div className={cn("relative overflow-hidden bg-ink/10", layout === "list" ? "aspect-[4/3] sm:w-72 sm:shrink-0" : "aspect-[4/3]")}>
        {v.primaryImage ? <img src={v.primaryImage} alt={v.title} loading="lazy" decoding="async" className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105", sold && "grayscale")} /> : <div className="flex h-full items-center justify-center text-sm text-ink/40">No photo</div>}
        <div className="absolute left-3 top-3"><VehicleBadges v={v} /></div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-heading text-lg font-semibold leading-snug">{v.title}</h3>
          <p className="text-xs text-ink/50">Stock #{v.stockNumber}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/70">
          <span className="inline-flex items-center gap-1.5"><Gauge className="h-4 w-4 text-accent" />{distance(v.mileage, units, locale)}</span>
          {v.fuelType && <span className="inline-flex items-center gap-1.5"><Fuel className="h-4 w-4 text-accent" />{v.fuelType}</span>}
          {v.transmission && <span className="inline-flex items-center gap-1.5"><Settings2 className="h-4 w-4 text-accent" />{v.transmission}</span>}
        </div>
        {layout === "list" && v.description && <p className="line-clamp-2 text-sm text-ink/60">{v.description}</p>}
        <div className="mt-auto flex items-center justify-between border-t border-ink/10 pt-3">
          <VehiclePrice v={v} />
          <span className="text-sm font-medium text-accent transition-transform group-hover:translate-x-1">View →</span>
        </div>
      </div>
    </Link>
  );
}
