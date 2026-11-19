/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SECTION_LABELS, SECTION_TYPES, slugify } from "@cd/shared";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Dialog, ErrorState, Field, Input, PageSpinner, Select, Textarea, useToast } from "@/components/ui";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { DynamicFields, ImageField, SECTION_FIELDS } from "@/components/admin/fields";
import { SectionList } from "@/components/public/sections";
import { useAuth } from "@/features/auth";
import { api, ApiError } from "@/services/api";
import { dateShort, titleCase } from "@/services/format";

export function Pages() {
  const { can } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "" });
  const [del, setDel] = useState<any>(null);
  const q = useQuery({ queryKey: ["cms-pages"], queryFn: () => api.get<any[]>("/admin/cms/pages") });
  const create = useMutation({ mutationFn: () => api.post<any>("/admin/cms/pages", { title: form.title, slug: form.slug || slugify(form.title), status: "DRAFT" }), onSuccess: (p) => { toast("success", "Page created"); qc.invalidateQueries({ queryKey: ["cms-pages"] }); nav(`/admin/cms/pages/${p.id}`); }, onError: (e: Error) => toast("error", e.message) });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/cms/pages/${id}`), onSuccess: () => { setDel(null); toast("success", "Page deleted"); qc.invalidateQueries({ queryKey: ["cms-pages"] }); }, onError: (e: Error) => toast("error", e.message) });
  const write = can("cms:write");
  const cols: Column<any>[] = [
    { key: "t", header: "Page", cell: (p) => <div><Link to={`/admin/cms/pages/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link><p className="text-xs text-ink/50">{p.slug === "home" ? "/" : `/${p.slug}`}{p.isSystem && " · system page"}</p></div> },
    { key: "s", header: "Status", cell: (p) => <Badge tone={p.status === "PUBLISHED" ? "green" : "amber"}>{titleCase(p.status)}</Badge> },
    { key: "n", header: "Sections", cell: (p) => p._count.sections }, { key: "u", header: "Updated", cell: (p) => dateShort(p.updatedAt) },
    { key: "a", header: "", className: "text-right", cell: (p) => <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" asChild aria-label="Edit"><Link to={`/admin/cms/pages/${p.id}`}><Pencil className="h-4 w-4" /></Link></Button>{write && !p.isSystem && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setDel(p)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Pages &amp; Homepage</h1><p className="text-sm text-ink/60">Build and edit every page from reusable sections. The homepage is the "Home" page.</p></div>{write && <Button variant="accent" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New landing page</Button>}</div>
      <Card><DataTable columns={cols} rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} /></Card>
      <Dialog open={creating} onOpenChange={setCreating} title="New page" description="Create a custom landing page. You can add sections after it's created.">
        <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Title" required><Input value={form.title} onChange={(e) => setForm({ title: e.target.value, slug: slugify(e.target.value) })} /></Field>
          <Field label="URL slug" hint={`Page will be at /${form.slug || "your-slug"}`}><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" variant="accent" disabled={!form.title} loading={create.isPending}>Create</Button></div>
        </form>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} danger title={`Delete "${del?.title}"?`} description="The page and all its sections will be permanently removed." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del.id)} />
    </div>
  );
}

