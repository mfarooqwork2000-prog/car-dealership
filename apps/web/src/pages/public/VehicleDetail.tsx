import { useQuery } from "@tanstack/react-query";
import { Calculator, CalendarCheck, ChevronLeft, ChevronRight, Mail, Phone, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Card, EmptyState, ErrorState, Input, PageSpinner } from "@/components/ui";
import { LeadDialog } from "@/components/public/forms";
import { VehicleBadges, VehicleCard, VehiclePrice } from "@/components/public/VehicleCard";
import { Seo, useSettings } from "@/features/site";
import { api } from "@/services/api";
import { cn, distance, money, monthlyPayment, titleCase } from "@/services/format";
import type { Vehicle } from "@/services/types";

function Gallery({ v }: { v: Vehicle }) {
  const [i, setI] = useState(0);
  const imgs = v.images;
  const go = (d: number) => setI((x) => (x + d + imgs.length) % imgs.length);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  if (!imgs.length) return <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-ink/10 text-ink/50">No photos available</div>;
  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-ink/10">
        <img src={imgs[i].url} alt={imgs[i].alt || v.title} className={cn("h-full w-full object-cover", v.status === "SOLD" && "grayscale")} fetchPriority="high" />
        <div className="absolute left-3 top-3"><VehicleBadges v={v} /></div>
        {imgs.length > 1 && <>
          <button aria-label="Previous photo" onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"><ChevronLeft /></button>
          <button aria-label="Next photo" onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"><ChevronRight /></button>
          <span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-xs text-white">{i + 1} / {imgs.length}</span>
        </>}
      </div>
      {imgs.length > 1 && <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">{imgs.map((im, idx) => <button key={im.id} onClick={() => setI(idx)} aria-label={`Show photo ${idx + 1}`} aria-current={idx === i} className={cn("aspect-[4/3] overflow-hidden rounded border-2", idx === i ? "border-accent" : "border-transparent opacity-70 hover:opacity-100")}><img src={im.url} alt="" loading="lazy" className="h-full w-full object-cover" /></button>)}</div>}
    </div>
  );
}

function PaymentEstimator({ price }: { price: number }) {
  const { currency, locale } = useSettings();
  const [down, setDown] = useState(Math.round(price * 0.1));
  const [apr, setApr] = useState(6.9);
  const [term, setTerm] = useState(72);
  const pmt = monthlyPayment(Math.max(0, price - down), apr, term);
  return (
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 font-sans text-base font-semibold"><Calculator className="h-4 w-4 text-accent" />Payment estimator</h3>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label>Down<Input type="number" min={0} value={down} onChange={(e) => setDown(Number(e.target.value) || 0)} /></label>
        <label>APR %<Input type="number" min={0} step="0.1" value={apr} onChange={(e) => setApr(Number(e.target.value) || 0)} /></label>
        <label>Months<Input type="number" min={6} max={120} value={term} onChange={(e) => setTerm(Math.max(6, Number(e.target.value) || 6))} /></label>
      </div>
      <p className="mt-3 text-sm text-ink/60">Estimated payment</p><p className="font-heading text-2xl font-semibold" data-testid="payment">{money(Math.round(pmt), currency, locale)}<span className="text-sm font-normal text-ink/50"> / month</span></p>
      <p className="mt-1 text-xs text-ink/45">Estimate only. Taxes and fees excluded. Subject to credit approval.</p>
    </Card>
  );
}

