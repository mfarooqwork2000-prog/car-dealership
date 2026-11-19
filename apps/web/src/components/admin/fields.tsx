/* eslint-disable @typescript-eslint/no-explicit-any */
import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { api } from "@/services/api";

/** Image URL field with direct upload to the media library. */
export function ImageField({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const pick = async (f?: File) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 8 * 1024 * 1024) return toast("error", "Use a JPEG, PNG or WebP under 8 MB");
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("files", f);
      const [m] = await api.upload<{ url: string }[]>("/admin/cms/media", fd);
      onChange(m.url);
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <Field label={label}>
      <div className="space-y-2">
        <div className="flex gap-2"><Input value={value ?? ""} placeholder="https://… or upload" onChange={(e) => onChange(e.target.value)} /><input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} /><Button type="button" variant="outline" loading={busy} onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />Upload</Button></div>
        {value && <div className="relative inline-block"><img src={value} alt="" className="h-20 rounded border border-ink/10 object-cover" /><button type="button" aria-label="Remove image" className="absolute -right-2 -top-2 rounded-full bg-red-600 p-0.5 text-white" onClick={() => onChange("")}><X className="h-3 w-3" /></button></div>}
      </div>
    </Field>
  );
}

export interface FieldDef { name: string; label: string; kind?: "text" | "textarea" | "number" | "image" | "link" | "toggle" | "select" | "items" | "html"; options?: string[]; required?: boolean; hint?: string; itemFields?: FieldDef[] }

/** Renders a form from a field definition list. Drives both CMS section editors and simple-collection managers. */
export function DynamicFields({ fields, value, onChange }: { fields: FieldDef[]; value: any; onChange: (v: any) => void }) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const v = value?.[f.name];
        switch (f.kind) {
          case "textarea": case "html": return <Field key={f.name} label={f.label} hint={f.kind === "html" ? "HTML allowed (headings, paragraphs, lists, links)" : f.hint} required={f.required}><Textarea rows={f.kind === "html" ? 10 : 4} value={v ?? ""} onChange={(e) => set(f.name, e.target.value)} className={f.kind === "html" ? "font-mono text-xs" : ""} /></Field>;
          case "number": return <Field key={f.name} label={f.label} required={f.required}><Input type="number" value={v ?? ""} onChange={(e) => set(f.name, e.target.value === "" ? undefined : Number(e.target.value))} /></Field>;
          case "image": return <ImageField key={f.name} label={f.label} value={v} onChange={(x) => set(f.name, x)} />;
          case "toggle": return <label key={f.name} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v} onChange={(e) => set(f.name, e.target.checked)} />{f.label}</label>;
          case "select": return <Field key={f.name} label={f.label}><Select value={v ?? ""} onChange={(e) => set(f.name, e.target.value)}>{f.options!.map((o) => <option key={o}>{o}</option>)}</Select></Field>;
          case "link": return <fieldset key={f.name} className="rounded border border-ink/10 p-3"><legend className="px-1 text-sm font-medium">{f.label}</legend><div className="grid gap-3 sm:grid-cols-2"><Field label="Button label"><Input value={v?.label ?? ""} onChange={(e) => set(f.name, e.target.value ? { ...v, label: e.target.value, url: v?.url ?? "" } : undefined)} /></Field><Field label="Link (e.g. /inventory)"><Input value={v?.url ?? ""} onChange={(e) => set(f.name, { label: v?.label ?? "", url: e.target.value })} /></Field></div></fieldset>;
          case "items": {
            const items: any[] = v ?? [];
            return (
              <fieldset key={f.name} className="space-y-3 rounded border border-ink/10 p-3"><legend className="px-1 text-sm font-medium">{f.label}</legend>
                {items.map((it, i) => <div key={i} className="relative rounded bg-ink/[.03] p-3"><button type="button" aria-label="Remove item" className="absolute right-2 top-2 text-ink/50 hover:text-red-600" onClick={() => set(f.name, items.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button><DynamicFields fields={f.itemFields!} value={it} onChange={(nv) => set(f.name, items.map((x, j) => (j === i ? nv : x)))} /></div>)}
                <Button type="button" size="sm" variant="outline" onClick={() => set(f.name, [...items, {}])}>Add item</Button>
              </fieldset>
            );
          }
          default: return <Field key={f.name} label={f.label} required={f.required} hint={f.hint}><Input value={v ?? ""} onChange={(e) => set(f.name, e.target.value)} /></Field>;
        }
      })}
    </div>
  );
}

const headings: FieldDef[] = [{ name: "heading", label: "Heading", required: true }, { name: "subheading", label: "Eyebrow / subheading" }];
/** Editor field definitions per section type — keep in step with SECTION_SCHEMAS in @cd/shared. */
export const SECTION_FIELDS: Record<string, FieldDef[]> = {
  hero: [...headings, { name: "imageUrl", label: "Background image", kind: "image" }, { name: "primaryCta", label: "Primary button", kind: "link" }, { name: "secondaryCta", label: "Secondary button", kind: "link" }, { name: "showSearch", label: "Show vehicle search box", kind: "toggle" }],
  "featured-vehicles": [...headings, { name: "limit", label: "Number of vehicles (1–12)", kind: "number" }],
  "latest-arrivals": [...headings, { name: "limit", label: "Number of vehicles (1–12)", kind: "number" }],
  categories: headings, testimonials: headings, services: headings, faq: headings, "contact-info": headings,
  "why-choose-us": [...headings, { name: "items", label: "Benefits", kind: "items", itemFields: [{ name: "title", label: "Title" }, { name: "description", label: "Description", kind: "textarea" }, { name: "icon", label: "Icon", kind: "select", options: ["shield-check", "banknote", "award", "star", "clock", "repeat", "umbrella"] }] }],
  "info-cta": [...headings.slice(0, 1), { name: "body", label: "Text", kind: "textarea" }, { name: "imageUrl", label: "Background image", kind: "image" }, { name: "cta", label: "Button", kind: "link" }, { name: "variant", label: "Style", kind: "select", options: ["generic", "financing", "trade-in"] }],
  "rich-text": [{ name: "heading", label: "Heading" }, { name: "html", label: "Content", kind: "html", required: true }],
};