export function PageEditor() {
  const { id } = useParams();
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const write = can("cms:write");
  const q = useQuery({ queryKey: ["cms-page", id], queryFn: () => api.get<any>(`/admin/cms/pages/${id}`) });
  const [meta, setMeta] = useState<any>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(SECTION_TYPES[0] as string);
  const [preview, setPreview] = useState(false);
  const [delSec, setDelSec] = useState<any>(null);
  useEffect(() => { if (q.data) setMeta({ title: q.data.title, slug: q.data.slug, metaTitle: q.data.metaTitle ?? "", metaDescription: q.data.metaDescription ?? "", ogImageUrl: q.data.ogImageUrl ?? "", status: q.data.status }); }, [q.data]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["cms-page", id] }); qc.invalidateQueries({ queryKey: ["cms-pages"] }); qc.invalidateQueries({ queryKey: ["page"] }); qc.invalidateQueries({ queryKey: ["site"] }); };
  const fail = (e: Error) => { toast("error", e instanceof ApiError && e.details?.fieldErrors ? `${e.message}: ${Object.entries(e.details.fieldErrors).map(([k, v]) => `${k} ${v?.[0]}`).join(", ")}` : e.message); };
  const savePage = useMutation({ mutationFn: (status?: string) => api.put(`/admin/cms/pages/${id}`, { ...meta, ...(status ? { status } : {}), metaTitle: meta.metaTitle || null, metaDescription: meta.metaDescription || null, ogImageUrl: meta.ogImageUrl || null }), onSuccess: () => { toast("success", "Page saved"); refresh(); }, onError: fail });
  const addSection = useMutation({ mutationFn: () => api.post<any>(`/admin/cms/pages/${id}/sections`, { type: newType, content: defaultContent(newType) }), onSuccess: (s) => { setAdding(false); refresh(); setEditing(s); }, onError: fail });
  const saveSection = useMutation({ mutationFn: (s: any) => api.put(`/admin/cms/pages/${id}/sections/${s.id}`, { content: s.content, isVisible: s.isVisible }), onSuccess: () => { setEditing(null); toast("success", "Section saved"); refresh(); }, onError: fail });
  const toggle = useMutation({ mutationFn: (s: any) => api.put(`/admin/cms/pages/${id}/sections/${s.id}`, { isVisible: !s.isVisible }), onSuccess: refresh, onError: fail });
  const delSection = useMutation({ mutationFn: (sid: string) => api.del(`/admin/cms/pages/${id}/sections/${sid}`), onSuccess: () => { setDelSec(null); toast("success", "Section removed"); refresh(); }, onError: fail });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.put(`/admin/cms/pages/${id}/sections/reorder`, { ids }), onSuccess: refresh, onError: fail });
  if (q.isLoading || !meta) return <PageSpinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const p = q.data;
  const secs: any[] = p.sections;
  const move = (i: number, d: number) => { const ids = secs.map((s) => s.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; reorder.mutate(ids); };
  const bind = (k: string) => ({ value: meta[k], disabled: !write, onChange: (e: any) => setMeta({ ...meta, [k]: e.target.value }) });
  const summary = (s: any) => s.content?.heading ?? s.content?.html?.replace(/<[^>]+>/g, "").slice(0, 60) ?? "";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" asChild aria-label="Back"><Link to="/admin/cms/pages"><ArrowLeft className="h-5 w-5" /></Link></Button><div><h1 className="text-3xl">{p.title}</h1><p className="text-sm text-ink/60"><Badge tone={p.status === "PUBLISHED" ? "green" : "amber"}>{titleCase(p.status)}</Badge> <span className="ml-2">{p.slug === "home" ? "/" : `/${p.slug}`}</span></p></div></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}><Eye className="h-4 w-4" />Preview</Button>
          {p.status === "PUBLISHED" && <Button variant="outline" asChild><a href={p.slug === "home" ? "/" : `/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />View live</a></Button>}
          {write && (p.status === "PUBLISHED" ? <Button variant="outline" loading={savePage.isPending} onClick={() => savePage.mutate("DRAFT")}>Unpublish</Button> : <Button variant="accent" loading={savePage.isPending} onClick={() => savePage.mutate("PUBLISHED")}>Publish</Button>)}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title={`Sections (${secs.length})`} action={write && <Button size="sm" variant="accent" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add section</Button>} />
          <ul className="divide-y divide-ink/5">
            {secs.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><p className={`font-medium ${s.isVisible ? "" : "text-ink/40"}`}>{SECTION_LABELS[s.type as keyof typeof SECTION_LABELS] ?? s.type}{!s.isVisible && <Badge className="ml-2">Hidden</Badge>}</p><p className="truncate text-xs text-ink/50">{summary(s)}</p></div>
                {write && <div className="flex shrink-0">
                  <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === secs.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={s.isVisible ? "Hide section" : "Show section"} onClick={() => toggle.mutate(s)}>{s.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>
                  <Button variant="ghost" size="icon" aria-label="Edit section" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Delete section" onClick={() => setDelSec(s)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </div>}
              </li>
            ))}
            {!secs.length && <li className="p-10 text-center text-sm text-ink/50">This page has no sections yet. Add one to get started.</li>}
          </ul>
        </Card>
        <Card><CardHeader title="Page settings & SEO" /><div className="space-y-4 p-5">
          <Field label="Title"><Input {...bind("title")} /></Field>
          <Field label="URL slug" hint={p.isSystem ? "System page slugs can't be changed" : undefined}><Input value={meta.slug} disabled={!write || p.isSystem} onChange={(e) => setMeta({ ...meta, slug: slugify(e.target.value) })} /></Field>
          <Field label="SEO title" hint="Defaults to the page title"><Input {...bind("metaTitle")} /></Field>
          <Field label="Meta description" hint={`${meta.metaDescription.length}/160 recommended`}><Textarea rows={3} {...bind("metaDescription")} /></Field>
          <ImageField label="Social share image" value={meta.ogImageUrl} onChange={(v) => setMeta({ ...meta, ogImageUrl: v })} />
          {write && <Button className="w-full" loading={savePage.isPending} onClick={() => savePage.mutate(undefined)}>Save page settings</Button>}
        </div></Card>
      </div>

      <Dialog open={adding} onOpenChange={setAdding} title="Add a section" description="Choose a section type. You'll edit its content next.">
        <Field label="Section type"><Select value={newType} onChange={(e) => setNewType(e.target.value)}>{SECTION_TYPES.map((t) => <option key={t} value={t}>{SECTION_LABELS[t]}</option>)}</Select></Field>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button variant="accent" loading={addSection.isPending} onClick={() => addSection.mutate()}>Add section</Button></div>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing ? `Edit ${SECTION_LABELS[editing.type as keyof typeof SECTION_LABELS] ?? editing.type}` : ""} wide>
        {editing && <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveSection.mutate(editing); }}>
          <DynamicFields fields={SECTION_FIELDS[editing.type] ?? []} value={editing.content} onChange={(content) => setEditing({ ...editing, content })} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="accent" loading={saveSection.isPending}>Save section</Button></div>
        </form>}
      </Dialog>
      <ConfirmDialog open={!!delSec} onOpenChange={(o) => !o && setDelSec(null)} danger title="Remove this section?" description="The section and its content will be deleted from this page." confirmLabel="Remove" loading={delSection.isPending} onConfirm={() => delSec && delSection.mutate(delSec.id)} />
      {/* Preview shows drafts and hidden state exactly as the public renderer would draw it */}
      <Dialog open={preview} onOpenChange={setPreview} title={`Preview: ${p.title}`} description={p.status === "PUBLISHED" ? "Live content" : "Draft — not visible to the public"} wide>
        <div className="max-h-[70vh] overflow-auto rounded border border-ink/10"><SectionList sections={secs} /></div>
      </Dialog>
    </div>
  );
}

/** Sensible starting content so a new section validates immediately. */
function defaultContent(type: string): any {
  const base = { heading: `New ${SECTION_LABELS[type as keyof typeof SECTION_LABELS] ?? "section"}` };
  if (type === "rich-text") return { ...base, html: "<p>Edit this content.</p>" };
  if (type === "featured-vehicles" || type === "latest-arrivals") return { ...base, limit: 6 };
  if (type === "hero") return { ...base, showSearch: true };
  if (type === "why-choose-us") return { ...base, items: [] };
  return base;
}
