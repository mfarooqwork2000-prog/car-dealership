/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LEAD_STATUSES, LEAD_TYPES } from "@cd/shared";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageSpinner, Select, Textarea, useToast } from "@/components/ui";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { useAuth } from "@/features/auth";
import { api, qs } from "@/services/api";
import { dateShort, dateTime, money, titleCase } from "@/services/format";
import type { Lead } from "@/services/types";

const tone = (s: string) => ({ NEW: "blue", CONTACTED: "amber", QUALIFIED: "accent", FOLLOW_UP: "amber", CONVERTED: "green", LOST: "red" }[s] ?? "neutral") as any;

const useAssignable = (enabled: boolean) => useQuery({ queryKey: ["assignable"], queryFn: () => api.get<any[]>("/admin/users/assignable"), enabled });

export function Leads() {
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const page = Number(sp.get("page")) || 1;
  const filters = { q: sp.get("q") ?? "", status: sp.get("status") ?? "", type: sp.get("type") ?? "", assigneeId: sp.get("assigneeId") ?? "" };
  const q = useQuery({ queryKey: ["leads", filters, page], queryFn: () => api.list<Lead>(`/admin/leads${qs({ ...filters, page, limit: 15 })}`), placeholderData: (p) => p });
  const users = useAssignable(can("leads:assign"));
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); setSp(n, { replace: true }); };
  const exportCsv = async () => {
    try {
      const blob = await api.blob(`/admin/leads/export${qs(filters)}`);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leads.csv"; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { toast("error", (e as Error).message); }
  };
  const cols: Column<Lead>[] = [
    { key: "c", header: "Customer", cell: (l) => <div><p className="font-medium">{l.customer.firstName} {l.customer.lastName}</p><p className="text-xs text-ink/50">{l.customer.email}</p></div> },
    { key: "t", header: "Type", cell: (l) => <Badge>{titleCase(l.type)}</Badge> },
    { key: "s", header: "Subject", cell: (l) => <span className="line-clamp-1 max-w-xs">{l.subject ?? l.vehicle?.title ?? "—"}</span> },
    { key: "st", header: "Status", cell: (l) => <Badge tone={tone(l.status)}>{titleCase(l.status)}</Badge> },
    { key: "a", header: "Assigned", cell: (l) => l.assignee ? `${l.assignee.firstName} ${l.assignee.lastName}` : <span className="text-ink/40">Unassigned</span> },
    { key: "d", header: "Received", cell: (l) => dateShort(l.createdAt) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Leads</h1><p className="text-sm text-ink/60">Enquiries, test drives, financing and trade-ins.</p></div>{can("leads:export") && <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button>}</div>
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-ink/10 p-4">
          <Input type="search" aria-label="Search leads" placeholder="Search name, email, message…" className="w-64" defaultValue={filters.q} onKeyDown={(e) => e.key === "Enter" && set("q", e.currentTarget.value)} onBlur={(e) => e.currentTarget.value !== filters.q && set("q", e.currentTarget.value)} />
          <Select aria-label="Status" className="w-40" value={filters.status} onChange={(e) => set("status", e.target.value)}><option value="">All statuses</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          <Select aria-label="Type" className="w-44" value={filters.type} onChange={(e) => set("type", e.target.value)}><option value="">All types</option>{LEAD_TYPES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
          {can("leads:assign") && <Select aria-label="Assignee" className="w-44" value={filters.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</Select>}
        </div>
        <DataTable columns={cols} rows={q.data?.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} onRowClick={(l) => nav(`/admin/leads/${l.id}`)} emptyTitle="No leads found" emptyDescription="New enquiries from the website will appear here." />
        <Pagination page={page} totalPages={(q.data?.meta?.totalPages as number) ?? 1} total={q.data?.meta?.total as number} onPage={(p) => set("page", String(p))} />
      </Card>
    </div>
  );
}

export function LeadDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [fu, setFu] = useState({ dueAt: "", note: "" });
  const q = useQuery({ queryKey: ["lead", id], queryFn: () => api.get<Lead>(`/admin/leads/${id}`) });
  const users = useAssignable(can("leads:assign"));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["lead", id] }); qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const fail = (e: Error) => toast("error", e.message);
  const patch = useMutation({ mutationFn: (d: object) => api.patch(`/admin/leads/${id}`, d), onSuccess: () => { toast("success", "Lead updated"); refresh(); }, onError: fail });
  const addNote = useMutation({ mutationFn: () => api.post(`/admin/leads/${id}/notes`, { body: note }), onSuccess: () => { setNote(""); refresh(); }, onError: fail });
  const addFu = useMutation({ mutationFn: () => api.post(`/admin/leads/${id}/follow-ups`, { dueAt: new Date(fu.dueAt).toISOString(), note: fu.note || undefined }), onSuccess: () => { setFu({ dueAt: "", note: "" }); toast("success", "Follow-up scheduled"); refresh(); }, onError: fail });
  const doneFu = useMutation({ mutationFn: (fid: string) => api.patch(`/admin/leads/${id}/follow-ups/${fid}`), onSuccess: refresh, onError: fail });
  if (q.isLoading) return <PageSpinner />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Not found")} />;
  const l = q.data;
  const canWrite = can("leads:write");
  const detail = (k: string, v: any) => v != null && v !== "" ? <div className="flex justify-between border-b border-ink/5 py-1.5 text-sm" key={k}><dt className="text-ink/55">{k}</dt><dd className="font-medium">{v}</dd></div> : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" size="icon" asChild aria-label="Back"><Link to="/admin/leads"><ArrowLeft className="h-5 w-5" /></Link></Button><div><h1 className="text-3xl">{l.customer.firstName} {l.customer.lastName}</h1><p className="text-sm text-ink/60">{titleCase(l.type)} · received {dateTime(l.createdAt)}</p></div><Badge tone={tone(l.status)} className="ml-auto">{titleCase(l.status)}</Badge></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card><CardHeader title={l.subject ?? "Message"} /><div className="space-y-4 p-5">
            {l.message ? <p className="whitespace-pre-line text-sm">{l.message}</p> : <p className="text-sm text-ink/50">No message provided.</p>}
            {l.vehicle && <p className="text-sm">Vehicle: <Link className="text-accent hover:underline" to={`/admin/vehicles/${l.vehicle.id}`}>{l.vehicle.title}</Link> (#{l.vehicle.stockNumber})</p>}
            {l.testDrive && <dl>{detail("Preferred date", dateShort(l.testDrive.preferredDate))}{detail("Preferred time", l.testDrive.preferredTime)}</dl>}
            {l.financing && <dl>{detail("Employment", l.financing.employmentStatus)}{detail("Employer", l.financing.employer)}{detail("Annual income", l.financing.annualIncome != null && money(l.financing.annualIncome))}{detail("Monthly housing", l.financing.monthlyHousing != null && money(l.financing.monthlyHousing))}{detail("Down payment", l.financing.downPayment != null && money(l.financing.downPayment))}{detail("Term", l.financing.termMonths && `${l.financing.termMonths} months`)}{detail("Credit", l.financing.creditRating)}</dl>}
            {l.tradeIn && <dl>{detail("Vehicle", `${l.tradeIn.year} ${l.tradeIn.make} ${l.tradeIn.model}`)}{detail("Mileage", `${l.tradeIn.mileage.toLocaleString()} km`)}{detail("VIN", l.tradeIn.vin)}{detail("Condition", l.tradeIn.condition)}{detail("Details", l.tradeIn.details)}</dl>}
          </div></Card>
          <Card><CardHeader title="Notes & communication" /><div className="space-y-4 p-5">
            {canWrite && <div className="space-y-2"><Textarea aria-label="New note" placeholder="Add an internal note (call summary, next steps…)" value={note} onChange={(e) => setNote(e.target.value)} /><Button disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button></div>}
            <ul className="space-y-3">{l.notes?.map((n: any) => <li key={n.id} className="rounded bg-ink/[.04] p-3 text-sm"><p className="whitespace-pre-line">{n.body}</p><p className="mt-1 text-xs text-ink/45">{n.author ? `${n.author.firstName} ${n.author.lastName}` : "Unknown"} · {dateTime(n.createdAt)}</p></li>)}{!l.notes?.length && <li className="text-sm text-ink/50">No notes yet.</li>}</ul>
          </div></Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Manage" /><div className="space-y-4 p-5">
            <Field label="Status"><Select value={l.status} disabled={!canWrite} onChange={(e) => patch.mutate({ status: e.target.value })}>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
            <Field label="Assigned to"><Select value={l.assignee?.id ?? ""} disabled={!can("leads:assign")} onChange={(e) => patch.mutate({ assigneeId: e.target.value || null })}><option value="">Unassigned</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</Select></Field>
          </div></Card>
          <Card><CardHeader title="Contact" /><div className="space-y-1 p-5 text-sm"><p><a className="text-accent hover:underline" href={`mailto:${l.customer.email}`}>{l.customer.email}</a></p>{l.customer.phone && <p><a className="text-accent hover:underline" href={`tel:${l.customer.phone}`}>{l.customer.phone}</a></p>}<Link className="mt-2 inline-block text-xs text-accent hover:underline" to={`/admin/customers/${l.customer.id}`}>View customer profile →</Link></div></Card>
          <Card><CardHeader title="Follow-ups" /><div className="space-y-3 p-5">
            {canWrite && <div className="space-y-2"><Input type="datetime-local" aria-label="Follow-up date" value={fu.dueAt} onChange={(e) => setFu({ ...fu, dueAt: e.target.value })} /><Input placeholder="Note (optional)" value={fu.note} onChange={(e) => setFu({ ...fu, note: e.target.value })} /><Button size="sm" variant="outline" disabled={!fu.dueAt} loading={addFu.isPending} onClick={() => addFu.mutate()}>Schedule</Button></div>}
            <ul className="space-y-2 text-sm">{l.followUps?.map((f: any) => <li key={f.id} className="flex items-start justify-between gap-2"><span className={f.completedAt ? "text-ink/40 line-through" : ""}>{dateTime(f.dueAt)}{f.note && ` — ${f.note}`}</span>{!f.completedAt && canWrite && <button className="text-xs text-accent hover:underline" onClick={() => doneFu.mutate(f.id)}>Done</button>}</li>)}{!l.followUps?.length && <li className="text-ink/50">None scheduled.</li>}</ul>
          </div></Card>
          {!!l.history?.length && <Card><CardHeader title="Contact history" /><ul className="divide-y divide-ink/5">{l.history.map((h: any) => <li key={h.id}><Link to={`/admin/leads/${h.id}`} className="block px-5 py-3 text-sm hover:bg-ink/[.02]">{h.subject ?? titleCase(h.type)}<p className="text-xs text-ink/45">{titleCase(h.status)} · {dateShort(h.createdAt)}</p></Link></li>)}</ul></Card>}
        </div>
      </div>
    </div>
  );
}
