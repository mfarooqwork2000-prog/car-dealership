/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageSpinner, Textarea, useToast } from "@/components/ui";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { useAuth } from "@/features/auth";
import { api, qs } from "@/services/api";
import { dateShort, dateTime, titleCase } from "@/services/format";

export function Customers() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const page = Number(sp.get("page")) || 1;
  const term = sp.get("q") ?? "";
  const q = useQuery({ queryKey: ["customers", term, page], queryFn: () => api.list<any>(`/admin/customers${qs({ q: term, page, limit: 15 })}`), placeholderData: (p) => p });
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); setSp(n, { replace: true }); };
  const cols: Column<any>[] = [
    { key: "n", header: "Name", cell: (c) => <span className="font-medium">{c.firstName} {c.lastName}</span> },
    { key: "e", header: "Email", cell: (c) => c.email }, { key: "p", header: "Phone", cell: (c) => c.phone ?? "—" },
    { key: "l", header: "Enquiries", cell: (c) => c._count.leads }, { key: "d", header: "Since", cell: (c) => dateShort(c.createdAt) },
  ];
  return (
    <div className="space-y-4">
      <div><h1 className="text-3xl">Customers</h1><p className="text-sm text-ink/60">Everyone who has contacted the dealership.</p></div>
      <Card>
        <div className="border-b border-ink/10 p-4"><Input type="search" aria-label="Search customers" placeholder="Search name, email, phone…" className="w-72" defaultValue={term} onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)} onBlur={(e) => e.currentTarget.value !== term && set("q", e.currentTarget.value)} /></div>
        <DataTable columns={cols} rows={q.data?.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} onRowClick={(c) => nav(`/admin/customers/${c.id}`)} emptyTitle="No customers yet" />
        <Pagination page={page} totalPages={(q.data?.meta?.totalPages as number) ?? 1} total={q.data?.meta?.total as number} onPage={(p) => set("page", String(p))} />
      </Card>
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["customer", id], queryFn: () => api.get<any>(`/admin/customers/${id}`) });
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (q.data) setForm({ firstName: q.data.firstName, lastName: q.data.lastName, phone: q.data.phone ?? "", city: q.data.city ?? "", province: q.data.province ?? "", notes: q.data.notes ?? "" }); }, [q.data]);
  const save = useMutation({ mutationFn: () => api.patch(`/admin/customers/${id}`, { ...form, phone: form.phone || null, city: form.city || null, province: form.province || null, notes: form.notes || null }), onSuccess: () => { toast("success", "Customer saved"); qc.invalidateQueries({ queryKey: ["customer", id] }); qc.invalidateQueries({ queryKey: ["customers"] }); }, onError: (e: Error) => toast("error", e.message) });
  if (q.isLoading || !form) return <PageSpinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const c = q.data;
  const canWrite = can("customers:write");
  const bind = (k: string) => ({ value: form[k], disabled: !canWrite, onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" asChild aria-label="Back"><Link to="/admin/customers"><ArrowLeft className="h-5 w-5" /></Link></Button><div><h1 className="text-3xl">{c.firstName} {c.lastName}</h1><p className="text-sm text-ink/60">{c.email}</p></div></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit"><CardHeader title="Profile" /><div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-3"><Field label="First name"><Input {...bind("firstName")} /></Field><Field label="Last name"><Input {...bind("lastName")} /></Field></div>
          <Field label="Phone"><Input {...bind("phone")} /></Field><div className="grid grid-cols-2 gap-3"><Field label="City"><Input {...bind("city")} /></Field><Field label="Province"><Input {...bind("province")} /></Field></div>
          <Field label="Internal notes"><Textarea rows={4} {...bind("notes")} /></Field>
          {canWrite && <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}
        </div></Card>
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-xl">Enquiry history ({c.leads.length})</h2>
          {c.leads.map((l: any) => (
            <Card key={l.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/admin/leads/${l.id}`} className="font-medium hover:text-accent">{l.subject ?? titleCase(l.type)}</Link><div className="flex items-center gap-2"><Badge>{titleCase(l.type)}</Badge><Badge tone="blue">{titleCase(l.status)}</Badge></div></div>
              <p className="mt-1 text-xs text-ink/50">{dateTime(l.createdAt)}{l.vehicle && <> · Vehicle: <Link className="text-accent hover:underline" to={`/admin/vehicles/${l.vehicle.id}`}>{l.vehicle.title}</Link></>}</p>
              {l.message && <p className="mt-2 text-sm text-ink/75">{l.message}</p>}
              {l.notes.length > 0 && <ul className="mt-3 space-y-1 border-l-2 border-accent pl-3 text-sm">{l.notes.map((n: any) => <li key={n.id}>{n.body} <span className="text-xs text-ink/40">— {n.author?.firstName} · {dateShort(n.createdAt)}</span></li>)}</ul>}
            </Card>
          ))}
          {!c.leads.length && <p className="text-sm text-ink/50">No enquiries yet.</p>}
        </div>
      </div>
    </div>
  );
}
