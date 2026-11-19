/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ROLE_KEYS, ROLE_LABELS } from "@cd/shared";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Dialog, ErrorState, Field, Input, PageSpinner, Select, useToast } from "@/components/ui";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { ImageField } from "@/components/admin/fields";
import { useAuth } from "@/features/auth";
import { api } from "@/services/api";
import { dateShort, dateTime, titleCase } from "@/services/format";

const FONTS = ["Inter", "Playfair Display", "Poppins", "Montserrat", "Lora", "Roboto", "Open Sans", "Merriweather", "Cormorant Garamond", "DM Sans", "Raleway"];

// ═════════ Appearance / theme ═════════
export function Appearance() {
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["theme"], queryFn: () => api.get<any>("/admin/settings/theme") });
  const [t, setT] = useState<any>(null);
  useEffect(() => { if (q.data) setT(q.data); }, [q.data]);
  const save = useMutation({ mutationFn: () => { const { id, updatedAt, ...b } = t; return api.put("/admin/settings/theme", { ...b, logoUrl: b.logoUrl || null, faviconUrl: b.faviconUrl || null }); }, onSuccess: () => { toast("success", "Appearance saved — the website now uses it"); qc.invalidateQueries({ queryKey: ["theme"] }); qc.invalidateQueries({ queryKey: ["site"] }); }, onError: (e: Error) => toast("error", e.message) });
  if (!t) return q.error ? <ErrorState error={q.error} /> : <PageSpinner />;
  const write = can("settings:write");
  const color = (k: string, label: string) => <Field label={label}><div className="flex gap-2"><input type="color" aria-label={label} className="h-10 w-12 cursor-pointer rounded border border-ink/20" value={t[k]} disabled={!write} onChange={(e) => setT({ ...t, [k]: e.target.value })} /><Input value={t[k]} disabled={!write} onChange={(e) => setT({ ...t, [k]: e.target.value })} /></div></Field>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Appearance</h1><p className="text-sm text-ink/60">Branding, colours, fonts and layout for the public website.</p></div>{write && <Button variant="accent" loading={save.isPending} onClick={() => save.mutate()}>Save appearance</Button>}</div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Brand" /><div className="space-y-4 p-5"><ImageField label="Logo" value={t.logoUrl} onChange={(v) => setT({ ...t, logoUrl: v })} /><ImageField label="Favicon" value={t.faviconUrl} onChange={(v) => setT({ ...t, faviconUrl: v })} /><p className="text-xs text-ink/50">Dealership name, contact details and social links are in Settings.</p></div></Card>
        <Card><CardHeader title="Colours" /><div className="space-y-4 p-5">{color("primaryColor", "Primary colour")}{color("secondaryColor", "Secondary colour")}{color("accentColor", "Accent colour")}</div></Card>
        <Card><CardHeader title="Typography & shape" /><div className="space-y-4 p-5">
          <Field label="Heading font"><Select value={t.headingFont} disabled={!write} onChange={(e) => setT({ ...t, headingFont: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</Select></Field>
          <Field label="Body font"><Select value={t.bodyFont} disabled={!write} onChange={(e) => setT({ ...t, bodyFont: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</Select></Field>
          <Field label="Button corners"><Select value={t.buttonRadius} disabled={!write} onChange={(e) => setT({ ...t, buttonRadius: e.target.value })}><option value="0rem">Square</option><option value="0.25rem">Slightly rounded</option><option value="0.5rem">Rounded</option><option value="9999px">Pill</option></Select></Field>
          <Field label="Content width"><Select value={t.layoutWidth} disabled={!write} onChange={(e) => setT({ ...t, layoutWidth: e.target.value })}><option value="1152px">Narrow (1152px)</option><option value="1280px">Standard (1280px)</option><option value="1440px">Wide (1440px)</option></Select></Field>
        </div></Card>
        <Card><CardHeader title="Live preview" /><div className="space-y-4 p-5" style={{ ["--primary" as any]: hexTriplet(t.primaryColor), ["--accent" as any]: hexTriplet(t.accentColor), ["--secondary" as any]: hexTriplet(t.secondaryColor), ["--btn-radius" as any]: t.buttonRadius }}>
          <div className="rounded-lg bg-primary p-6 text-white"><p className="eyebrow">Preview</p><p className="mt-1 text-3xl" style={{ fontFamily: `"${t.headingFont}", serif` }}>Drive something exceptional</p><p className="mt-2 text-white/70" style={{ fontFamily: `"${t.bodyFont}", sans-serif` }}>Body text in your chosen font.</p><button type="button" className="mt-4 rounded-btn bg-accent px-5 py-2 text-sm font-semibold text-primary">Browse inventory</button></div>
        </div></Card>
      </div>
    </div>
  );
}
const hexTriplet = (h: string) => { const m = /^#?(..)(..)(..)$/.exec(h ?? ""); return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : "0 0 0"; };

// ═════════ General settings ═════════
const GROUPS: { key: string; title: string; fields: { name: string; label: string; type?: string; options?: string[] }[] }[] = [
  { key: "general", title: "Dealership", fields: [{ name: "dealershipName", label: "Dealership name" }, { name: "tagline", label: "Tagline" }, { name: "currency", label: "Currency", type: "select", options: ["CAD", "USD", "EUR", "GBP", "AUD"] }, { name: "units", label: "Measurement units", type: "select", options: ["metric", "imperial"] }, { name: "locale", label: "Locale", type: "select", options: ["en-CA", "fr-CA", "en-US", "en-GB"] }] },
  { key: "contact", title: "Contact & address", fields: [{ name: "phone", label: "Phone" }, { name: "email", label: "Email" }, { name: "address", label: "Street address" }, { name: "city", label: "City" }, { name: "province", label: "Province / state" }, { name: "postalCode", label: "Postal code" }, { name: "mapsQuery", label: "Google Maps search text" }] },
  { key: "hours", title: "Business hours", fields: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => ({ name: d, label: titleCase(d) })) },
  { key: "social", title: "Social media", fields: [{ name: "facebook", label: "Facebook URL" }, { name: "instagram", label: "Instagram URL" }, { name: "youtube", label: "YouTube URL" }, { name: "x", label: "X / Twitter URL" }] },
  { key: "footer", title: "Footer", fields: [{ name: "about", label: "About text" }, { name: "copyright", label: "Copyright line" }] },
  { key: "seo", title: "SEO", fields: [{ name: "titleSuffix", label: "Title suffix (after page titles)" }, { name: "defaultDescription", label: "Default meta description" }] },
  { key: "images", title: "Images", fields: [{ name: "maxUploadMb", label: "Max upload size (MB, informational — server cap is 8 MB)", type: "number" }] },
  { key: "notifications", title: "Notifications", fields: [{ name: "notifyOnNewLead", label: "Notify staff in-app about new leads", type: "checkbox" }] },
  { key: "privacy", title: "Privacy", fields: [{ name: "showCookieNotice", label: "Show cookie notice", type: "checkbox" }] },
];

function SettingsGroup({ g, value, canWrite }: { g: (typeof GROUPS)[number]; value: any; canWrite: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState<any>(value ?? {});
  const save = useMutation({ mutationFn: () => api.put(`/admin/settings/${g.key}`, v), onSuccess: () => { toast("success", `${g.title} saved`); qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["site"] }); }, onError: (e: Error) => toast("error", e.message) });
  return (
    <Card><CardHeader title={g.title} action={canWrite && <Button size="sm" variant="accent" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">{g.fields.map((f) => f.type === "checkbox" ? <label key={f.name} className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" disabled={!canWrite} checked={!!v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} />{f.label}</label>
        : <Field key={f.name} label={f.label}>{f.type === "select" ? <Select disabled={!canWrite} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>{f.options!.map((o) => <option key={o}>{o}</option>)}</Select> : <Input type={f.type ?? "text"} disabled={!canWrite} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: f.type === "number" ? Number(e.target.value) : e.target.value })} />}</Field>)}</div>
    </Card>
  );
}
export function SettingsPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Record<string, any>>("/admin/settings") });
  if (q.isLoading) return <PageSpinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">Settings</h1><p className="text-sm text-ink/60">General dealership configuration. Defaults are Canadian dollars and metric units.</p></div>
      <div className="grid gap-6 xl:grid-cols-2">{GROUPS.map((g) => <SettingsGroup key={g.key} g={g} value={q.data[g.key]} canWrite={can("settings:write")} />)}</div>
      <Card className="p-5 text-sm text-ink/65"><b>Email delivery &amp; image storage</b> are configured with environment variables (SMTP_*, CLOUDINARY_*) on the server for security — see the README.</Card>
    </div>
  );
}

