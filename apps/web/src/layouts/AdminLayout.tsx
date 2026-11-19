import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, Car, ChevronRight, FileText, Globe, Image, LayoutDashboard, LogOut, Menu, Navigation, Palette, Search, Settings, ShieldCheck, Star, Users, UserCog, Inbox, X, Layers, Newspaper, HelpCircle, Wrench, Tag, Megaphone, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui";
import { useAuth } from "@/features/auth";
import { api } from "@/services/api";
import { cn, dateTime } from "@/services/format";

interface NavEntry { to: string; label: string; icon: LucideIcon; perm?: string[] }
const NAV: { group: string; items: NavEntry[] }[] = [
  { group: "Overview", items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: ["dashboard:view"] }] },
  { group: "Sales", items: [
    { to: "/admin/vehicles", label: "Inventory", icon: Car, perm: ["vehicles:read"] },
    { to: "/admin/leads", label: "Leads", icon: Inbox, perm: ["leads:read:all", "leads:read:assigned"] },
    { to: "/admin/customers", label: "Customers", icon: Users, perm: ["customers:read"] },
  ] },
  { group: "Website", items: [
    { to: "/admin/cms/pages", label: "Pages & Homepage", icon: FileText, perm: ["cms:read"] },
    { to: "/admin/cms/navigation", label: "Navigation", icon: Navigation, perm: ["cms:read"] },
    { to: "/admin/cms/categories", label: "Vehicle Categories", icon: Tag, perm: ["cms:read"] },
    { to: "/admin/cms/banners", label: "Banners", icon: Megaphone, perm: ["cms:read"] },
    { to: "/admin/cms/testimonials", label: "Testimonials", icon: Star, perm: ["cms:read"] },
    { to: "/admin/cms/faqs", label: "FAQs", icon: HelpCircle, perm: ["cms:read"] },
    { to: "/admin/cms/services", label: "Services", icon: Wrench, perm: ["cms:read"] },
    { to: "/admin/cms/blog", label: "Blog / News", icon: Newspaper, perm: ["cms:read"] },
    { to: "/admin/cms/media", label: "Media Library", icon: Image, perm: ["cms:read"] },
  ] },
  { group: "Administration", items: [
    { to: "/admin/appearance", label: "Appearance", icon: Palette, perm: ["settings:read"] },
    { to: "/admin/settings", label: "Settings", icon: Settings, perm: ["settings:read"] },
    { to: "/admin/users", label: "Users & Roles", icon: UserCog, perm: ["users:read"] },
    { to: "/admin/audit", label: "Audit Log", icon: ShieldCheck, perm: ["audit:read"] },
  ] },
];
const LABELS: Record<string, string> = { admin: "Dashboard", vehicles: "Inventory", leads: "Leads", customers: "Customers", cms: "Website", pages: "Pages", navigation: "Navigation", categories: "Vehicle Categories", banners: "Banners", testimonials: "Testimonials", faqs: "FAQs", services: "Services", blog: "Blog", media: "Media", appearance: "Appearance", settings: "Settings", users: "Users & Roles", audit: "Audit Log", new: "New" };

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => ({ label: LABELS[p] ?? (p.length > 14 ? "Details" : p), to: "/" + parts.slice(0, i + 1).join("/") }));
  return <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink/55">{crumbs.map((c, i) => <span key={c.to} className="flex items-center gap-1">{i > 0 && <ChevronRight className="h-3 w-3" />}{i === crumbs.length - 1 ? <span className="text-ink">{c.label}</span> : <Link to={c.to} className="hover:text-accent">{c.label}</Link>}</span>)}</nav>;
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const res = useQuery({ queryKey: ["admin-search", q], queryFn: () => api.get<any>(`/admin/search?q=${encodeURIComponent(q)}`), enabled: q.length >= 2 });
  useEffect(() => { const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const go = (to: string) => { setOpen(false); setQ(""); nav(to); };
  const d = res.data;
  const empty = d && !d.vehicles.length && !d.leads.length && !d.customers.length;
  return (
    <div ref={ref} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
      <input type="search" aria-label="Search admin" placeholder="Search vehicles, leads, customers…" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} className="h-9 w-full rounded-full border border-ink/15 bg-ink/[.03] pl-9 pr-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
      {open && q.length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-auto rounded-lg border border-ink/10 bg-white p-2 shadow-xl">
          {res.isLoading && <p className="p-3 text-sm text-ink/50">Searching…</p>}
          {empty && <p className="p-3 text-sm text-ink/50">No results</p>}
          {d?.vehicles.map((v: any) => <button key={v.id} onClick={() => go(`/admin/vehicles/${v.id}`)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-ink/5"><span className="mr-2 text-xs text-ink/40">Vehicle</span>{v.title}</button>)}
          {d?.leads.map((l: any) => <button key={l.id} onClick={() => go(`/admin/leads/${l.id}`)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-ink/5"><span className="mr-2 text-xs text-ink/40">Lead</span>{l.customer.firstName} {l.customer.lastName} — {l.subject}</button>)}
          {d?.customers.map((c: any) => <button key={c.id} onClick={() => go(`/admin/customers/${c.id}`)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-ink/5"><span className="mr-2 text-xs text-ink/40">Customer</span>{c.firstName} {c.lastName}</button>)}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.list<any>("/admin/notifications?limit=10"), refetchInterval: 30_000 });
  const read = useMutation({ mutationFn: (id: string) => api.post(`/admin/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const readAll = useMutation({ mutationFn: () => api.post("/admin/notifications/read-all"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  useEffect(() => { const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const unread = (q.data?.meta?.unread as number) ?? 0;
  return (
    <div ref={ref} className="relative">
      <button aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen(!open)} className="relative rounded-full p-2 hover:bg-ink/5"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread}</span>}</button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border border-ink/10 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2"><span className="text-sm font-semibold">Notifications</span>{unread > 0 && <button className="text-xs text-accent hover:underline" onClick={() => readAll.mutate()}>Mark all read</button>}</div>
          <div className="max-h-80 overflow-auto">
            {!q.data?.data.length && <p className="p-6 text-center text-sm text-ink/50">You're all caught up</p>}
            {q.data?.data.map((n: any) => <button key={n.id} onClick={() => { read.mutate(n.id); setOpen(false); if (n.link) nav(n.link); }} className={cn("block w-full border-b border-ink/5 px-4 py-3 text-left hover:bg-ink/[.03]", !n.readAt && "bg-accent/10")}><p className="text-sm font-medium">{n.title}</p>{n.body && <p className="text-xs text-ink/60">{n.body}</p>}<p className="mt-1 text-[11px] text-ink/40">{dateTime(n.createdAt)}</p></button>)}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  const sidebar = (
    <div className="flex h-full flex-col bg-primary text-white/80">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5"><Layers className="h-5 w-5 text-accent" /><span className="font-heading text-lg font-semibold text-white">Dealer Admin</span></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Admin">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(...i.perm));
          if (!items.length) return null;
          return <div key={g.group}><p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{g.group}</p>{items.map((i) => <NavLink key={i.to} to={i.to} end={i.to === "/admin"} className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-white/10", isActive && "bg-white/15 font-medium text-white")}><i.icon className="h-4 w-4" />{i.label}</NavLink>)}</div>;
        })}
      </nav>
      <a href="/" target="_blank" rel="noreferrer" className="m-3 flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm hover:bg-white/10"><Globe className="h-4 w-4" />View website</a>
    </div>
  );
  return (
    <div className="flex min-h-screen bg-[#f4f5f7]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="relative h-full w-64">{sidebar}<button aria-label="Close menu" className="absolute right-2 top-4 text-white" onClick={() => setOpen(false)}><X /></button></div></div>}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-ink/10 bg-white px-4 sm:px-6">
          <button className="rounded p-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <Notifications />
            <div className="hidden text-right sm:block"><p className="text-sm font-medium leading-tight">{user?.firstName} {user?.lastName}</p><p className="text-xs text-ink/50">{user?.roleName}</p></div>
            <button aria-label="Sign out" className="rounded-full p-2 hover:bg-ink/5" onClick={async () => { await logout(); nav("/admin/login"); }}><LogOut className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="border-b border-ink/10 bg-white/60 px-4 py-2 sm:px-6"><Breadcrumbs /></div>
        <main className="flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
export { Badge };
