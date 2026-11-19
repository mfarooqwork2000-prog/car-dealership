import { ChevronDown, Facebook, Instagram, Menu, Phone, X, Youtube } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui";
import { useSettings, useSite } from "@/features/site";
import { cn } from "@/services/format";
import type { NavItem } from "@/services/types";

const isExternal = (u: string) => /^https?:\/\//.test(u);
function NavLinkItem({ item, className, onClick }: { item: NavItem; className?: string; onClick?: () => void }) {
  if (isExternal(item.url) || item.url.startsWith("mailto:") || item.url.startsWith("tel:")) return <a href={item.url} className={className} target={item.openInNewTab ? "_blank" : undefined} rel="noopener noreferrer" onClick={onClick}>{item.label}</a>;
  return <NavLink to={item.url} className={({ isActive }) => cn(className, isActive && "text-accent")} onClick={onClick}>{item.label}</NavLink>;
}

function Brand({ light }: { light?: boolean }) {
  const { theme } = useSite();
  const { name } = useSettings();
  return <Link to="/" className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap", light ? "text-white" : "text-primary")} aria-label={`${name} home`}>{theme.logoUrl ? <img src={theme.logoUrl} alt={name} className="h-9 w-auto" /> : <span className="font-heading text-2xl font-semibold tracking-tight">{name}</span>}</Link>;
}

function Header() {
  const { navigation, banners } = useSite();
  const { contact } = useSettings();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const top = banners.filter((b) => b.placement === "top");
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/95 backdrop-blur">
      {top.map((b) => <div key={b.id} className="bg-accent px-4 py-2 text-center text-sm font-medium text-primary">{b.title}{b.body && ` — ${b.body}`} {b.ctaUrl && <Link to={b.ctaUrl} className="ml-2 underline">{b.ctaLabel ?? "Learn more"}</Link>}</div>)}
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <Brand />
        <nav className="hidden items-center gap-5 whitespace-nowrap xl:gap-7 lg:flex" aria-label="Main">
          {navigation.header.map((i) => i.children.length ? (
            <div key={i.id} className="group relative"><button className="flex items-center gap-1 text-sm font-medium hover:text-accent">{i.label}<ChevronDown className="h-4 w-4" /></button><div className="invisible absolute left-0 top-full min-w-48 rounded-lg border border-ink/10 bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">{i.children.map((c) => <NavLinkItem key={c.id} item={c} className="block rounded px-3 py-2 text-sm hover:bg-ink/5" />)}</div></div>
          ) : <NavLinkItem key={i.id} item={i} className="text-sm font-medium transition-colors hover:text-accent" />)}
        </nav>
        <div className="flex items-center gap-3">
          {contact.phone && <a href={`tel:${contact.phone}`} className="hidden items-center gap-2 text-sm font-medium md:flex"><Phone className="h-4 w-4 text-accent" />{contact.phone}</a>}
          <Button asChild variant="accent" size="sm" className="hidden sm:inline-flex"><Link to="/inventory">Shop Now</Link></Button>
          <button className="rounded p-2 lg:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-ink/10 bg-white px-4 pb-4 lg:hidden" aria-label="Mobile">
          {navigation.header.map((i) => <div key={i.id}><NavLinkItem item={i} className="block py-3 text-base font-medium" />{i.children.map((c) => <NavLinkItem key={c.id} item={c} className="block py-2 pl-4 text-sm text-ink/70" />)}</div>)}
        </nav>
      )}
    </header>
  );
}

function Footer() {
  const { navigation } = useSite();
  const { contact, social, footer, name, hours } = useSettings();
  return (
    <footer className="bg-primary text-white/80">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2"><Brand light /><p className="mt-4 max-w-sm text-sm">{footer.about}</p>
          <div className="mt-5 flex gap-3">{([["facebook", Facebook], ["instagram", Instagram], ["youtube", Youtube]] as const).map(([k, I]) => social[k] ? <a key={k} href={social[k]} target="_blank" rel="noopener noreferrer" aria-label={k} className="rounded-full bg-white/10 p-2 transition hover:bg-accent hover:text-primary"><I className="h-4 w-4" /></a> : null)}</div></div>
        <div><h4 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wider text-white">Quick links</h4><ul className="space-y-2 text-sm">{navigation.footer.map((i) => <li key={i.id}><NavLinkItem item={i} className="hover:text-accent" /></li>)}</ul></div>
        <div><h4 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wider text-white">Visit us</h4><address className="space-y-1 text-sm not-italic">{contact.address}<br />{contact.city}, {contact.province} {contact.postalCode}<br />{contact.phone && <a href={`tel:${contact.phone}`} className="hover:text-accent">{contact.phone}</a>}<br />{contact.email && <a href={`mailto:${contact.email}`} className="hover:text-accent">{contact.email}</a>}</address><p className="mt-3 text-xs text-white/50">Sat: {hours.saturday} · Sun: {hours.sunday}</p></div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">{footer.copyright ?? `© ${name}`}</div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      <Header />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}
