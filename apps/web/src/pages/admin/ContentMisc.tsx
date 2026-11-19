/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { slugify } from "@cd/shared";
import { Badge, Button, Card, CardHeader, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, PageSpinner, Select, Textarea, useToast } from "@/components/ui";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { ImageField } from "@/components/admin/fields";
import { useAuth } from "@/features/auth";
import { api } from "@/services/api";
import { dateShort, titleCase } from "@/services/format";

// ═════════ Navigation ═════════
type NavNode = { label: string; url: string; isVisible: boolean; openInNewTab: boolean; children: { label: string; url: string }[] };
export function NavigationEditor() {
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState("header");
  const [items, setItems] = useState<NavNode[] | null>(null);
  const q = useQuery({ queryKey: ["cms-nav"], queryFn: () => api.get<any[]>("/admin/cms/navigation") });
  const menu = q.data?.find((m) => m.key === key);
  const current: NavNode[] = items ?? (menu ? menu.items.filter((i: any) => !i.parentId).map((i: any) => ({ label: i.label, url: i.url, isVisible: i.isVisible, openInNewTab: i.openInNewTab, children: menu.items.filter((c: any) => c.parentId === i.id).map((c: any) => ({ label: c.label, url: c.url })) })) : []);
  const write = can("cms:write");
  const save = useMutation({ mutationFn: () => api.put(`/admin/cms/navigation/${key}`, { items: current }), onSuccess: () => { toast("success", "Navigation saved"); setItems(null); qc.invalidateQueries({ queryKey: ["cms-nav"] }); qc.invalidateQueries({ queryKey: ["site"] }); }, onError: (e: Error) => toast("error", e.message.includes("Validation") ? "Check that every item has a label and a valid link (starting with / or https://)" : e.message) });
  const upd = (i: number, patch: Partial<NavNode>) => setItems(current.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => { const n = [...current]; [n[i], n[i + d]] = [n[i + d], n[i]]; setItems(n); };
  if (q.isLoading) return <PageSpinner />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Navigation</h1><p className="text-sm text-ink/60">Edit the header and footer menus. Drop-down children appear under their parent in the header.</p></div>
        <div className="flex gap-2"><Select aria-label="Menu" className="w-36" value={key} onChange={(e) => { setKey(e.target.value); setItems(null); }}><option value="header">Header menu</option><option value="footer">Footer menu</option></Select>{write && <Button variant="accent" loading={save.isPending} disabled={!items} onClick={() => save.mutate()}>Save menu</Button>}</div></div>
      <Card className="divide-y divide-ink/5">
        {current.map((it, i) => (
          <div key={i} className="space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Label" className="w-44"><Input value={it.label} disabled={!write} onChange={(e) => upd(i, { label: e.target.value })} /></Field>
              <Field label="Link" className="min-w-48 flex-1"><Input value={it.url} disabled={!write} onChange={(e) => upd(i, { url: e.target.value })} /></Field>
              <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" checked={it.isVisible} disabled={!write} onChange={(e) => upd(i, { isVisible: e.target.checked })} />Visible</label>
              <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" checked={it.openInNewTab} disabled={!write} onChange={(e) => upd(i, { openInNewTab: e.target.checked })} />New tab</label>
              {write && <div className="flex pb-0.5"><Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Move down" disabled={i === current.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => setItems(current.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>}
            </div>
            {key === "header" && <div className="ml-6 space-y-2 border-l-2 border-ink/10 pl-4">
              {it.children.map((c, ci) => <div key={ci} className="flex flex-wrap items-center gap-2"><Input aria-label="Child label" className="w-40" placeholder="Label" value={c.label} disabled={!write} onChange={(e) => upd(i, { children: it.children.map((x, j) => (j === ci ? { ...x, label: e.target.value } : x)) })} /><Input aria-label="Child link" className="min-w-40 flex-1" placeholder="/link" value={c.url} disabled={!write} onChange={(e) => upd(i, { children: it.children.map((x, j) => (j === ci ? { ...x, url: e.target.value } : x)) })} />{write && <Button variant="ghost" size="icon" aria-label="Remove child" onClick={() => upd(i, { children: it.children.filter((_, j) => j !== ci) })}><Trash2 className="h-4 w-4" /></Button>}</div>)}
              {write && <Button size="sm" variant="ghost" onClick={() => upd(i, { children: [...it.children, { label: "", url: "/" }] })}><Plus className="h-3 w-3" />Add drop-down link</Button>}
            </div>}
          </div>
        ))}
        {!current.length && <EmptyState title="No menu items" />}
      </Card>
      {write && <Button variant="outline" onClick={() => setItems([...current, { label: "New link", url: "/", isVisible: true, openInNewTab: false, children: [] }])}><Plus className="h-4 w-4" />Add menu item</Button>}
    </div>
  );
}

// ═════════ Blog ═════════
export function BlogManager() {
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const q = useQuery({ queryKey: ["cms-blog", page], queryFn: () => api.list<any>(`/admin/cms/blog?page=${page}`) });
  const done = (m: string) => { toast("success", m); qc.invalidateQueries({ queryKey: ["cms-blog"] }); };
  const save = useMutation({ mutationFn: (p: any) => { const body = { title: p.title, slug: p.slug || slugify(p.title), excerpt: p.excerpt || null, body: p.body, coverUrl: p.coverUrl || null, status: p.status }; return p.id ? api.put(`/admin/cms/blog/${p.id}`, body) : api.post("/admin/cms/blog", body); }, onSuccess: () => { setEditing(null); done("Post saved"); }, onError: (e: Error) => toast("error", e.message) });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/cms/blog/${id}`), onSuccess: () => { setDel(null); done("Post deleted"); }, onError: (e: Error) => toast("error", e.message) });
  const write = can("cms:write");
  const cols: Column<any>[] = [
    { key: "t", header: "Title", cell: (p) => <div><p className="font-medium">{p.title}</p><p className="text-xs text-ink/50">/blog/{p.slug}</p></div> },
    { key: "s", header: "Status", cell: (p) => <Badge tone={p.status === "PUBLISHED" ? "green" : "amber"}>{titleCase(p.status)}</Badge> },
    { key: "d", header: "Published", cell: (p) => (p.publishedAt ? dateShort(p.publishedAt) : "—") },
    { key: "a", header: "", className: "text-right", cell: (p) => write ? <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setDel(p)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div> : null },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Blog / News</h1><p className="text-sm text-ink/60">Publish articles, news and buying guides.</p></div>{write && <Button variant="accent" onClick={() => setEditing({ status: "DRAFT", title: "", body: "" })}><Plus className="h-4 w-4" />New post</Button>}</div>
      <Card><DataTable columns={cols} rows={q.data?.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} emptyTitle="No posts yet" /><Pagination page={page} totalPages={(q.data?.meta?.totalPages as number) ?? 1} onPage={setPage} /></Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? "Edit post" : "New post"} wide>
        {editing && <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
          <Field label="Title" required><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
          {!editing.id && <Field label="URL slug" hint="Auto-generated from the title if blank"><Input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} /></Field>}
          <Field label="Excerpt"><Textarea rows={2} value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} /></Field>
          <ImageField label="Cover image" value={editing.coverUrl} onChange={(v) => setEditing({ ...editing, coverUrl: v })} />
          <Field label="Content (HTML)" required><Textarea rows={10} className="font-mono text-xs" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></Field>
          <Field label="Status"><Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></Select></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="accent" disabled={!editing.title || !editing.body} loading={save.isPending}>Save</Button></div>
        </form>}
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} danger title="Delete post?" description={`"${del?.title}" will be permanently deleted.`} confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del.id)} />
    </div>
  );
}

// ═════════ Media library ═════════
export function MediaLibrary() {
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [del, setDel] = useState<any>(null);
  const q = useQuery({ queryKey: ["cms-media", page], queryFn: () => api.list<any>(`/admin/cms/media?page=${page}&limit=24`) });
  const done = () => qc.invalidateQueries({ queryKey: ["cms-media"] });
  const upload = useMutation({ mutationFn: (files: File[]) => { const fd = new FormData(); files.forEach((f) => fd.append("files", f)); return api.upload("/admin/cms/media", fd); }, onSuccess: () => { toast("success", "Uploaded"); done(); }, onError: (e: Error) => toast("error", e.message) });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/cms/media/${id}`), onSuccess: () => { setDel(null); toast("success", "Deleted"); done(); }, onError: (e: Error) => toast("error", e.message) });
  const onFiles = (l: FileList | null) => {
    if (!l?.length) return;
    const bad = [...l].find((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 8 * 1024 * 1024);
    if (bad) return toast("error", `"${bad.name}" must be JPEG, PNG or WebP under 8 MB`);
    upload.mutate([...l]); if (file.current) file.current.value = "";
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl">Media Library</h1><p className="text-sm text-ink/60">Upload images and copy their URLs for use anywhere in the CMS.</p></div>{can("media:write") && <><input ref={file} type="file" multiple hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => onFiles(e.target.files)} /><Button variant="accent" loading={upload.isPending} onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Upload images</Button></>}</div>
      {q.isLoading ? <PageSpinner /> : q.error ? <ErrorState error={q.error} /> : !q.data?.data.length ? <Card><EmptyState title="No media yet" description="Upload your first image." /></Card> : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{q.data.data.map((m: any) => (
          <Card key={m.id} className="overflow-hidden"><img src={m.url} alt={m.filename} loading="lazy" className="aspect-square w-full object-cover" /><div className="space-y-1 p-2"><p className="truncate text-xs" title={m.filename}>{m.filename}</p><div className="flex justify-between"><Button size="sm" variant="ghost" aria-label="Copy URL" onClick={() => { navigator.clipboard?.writeText(m.url.startsWith("http") ? m.url : `${window.location.origin}${m.url}`); toast("success", "URL copied"); }}><Copy className="h-3 w-3" /></Button>{can("media:write") && <Button size="sm" variant="ghost" aria-label="Delete image" onClick={() => setDel(m)}><Trash2 className="h-3 w-3 text-red-600" /></Button>}</div></div></Card>))}</div>
      )}
      <Pagination page={page} totalPages={(q.data?.meta?.totalPages as number) ?? 1} onPage={setPage} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} danger title="Delete image?" description="Pages still referencing this image will show a broken image." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(del.id)} />
    </div>
  );
}
export { CardHeader };
