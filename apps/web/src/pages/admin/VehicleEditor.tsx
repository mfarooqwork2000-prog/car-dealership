/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GripVertical, Star, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { vehicleInputSchema } from "@cd/shared";
import { Badge, Button, Card, CardHeader, Field, Input, PageSpinner, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/services/api";
import { cn } from "@/services/format";
import type { Vehicle } from "@/services/types";

const BODY = ["SUV", "Sedan", "Truck", "Coupe", "Hatchback", "Convertible", "Van", "Wagon"];
const FUEL = ["Gasoline", "Diesel", "Hybrid", "Electric", "Plug-in Hybrid"];
const TRANS = ["Automatic", "Manual", "CVT", "PDK", "DCT"];
const DRIVE = ["FWD", "RWD", "AWD", "4WD"];

function ImageManager({ vehicle }: { vehicle: Vehicle }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [images, setImages] = useState(vehicle.images);
  const [drag, setDrag] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setImages(vehicle.images), [vehicle.images]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-vehicle", vehicle.id] });
  const upload = useMutation({
    mutationFn: (files: File[]) => { const fd = new FormData(); files.forEach((f) => fd.append("images", f)); return api.upload(`/admin/vehicles/${vehicle.id}/images`, fd); },
    onSuccess: () => { toast("success", "Images uploaded"); refresh(); }, onError: (e: Error) => toast("error", e.message),
  });
  const order = useMutation({ mutationFn: (ids: string[]) => api.put(`/admin/vehicles/${vehicle.id}/images/order`, { ids }), onSuccess: refresh });
  const primary = useMutation({ mutationFn: (id: string) => api.put(`/admin/vehicles/${vehicle.id}/images/${id}/primary`), onSuccess: () => { toast("success", "Primary image updated"); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/vehicles/${vehicle.id}/images/${id}`), onSuccess: () => { toast("success", "Image removed"); refresh(); } });
  const onFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
    const bad = files.find((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 8 * 1024 * 1024);
    if (bad) return toast("error", `"${bad.name}" must be a JPEG, PNG or WebP under 8 MB`);
    upload.mutate(files);
    if (file.current) file.current.value = "";
  };
  const drop = (targetId: string) => {
    if (!drag || drag === targetId) return;
    const next = [...images];
    const from = next.findIndex((i) => i.id === drag), to = next.findIndex((i) => i.id === targetId);
    next.splice(to, 0, next.splice(from, 1)[0]);
    setImages(next);
    order.mutate(next.map((i) => i.id));
    setDrag(null);
  };
  return (
    <Card>
      <CardHeader title={`Photos (${images.length})`} action={<><input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} /><Button size="sm" variant="outline" loading={upload.isPending} onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Upload</Button></>} />
      <div className="p-4">
        {!images.length && <p className="py-6 text-center text-sm text-ink/50">No photos yet. Upload JPEG, PNG or WebP (max 8 MB each).</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} draggable onDragStart={() => setDrag(img.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(img.id)} className={cn("group relative overflow-hidden rounded-lg border-2", img.isPrimary ? "border-accent" : "border-ink/10", drag === img.id && "opacity-40")}>
              <img src={img.url} alt={img.alt ?? ""} className="aspect-[4/3] w-full object-cover" />
              <div className="absolute left-1 top-1 flex items-center gap-1"><span className="cursor-grab rounded bg-black/60 p-1 text-white" title="Drag to reorder"><GripVertical className="h-3 w-3" /></span>{img.isPrimary && <Badge tone="accent">Primary</Badge>}</div>
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40" disabled={img.isPrimary} onClick={() => primary.mutate(img.id)} aria-label={`Make photo ${i + 1} primary`}><Star className="h-4 w-4" /></button>
                <button type="button" className="rounded p-1 text-white hover:bg-red-600" onClick={() => remove.mutate(img.id)} aria-label={`Delete photo ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
        {images.length > 1 && <p className="mt-3 text-xs text-ink/50">Drag photos to reorder. The first photo (or the one marked primary) is the listing image.</p>}
      </div>
    </Card>
  );
}

function FeatureEditor({ value, onChange }: { value: { name: string; category?: string | null }[]; onChange: (v: { name: string; category?: string | null }[]) => void }) {
  const [text, setText] = useState("");
  const add = () => { const n = text.trim(); if (n && !value.some((f) => f.name.toLowerCase() === n.toLowerCase())) onChange([...value, { name: n }]); setText(""); };
  return (
    <div>
      <div className="flex gap-2"><Input value={text} placeholder="e.g. Heated seats" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} /><Button type="button" variant="outline" onClick={add}>Add</Button></div>
      <div className="mt-3 flex flex-wrap gap-2">{value.map((f) => <span key={f.name} className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-3 py-1 text-sm">{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(value.filter((x) => x.name !== f.name))}><X className="h-3 w-3" /></button></span>)}</div>
    </div>
  );
}

const defaults = { title: "", stockNumber: "", vin: "", makeName: "", modelName: "", year: new Date().getFullYear(), price: 0, mileage: 0, condition: "USED", status: "AVAILABLE", publishStatus: "DRAFT", isFeatured: false, features: [] as any[] };

export default function VehicleEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const v = useQuery({ queryKey: ["admin-vehicle", id], queryFn: () => api.get<Vehicle>(`/admin/vehicles/${id}`), enabled: !isNew });
  const cats = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.get<any[]>("/admin/cms/categories") });
  const f = useForm<any>({ resolver: zodResolver(vehicleInputSchema), defaultValues: defaults });
  const { register, formState: { errors }, watch, setValue, reset } = f;
  useEffect(() => { if (v.data) reset({ ...v.data, makeName: v.data.makeName, modelName: v.data.modelName, features: v.data.features.map((x) => ({ name: x.name, category: x.category })) }); }, [v.data, reset]);
  const save = useMutation({
    mutationFn: (d: any) => (isNew ? api.post<Vehicle>("/admin/vehicles", d) : api.put<Vehicle>(`/admin/vehicles/${id}`, d)),
    onSuccess: (saved) => { toast("success", isNew ? "Vehicle created — now add photos" : "Vehicle saved"); qc.invalidateQueries({ queryKey: ["admin-vehicles"] }); qc.invalidateQueries({ queryKey: ["admin-vehicle", saved.id] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); if (isNew) nav(`/admin/vehicles/${saved.id}`, { replace: true }); },
    onError: (e: Error) => { if (e instanceof ApiError && e.details?.fieldErrors) for (const [k, m] of Object.entries(e.details.fieldErrors)) f.setError(k, { message: m?.[0] }); toast("error", e.message); },
  });
  if (!isNew && v.isLoading) return <PageSpinner />;
  const err = (k: string) => errors[k]?.message as string | undefined;
  const select = (k: string, opts: string[], label: string) => <Field label={label} error={err(k)}><Select {...register(k)}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</Select></Field>;
  const text = (k: string, label: string, props: any = {}) => <Field label={label} error={err(k)} required={props.required}><Input {...props} aria-invalid={!!errors[k]} {...register(k)} /></Field>;
  return (
    <form noValidate onSubmit={f.handleSubmit((d) => save.mutate(d), () => toast("error", "Please fix the highlighted fields"))} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><Button type="button" variant="ghost" size="icon" asChild aria-label="Back"><Link to="/admin/vehicles"><ArrowLeft className="h-5 w-5" /></Link></Button><h1 className="text-3xl">{isNew ? "Add vehicle" : v.data?.title ?? "Edit vehicle"}</h1></div>
        <div className="flex gap-2">{!isNew && v.data && <Button type="button" variant="outline" asChild><a href={`/inventory/${v.data.slug}`} target="_blank" rel="noreferrer">Preview</a></Button>}<Button type="submit" variant="accent" loading={save.isPending}>{isNew ? "Create vehicle" : "Save changes"}</Button></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card><CardHeader title="Basics" /><div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("title", "Listing title", { required: true, placeholder: "2022 Audi Q5 Premium Plus" })}</div>
            {text("makeName", "Make", { required: true, list: "makes" })}{text("modelName", "Model", { required: true })}
            {text("year", "Year", { type: "number", required: true })}{text("trim", "Trim")}
            {text("stockNumber", "Stock number", { required: true })}{text("vin", "VIN", { maxLength: 17 })}
            {text("price", "Price (CAD)", { type: "number", required: true, min: 0 })}{text("salePrice", "Sale price (optional)", { type: "number", min: 0 })}
            {text("mileage", "Mileage (km)", { type: "number", min: 0 })}
            <Field label="Condition"><Select {...register("condition")}><option value="NEW">New</option><option value="USED">Used</option><option value="CERTIFIED">Certified</option></Select></Field>
            <Field label="Category"><Select {...register("categoryId")}><option value="">None</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </div></Card>
          <Card><CardHeader title="Specifications" /><div className="grid gap-4 p-5 sm:grid-cols-2">
            {select("bodyType", BODY, "Body style")}{select("fuelType", FUEL, "Fuel type")}{select("transmission", TRANS, "Transmission")}{select("drivetrain", DRIVE, "Drivetrain")}
            {text("engine", "Engine")}{text("cylinders", "Cylinders", { type: "number" })}{text("horsepower", "Horsepower", { type: "number" })}
            {text("exteriorColor", "Exterior colour")}{text("interiorColor", "Interior colour")}{text("doors", "Doors", { type: "number" })}{text("seats", "Seats", { type: "number" })}
          </div></Card>
          <Card><CardHeader title="Description & history" /><div className="space-y-4 p-5">
            <Field label="Description" error={err("description")}><Textarea rows={6} {...register("description")} /></Field>
            <Field label="Vehicle history notes" error={err("history")}><Textarea rows={3} {...register("history")} /></Field>
          </div></Card>
          <Card><CardHeader title="Features & options" /><div className="p-5"><FeatureEditor value={watch("features") ?? []} onChange={(x) => setValue("features", x, { shouldDirty: true })} /></div></Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Publishing" /><div className="space-y-4 p-5">
            <Field label="Availability"><Select {...register("status")}><option value="AVAILABLE">Available</option><option value="PENDING">Sale pending</option><option value="SOLD">Sold</option><option value="ARCHIVED">Archived</option></Select></Field>
            <Field label="Visibility" hint="Drafts are hidden from the public website."><Select {...register("publishStatus")}><option value="DRAFT">Draft (unpublished)</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></Select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("isFeatured")} />Featured vehicle</label>
          </div></Card>
          {isNew ? <Card className="p-5 text-sm text-ink/60">Save the vehicle first, then you can upload and order photos.</Card> : v.data && <ImageManager vehicle={v.data} />}
        </div>
      </div>
    </form>
  );
}