export default function VehicleDetail() {
  const { slug } = useParams();
  const { units, locale, currency, contact, name } = useSettings();
  const [dialog, setDialog] = useState<"enquiry" | "test-drive" | "financing" | null>(null);
  const q = useQuery({ queryKey: ["vehicle", slug], queryFn: () => api.get<Vehicle>(`/public/vehicles/${slug}`), retry: false });
  if (q.isLoading) return <PageSpinner />;
  if (q.error || !q.data) return <div className="container-x py-20"><EmptyState title="Vehicle not found" description="It may have been removed or archived." action={<Button asChild><Link to="/inventory">Back to inventory</Link></Button>} /></div>;
  const v = q.data;
  const specs: [string, string | number | null | undefined][] = [
    ["Year", v.year], ["Make", v.makeName], ["Model", v.modelName], ["Trim", v.trim], ["Mileage", distance(v.mileage, units, locale)], ["Condition", titleCase(v.condition)], ["Body style", v.bodyType], ["Engine", v.engine],
    ["Cylinders", v.cylinders], ["Horsepower", v.horsepower ? `${v.horsepower} hp` : null], ["Transmission", v.transmission], ["Fuel type", v.fuelType], ["Drivetrain", v.drivetrain],
    ["Exterior colour", v.exteriorColor], ["Interior colour", v.interiorColor], ["Doors", v.doors], ["Seats", v.seats], ["VIN", v.vin], ["Stock #", v.stockNumber],
  ];
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Car", name: v.title, brand: { "@type": "Brand", name: v.makeName }, model: v.modelName, vehicleModelDate: String(v.year), vehicleIdentificationNumber: v.vin ?? undefined,
    mileageFromOdometer: { "@type": "QuantitativeValue", value: v.mileage, unitCode: "KMT" }, color: v.exteriorColor, fuelType: v.fuelType, vehicleTransmission: v.transmission, image: v.images.map((i) => i.url), description: v.description,
    itemCondition: v.condition === "NEW" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    offers: { "@type": "Offer", price: v.salePrice ?? v.price, priceCurrency: currency, availability: v.status === "AVAILABLE" ? "https://schema.org/InStock" : v.status === "SOLD" ? "https://schema.org/SoldOut" : "https://schema.org/LimitedAvailability", seller: { "@type": "AutoDealer", name } },
  };
  const sold = v.status === "SOLD";
  return (
    <div className="container-x py-8">
      <Seo title={v.title} description={`${v.title} for sale — ${money(v.salePrice ?? v.price, currency, locale)}, ${distance(v.mileage, units, locale)}. ${v.description?.slice(0, 120) ?? ""}`} image={v.primaryImage} jsonLd={jsonLd} />
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-ink/60"><Link to="/" className="hover:text-accent">Home</Link> / <Link to="/inventory" className="hover:text-accent">Inventory</Link> / <span className="text-ink">{v.title}</span></nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <Gallery v={v} />
          <section><h2 className="mb-3 text-2xl">Overview</h2><p className="whitespace-pre-line leading-relaxed text-ink/75">{v.description || "Contact us for more details about this vehicle."}</p></section>
          <section><h2 className="mb-3 text-2xl">Specifications</h2><dl className="grid gap-x-8 sm:grid-cols-2">{specs.filter(([, val]) => val != null && val !== "").map(([k, val]) => <div key={k} className="flex justify-between border-b border-ink/10 py-2 text-sm"><dt className="text-ink/60">{k}</dt><dd className="font-medium">{val}</dd></div>)}</dl></section>
          {v.features.length > 0 && <section><h2 className="mb-3 text-2xl">Features &amp; options</h2><ul className="grid gap-2 sm:grid-cols-2">{v.features.map((f) => <li key={f.id} className="flex items-center gap-2 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{f.name}</li>)}</ul></section>}
          {v.history && <section><h2 className="mb-3 text-2xl">Vehicle history</h2><p className="text-ink/75">{v.history}</p></section>}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <Card className="p-5">
            <h1 className="text-2xl leading-snug">{v.title}</h1>
            <p className="mt-1 text-sm text-ink/55">Stock #{v.stockNumber}{v.vin && <> · VIN {v.vin}</>}</p>
            <VehiclePrice v={v} className="mt-4 [&>span:first-child]:text-3xl" />
            {sold ? <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">This vehicle has been sold. Browse similar vehicles below.</p> : (
              <div className="mt-5 space-y-2">
                <Button variant="accent" size="lg" className="w-full" onClick={() => setDialog("test-drive")}><CalendarCheck className="h-5 w-5" />Book a test drive</Button>
                <Button size="lg" className="w-full" onClick={() => setDialog("enquiry")}><Mail className="h-5 w-5" />Contact dealership</Button>
                <Button variant="outline" size="lg" className="w-full" onClick={() => setDialog("financing")}><Wallet className="h-5 w-5" />Financing enquiry</Button>
                {contact.phone && <Button asChild variant="ghost" className="w-full"><a href={`tel:${contact.phone}`}><Phone className="h-4 w-4" />{contact.phone}</a></Button>}
              </div>
            )}
          </Card>
          {!sold && <PaymentEstimator price={v.salePrice ?? v.price} />}
        </aside>
      </div>
      {!!v.similar?.length && <section className="mt-16"><h2 className="mb-6 text-3xl">Similar vehicles</h2><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{v.similar.map((s) => <VehicleCard key={s.id} v={s} />)}</div></section>}
      <LeadDialog kind={dialog} vehicle={{ id: v.id, title: v.title }} onClose={() => setDialog(null)} />
    </div>
  );
}
export { ErrorState };
