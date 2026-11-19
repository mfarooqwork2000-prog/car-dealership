import { useQuery } from "@tanstack/react-query";
import { Car, CheckCircle2, Clock, FileSignature, Inbox, Repeat, Sparkles, Wallet, CalendarCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, CardHeader, ErrorState, Skeleton } from "@/components/ui";
import { useAuth } from "@/features/auth";
import { api } from "@/services/api";
import { dateTime, money, titleCase } from "@/services/format";

const Stat = ({ icon: I, label, value, to, tone = "text-accent" }: { icon: typeof Car; label: string; value: number | string; to?: string; tone?: string }) => {
  const body = <Card className="flex items-center gap-4 p-5 transition-shadow hover:shadow-md"><div className={`rounded-lg bg-ink/5 p-3 ${tone}`}><I className="h-6 w-6" /></div><div><p className="text-2xl font-semibold leading-none">{value}</p><p className="mt-1 text-sm text-ink/60">{label}</p></div></Card>;
  return to ? <Link to={to}>{body}</Link> : body;
};

export default function Dashboard() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<any>("/admin/dashboard") });
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  const { vehicles: v, leads: l, recentLeads, recentActivity } = q.data;
  const max = Math.max(1, ...l.perDay.map((d: any) => d.count));
  const statusTotal = l.byStatus.reduce((a: number, s: any) => a + s.count, 0) || 1;
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl">Dashboard</h1><p className="text-sm text-ink/60">Live overview of inventory and customer activity.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Car} label="Total vehicles" value={v.total} to="/admin/vehicles" />
        <Stat icon={CheckCircle2} label="Available" value={v.available} tone="text-emerald-600" to="/admin/vehicles?status=AVAILABLE" />
        <Stat icon={FileSignature} label="Sold" value={v.sold} tone="text-red-600" to="/admin/vehicles?status=SOLD" />
        <Stat icon={Clock} label="Pending" value={v.pending} tone="text-amber-600" to="/admin/vehicles?status=PENDING" />
        <Stat icon={Inbox} label="Total enquiries" value={l.total} to="/admin/leads" />
        <Stat icon={Sparkles} label="New enquiries" value={l.new} tone="text-sky-600" to="/admin/leads?status=NEW" />
        <Stat icon={CalendarCheck} label="Test-drive requests" value={l.testDrives} to="/admin/leads?type=TEST_DRIVE" />
        <Stat icon={Wallet} label="Financing requests" value={l.financing} to="/admin/leads?type=FINANCING" />
        <Stat icon={Repeat} label="Trade-in requests" value={l.tradeIns} to="/admin/leads?type=TRADE_IN" />
        <Card className="flex items-center gap-4 p-5 sm:col-span-2"><div className="rounded-lg bg-ink/5 p-3 text-accent"><Car className="h-6 w-6" /></div><div><p className="text-2xl font-semibold leading-none">{money(v.inventoryValue)}</p><p className="mt-1 text-sm text-ink/60">Available inventory value</p></div></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Leads — last 30 days" />
          <div className="p-5">
            {l.perDay.length === 0 ? <p className="py-8 text-center text-sm text-ink/50">No leads in the last 30 days.</p> : (
              <div className="flex h-40 items-end gap-1" role="img" aria-label="Leads per day chart">{l.perDay.map((d: any) => <div key={d.day} title={`${d.day}: ${d.count}`} className="flex-1 rounded-t bg-accent/80 transition-all hover:bg-accent" style={{ height: `${(d.count / max) * 100}%`, minHeight: 4 }} />)}</div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Pipeline" />
          <ul className="space-y-3 p-5">{l.byStatus.map((s: any) => <li key={s.status}><div className="mb-1 flex justify-between text-sm"><span>{titleCase(s.status)}</span><span className="text-ink/60">{s.count}</span></div><div className="h-2 rounded bg-ink/10"><div className="h-2 rounded bg-primary" style={{ width: `${(s.count / statusTotal) * 100}%` }} /></div></li>)}{!l.byStatus.length && <li className="text-sm text-ink/50">No leads yet.</li>}</ul>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent leads" action={<Link to="/admin/leads" className="text-xs text-accent hover:underline">View all</Link>} />
          <ul className="divide-y divide-ink/5">{recentLeads.map((r: any) => <li key={r.id}><Link to={`/admin/leads/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink/[.02]"><div className="min-w-0"><p className="truncate text-sm font-medium">{r.customer.firstName} {r.customer.lastName}</p><p className="truncate text-xs text-ink/55">{r.subject ?? titleCase(r.type)}</p></div><div className="text-right"><Badge tone={r.status === "NEW" ? "blue" : "neutral"}>{titleCase(r.status)}</Badge><p className="mt-1 text-[11px] text-ink/40">{dateTime(r.createdAt)}</p></div></Link></li>)}{!recentLeads.length && <li className="p-6 text-center text-sm text-ink/50">No leads yet.</li>}</ul>
        </Card>
        {can("audit:read") && (
          <Card>
            <CardHeader title="Recent activity" action={<Link to="/admin/audit" className="text-xs text-accent hover:underline">Audit log</Link>} />
            <ul className="divide-y divide-ink/5">{recentActivity.map((a: any) => <li key={a.id} className="px-5 py-3 text-sm"><span className="font-medium">{a.user ? `${a.user.firstName} ${a.user.lastName}` : "System"}</span> <span className="text-ink/60">{a.action} {a.entity}</span><p className="text-[11px] text-ink/40">{dateTime(a.createdAt)}</p></li>)}{!recentActivity.length && <li className="p-6 text-center text-sm text-ink/50">No activity yet.</li>}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
