/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Button, Card, ConfirmDialog, Dialog, ErrorState, useToast } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { DynamicFields, type FieldDef } from "@/components/admin/fields";
import { useAuth } from "@/features/auth";
import { api } from "@/services/api";
import { titleCase } from "@/services/format";

const STATUS: FieldDef = { name: "status", label: "Status", kind: "select", options: ["PUBLISHED", "DRAFT", "ARCHIVED"] };
interface Config { title: string; description: string; singular: string; fields: FieldDef[]; primary: string; secondary?: string; defaults: any; hasStatus?: boolean }
const CONFIGS: Record<string, Config> = {
  testimonials: { title: "Testimonials", singular: "testimonial", description: "Customer reviews shown on the homepage.", primary: "author", secondary: "body", hasStatus: true, defaults: { rating: 5, status: "PUBLISHED" }, fields: [{ name: "author", label: "Customer name", required: true }, { name: "role", label: "Detail (e.g. Bought a 2022 Audi Q5)" }, { name: "body", label: "Review", kind: "textarea", required: true }, { name: "rating", label: "Rating (1–5)", kind: "number" }, STATUS] },
  faqs: { title: "FAQs", singular: "FAQ", description: "Frequently asked questions.", primary: "question", secondary: "category", hasStatus: true, defaults: { status: "PUBLISHED" }, fields: [{ name: "question", label: "Question", required: true }, { name: "answer", label: "Answer", kind: "textarea", required: true }, { name: "category", label: "Category" }, STATUS] },
  services: { title: "Services", singular: "service", description: "Dealership services shown on the site.", primary: "title", secondary: "description", hasStatus: true, defaults: { status: "PUBLISHED" }, fields: [{ name: "title", label: "Title", required: true }, { name: "description", label: "Description", kind: "textarea", required: true }, { name: "icon", label: "Icon", kind: "select", options: ["banknote", "repeat", "shield-check", "umbrella", "star", "award", "clock"] }, { name: "imageUrl", label: "Image", kind: "image" }, STATUS] },
  banners: { title: "Banners & Promotions", singular: "banner", description: "Announcement bars shown above the site header. Only published banners appear.", primary: "title", secondary: "body", hasStatus: true, defaults: { status: "DRAFT", placement: "top" }, fields: [{ name: "title", label: "Headline", required: true }, { name: "body", label: "Supporting text" }, { name: "ctaLabel", label: "Link text" }, { name: "ctaUrl", label: "Link URL" }, { name: "placement", label: "Placement", kind: "select", options: ["top"] }, STATUS] },
  categories: { title: "Vehicle Categories", singular: "category", description: "Categories used on the homepage and inventory filters.", primary: "name", secondary: "description", defaults: { isActive: true }, fields: [{ name: "name", label: "Name", required: true }, { name: "description", label: "Description" }, { name: "imageUrl", label: "Image", kind: "image" }, { name: "isActive", label: "Active (visible on site)", kind: "toggle" }] },
};

export default function Collections() {
  const { collection = "" } = useParams();
  const cfg = CONFIGS[collection];
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const key = ["cms", collection];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<any[]>(`/admin/cms/${collection}`), enabled: !!cfg });
  const done = (m: string) => { toast("success", m); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["site"] }); };
  const fail = (e: Error) => toast("error", e.message);
  const save = useMutation({
    mutationFn: (d: any) => { const { id, createdAt, updatedAt, ...body } = d; return id ? api.put(`/admin/cms/${collection}/${id}`, body) : api.post(`/admin/cms/${collection}`, body); },
    onSuccess: () => { setEditing(null); done("Saved"); }, onError: fail,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/cms/${collection}/${id}`), onSuccess: () => { setDel(null); done("Deleted"); }, onError: fail });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.put(`/admin/cms/${collection}/reorder`, { ids }), onSuccess: () => done("Order updated"), onError: fail });
  if (!cfg) return <ErrorState error={new Error("Unknown content type")} />;
  const rows = q.data ?? [];
  const move = (i: number, d: number) => { const ids = rows.map((r) => r.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; reorder.mutate(ids); };
  const write = can("cms:write");
  const toggle = (r: any) => save.mutate(cfg.hasStatus ? { ...r, status: r.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" } : { ...r, isActive: !r.isActive });
  const live = (r: any) => (cfg.hasStatus ? r.status === "PUBLISHED" : r.isActive);
  const cols: Column<any>[] = [
    { key: "p", header: titleCase(cfg.singular), cell: (r) => <div className="max-w-md"><p className="font-medium">{r[cfg.primary]}</p>{cfg.secondary && <p className="line-clamp-1 text-xs text-ink/55">{r[cfg.secondary]}</p>}</div> },
    { key: "s", header: "State", cell: (r) => <button disabled={!write} onClick={() => toggle(r)} title={write ? "Click to enable/disable" : ""}><Badge tone={live(r) ? "green" : "neutral"}>{live(r) ? "Live" : cfg.hasStatus ? titleCase(r.status) : "Hidden"}</Badge></button> },
    { key: "a", header: "", className: "text-right", cell: (r) => { const i = rows.findIndex((x) => x.id === r.id); return write ? (
      <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setDel(r)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>) : null; } },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">{cfg.title}</h1><p className="text-sm text-ink/60">{cfg.description}</p></div>{write && <Button variant="accent" onClick={() => setEditing({ ...cfg.defaults })}><Plus className="h-4 w-4" />Add {cfg.singular}</Button>}</div>
      <Card><DataTable columns={cols} rows={rows} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} emptyTitle={`No ${cfg.title.toLowerCase()} yet`} /></Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={`${editing?.id ? "Edit" : "Add"} ${cfg.singular}`} wide>
        {editing && <form noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }} className="space-y-4"><DynamicFields fields={cfg.fields} value={editing} onChange={setEditing} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="accent" loading={save.isPending}>Save</Button></div></form>}
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} danger title={`Delete ${cfg.singular}?`} description="This cannot be undone." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} />
    </div>
  );
}