// ═════════ Users & roles ═════════
export function Users() {
  const { user: me, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const q = useQuery({ queryKey: ["users"], queryFn: () => api.get<any[]>("/admin/users") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.list<any>("/admin/roles") });
  const done = (m: string) => { toast("success", m); qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["roles"] }); qc.invalidateQueries({ queryKey: ["assignable"] }); };
  const fail = (e: Error) => toast("error", e.message);
  const save = useMutation({ mutationFn: (u: any) => { const body = { firstName: u.firstName, lastName: u.lastName, phone: u.phone || null, role: u.role, isActive: u.isActive, ...(u.password ? { password: u.password } : {}) }; return u.id ? api.put(`/admin/users/${u.id}`, body) : api.post("/admin/users", { ...body, email: u.email }); }, onSuccess: () => { setEditing(null); done("User saved"); }, onError: (e: any) => toast("error", e.details?.fieldErrors ? Object.values<any>(e.details.fieldErrors).flat().join(", ") : e.message) });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/users/${id}`), onSuccess: () => { setDel(null); done("User deleted"); }, onError: fail });
  const write = can("users:write");
  const cols: Column<any>[] = [
    { key: "n", header: "User", cell: (u) => <div><p className="font-medium">{u.firstName} {u.lastName}</p><p className="text-xs text-ink/50">{u.email}</p></div> },
    { key: "r", header: "Role", cell: (u) => <Badge tone="blue">{u.role.name}</Badge> },
    { key: "s", header: "Status", cell: (u) => <Badge tone={u.isActive ? "green" : "neutral"}>{u.isActive ? "Active" : "Disabled"}</Badge> },
    { key: "l", header: "Last login", cell: (u) => (u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never") },
    { key: "a", header: "", className: "text-right", cell: (u) => write ? <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing({ ...u, role: u.role.key, password: "" })}><Pencil className="h-4 w-4" /></Button>{u.id !== me?.id && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setDel(u)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div> : null },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Users &amp; Roles</h1><p className="text-sm text-ink/60">Permissions are enforced on the server for every request.</p></div>{write && <Button variant="accent" onClick={() => setEditing({ role: "SALES_REP", isActive: true, firstName: "", lastName: "", email: "", password: "" })}><Plus className="h-4 w-4" />Add user</Button>}</div>
      <Card><DataTable columns={cols} rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} /></Card>
      <Card><CardHeader title="Role permissions" /><div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{roles.data?.data.map((r: any) => <div key={r.key} className="rounded border border-ink/10 p-4"><p className="font-medium">{r.name} <span className="text-xs text-ink/45">({r.users} user{r.users === 1 ? "" : "s"})</span></p><div className="mt-2 flex flex-wrap gap-1">{r.permissions.map((p: string) => <span key={p} className="rounded bg-ink/[.06] px-1.5 py-0.5 text-[11px]" title={(roles.data?.meta?.allPermissions as any)?.[p]}>{p}</span>)}</div></div>)}</div></Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? "Edit user" : "Add user"}>
        {editing && <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
          <div className="grid grid-cols-2 gap-3"><Field label="First name" required><Input value={editing.firstName} onChange={(e) => setEditing({ ...editing, firstName: e.target.value })} /></Field><Field label="Last name" required><Input value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} /></Field></div>
          <Field label="Email" required><Input type="email" disabled={!!editing.id} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
          <Field label="Role"><Select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>{ROLE_KEYS.filter((k) => k !== "SUPER_ADMIN" || me?.role === "SUPER_ADMIN").map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}</Select></Field>
          <Field label={editing.id ? "New password (leave blank to keep)" : "Password"} hint="10+ characters with upper, lower and a number" required={!editing.id}><Input type="password" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />Account active</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="accent" loading={save.isPending}>Save user</Button></div>
        </form>}
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} danger title="Delete user?" description={`${del?.email} will lose access immediately. Their leads become unassigned. Consider disabling the account instead.`} confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del.id)} />
    </div>
  );
}

// ═════════ Audit log ═════════
export function AuditLog() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["audit", page], queryFn: () => api.list<any>(`/admin/audit-logs?page=${page}`), placeholderData: (p) => p });
  const cols: Column<any>[] = [
    { key: "w", header: "When", cell: (a) => dateTime(a.createdAt) }, { key: "u", header: "User", cell: (a) => (a.user ? `${a.user.firstName} ${a.user.lastName}` : "System") },
    { key: "a", header: "Action", cell: (a) => <Badge>{a.action}</Badge> }, { key: "e", header: "Entity", cell: (a) => <span>{a.entity}{a.entityId && <span className="ml-1 text-xs text-ink/40">{a.entityId.slice(0, 8)}</span>}</span> }, { key: "i", header: "IP", cell: (a) => a.ip ?? "—" },
  ];
  return <div className="space-y-4"><div><h1 className="text-3xl">Audit Log</h1><p className="text-sm text-ink/60">A record of sensitive actions across the admin portal.</p></div><Card><DataTable columns={cols} rows={q.data?.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} emptyTitle="No activity recorded" /><Pagination page={page} totalPages={(q.data?.meta?.totalPages as number) ?? 1} total={q.data?.meta?.total as number} onPage={setPage} /></Card></div>;
}
export { dateShort };
