import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, ConfirmDialog, Input, Select, useToast } from "@/components/ui";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { useAuth } from "@/features/auth";
import { api, qs } from "@/services/api";
import { money, titleCase } from "@/services/format";
import type { Vehicle } from "@/services/types";

const statusTone = { AVAILABLE: "green", PENDING: "amber", SOLD: "red", ARCHIVED: "neutral" } as const;
const pubTone = { PUBLISHED: "green", DRAFT: "amber", ARCHIVED: "neutral" } as const;

export default function Vehicles() {
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ ids: string[] } | null>(null);
  const page = Number(sp.get("page")) || 1;
  const filters = { q: sp.get("q") ?? "", status: sp.get("status") ?? "", publishStatus: sp.get("publishStatus") ?? "", sort: sp.get("sort") ?? "" };
  const q = useQuery({ queryKey: ["admin-vehicles", filters, page], queryFn: () => api.list<Vehicle>(`/admin/vehicles${qs({ ...filters, page, limit: 15 })}`), placeholderData: (p) => p });
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); setSp(n, { replace: true }); setSelected([]); };
  const done = (msg: string) => { toast("success", msg); setSelected([]); qc.invalidateQueries({ queryKey: ["admin-vehicles"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const fail = (e: Error) => toast("error", e.message);
  const bulk = useMutation({ mutationFn: (b: { action: string; status?: string; ids?: string[] }) => api.post<{ affected: number }>("/admin/vehicles/bulk", { ids: b.ids ?? selected, action: b.action, status: b.status }), onSuccess: (r) => done(`${r.affected} vehicle(s) updated`), onError: fail });
  const dup = useMutation({ mutationFn: (id: string) => api.post<Vehicle>(`/admin/vehicles/${id}/duplicate`), onSuccess: (v) => { toast("success", "Vehicle duplicated as a draft"); nav(`/admin/vehicles/${v.id}`); }, onError: fail });
  const del = useMutation({ mutationFn: (ids: string[]) => ids.length === 1 ? api.del(`/admin/vehicles/${ids[0]}`) : api.post("/admin/vehicles/bulk", { ids, action: "delete" }), onSuccess: () => { setConfirm(null); done("Deleted"); }, onError: fail });
  const canWrite = can("vehicles:write");

  const cols: Column<Vehicle>[] = [
    { key: "img", header: "", className: "w-16", cell: (v) => v.primaryImage ? <img src={v.primaryImage} alt="" className="h-10 w-14 rounded object-cover" /> : <div className="h-10 w-14 rounded bg-ink/10" /> },
    { key: "title", header: "Vehicle", cell: (v) => <div><Link to={`/admin/vehicles/${v.id}`} className="font-medium hover:text-accent">{v.title}</Link><p className="text-xs text-ink/50">#{v.stockNumber}{v.isFeatured && " · ★ Featured"}</p></div> },
    { key: "price", header: "Price", cell: (v) => money(v.price) },
    { key: "status", header: "Status", cell: (v) => <Badge tone={statusTone[v.status]}>{titleCase(v.status)}</Badge> },
    { key: "pub", header: "Visibility", cell: (v) => <Badge tone={pubTone[v.publishStatus]}>{titleCase(v.publishStatus)}</Badge> },
    { key: "act", header: "", className: "text-right", cell: (v) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" asChild aria-label="View on site"><a href={`/inventory/${v.slug}`} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" /></a></Button>
        {canWrite && <Button variant="ghost" size="icon" asChild aria-label="Edit"><Link to={`/admin/vehicles/${v.id}`}><Pencil className="h-4 w-4" /></Link></Button>}
        {canWrite && <Button variant="ghost" size="icon" aria-label="Duplicate" onClick={() => dup.mutate(v.id)}><Copy className="h-4 w-4" /></Button>}
        {can("vehicles:delete") && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirm({ ids: [v.id] })}><Trash2 className="h-4 w-4 text-red-600" /></Button>}
      </div>) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Inventory</h1><p className="text-sm text-ink/60">Manage every vehicle on your lot.</p></div>{canWrite && <Button asChild variant="accent"><Link to="/admin/vehicles/new"><Plus className="h-4 w-4" />Add vehicle</Link></Button>}</div>
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-ink/10 p-4">
          <Input type="search" aria-label="Search vehicles" placeholder="Search title, stock #, VIN…" className="w-64" defaultValue={filters.q} onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)} onBlur={(e) => e.currentTarget.value !== filters.q && set("q", e.currentTarget.value)} />
          <Select aria-label="Status" className="w-40" value={filters.status} onChange={(e) => set("status", e.target.value)}><option value="">All statuses</option>{["AVAILABLE", "PENDING", "SOLD", "ARCHIVED"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          <Select aria-label="Visibility" className="w-40" value={filters.publishStatus} onChange={(e) => set("publishStatus", e.target.value)}><option value="">All visibility</option><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option></Select>
          <Select aria-label="Sort" className="w-44" value={filters.sort} onChange={(e) => set("sort", e.target.value)}><option value="">Recently updated</option><option value="newest">Newest arrivals</option><option value="price-desc">Price high → low</option><option value="price-asc">Price low → high</option></Select>
        </div>
        {selected.length > 0 && canWrite && (
          <div className="flex flex-wrap items-center gap-2 bg-accent/10 px-4 py-2 text-sm"><span className="font-medium">{selected.length} selected</span>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: "publish" })}>Publish</Button><Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: "unpublish" })}>Unpublish</Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: "feature" })}>Feature</Button><Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: "status", status: "SOLD" })}>Mark sold</Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: "archive" })}>Archive</Button>
            {can("vehicles:delete") && <Button size="sm" variant="danger" onClick={() => setConfirm({ ids: selected })}>Delete</Button>}
          </div>
        )}
        <DataTable columns={cols} rows={q.data?.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} selectable={canWrite} selected={selected} onSelect={setSelected} emptyTitle="No vehicles found" emptyDescription="Adjust your filters or add a new vehicle." />
        <Pagination page={page} totalPages={(q.data?.meta?.totalPages as number) ?? 1} total={q.data?.meta?.total as number} onPage={(p) => set("page", String(p))} />
      </Card>
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} danger title="Delete vehicles?" description={`This permanently deletes ${confirm?.ids.length} vehicle(s) and their images. This cannot be undone. Consider archiving instead.`} confirmLabel="Delete permanently" loading={del.isPending} onConfirm={() => confirm && del.mutate(confirm.ids)} />
    </div>
  );
}
