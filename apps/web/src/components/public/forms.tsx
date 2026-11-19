import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { financingSchema, generalEnquirySchema, testDriveSchema, tradeInSchema, vehicleEnquirySchema } from "@cd/shared";
import type { z } from "zod";
import { Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { ApiError, api } from "@/services/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyForm = { register: UseFormRegister<any>; errors: FieldErrors<any> };
const err = (e: FieldErrors<any>, k: string) => (e[k]?.message as string | undefined);

function PersonFields({ register, errors }: AnyForm) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First name" required error={err(errors, "firstName")}><Input autoComplete="given-name" aria-invalid={!!errors.firstName} {...register("firstName")} /></Field>
      <Field label="Last name" required error={err(errors, "lastName")}><Input autoComplete="family-name" aria-invalid={!!errors.lastName} {...register("lastName")} /></Field>
      <Field label="Email" required error={err(errors, "email")}><Input type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} /></Field>
      <Field label="Phone" error={err(errors, "phone")}><Input type="tel" autoComplete="tel" {...register("phone")} /></Field>
    </div>
  );
}

/** Generic submit wrapper: validation with the shared zod schema, API call, success/error states. */
function LeadForm<S extends z.ZodTypeAny>({ schema, endpoint, defaults, submitLabel, successTitle, successText, children, onDone }: {
  schema: S; endpoint: string; defaults?: Record<string, unknown>; submitLabel: string; successTitle: string; successText: string; onDone?: () => void;
  children: (f: AnyForm) => ReactNode;
}) {
  const f = useForm<any>({ resolver: zodResolver(schema as any), defaultValues: defaults });
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const submit = f.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post(`/public/leads/${endpoint}`, values);
      setDone(true);
      onDone?.();
    } catch (e) {
      if (e instanceof ApiError && e.details?.fieldErrors) for (const [k, m] of Object.entries(e.details.fieldErrors)) f.setError(k, { message: m?.[0] });
      setServerError((e as Error).message);
    }
  });
  if (done) return (
    <div role="status" className="flex flex-col items-center gap-2 py-8 text-center"><CheckCircle2 className="h-12 w-12 text-emerald-600" /><h3 className="font-heading text-xl font-semibold">{successTitle}</h3><p className="max-w-sm text-sm text-ink/60">{successText}</p></div>
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {children({ register: f.register, errors: f.formState.errors })}
      {serverError && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}
      <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto" loading={f.formState.isSubmitting}>{submitLabel}</Button>
    </form>
  );
}

export const ContactForm = () => (
  <LeadForm schema={generalEnquirySchema} endpoint="general" submitLabel="Send message" successTitle="Message sent" successText="Thanks for reaching out. We'll reply within one business day.">
    {(f) => <><PersonFields {...f} /><Field label="Subject" error={err(f.errors, "subject")}><Input {...f.register("subject")} /></Field><Field label="Message" required error={err(f.errors, "message")}><Textarea rows={5} {...f.register("message")} /></Field></>}
  </LeadForm>
);

export const VehicleEnquiryForm = ({ vehicleId, vehicleTitle, onDone }: { vehicleId: string; vehicleTitle: string; onDone?: () => void }) => (
  <LeadForm schema={vehicleEnquirySchema} endpoint="vehicle" defaults={{ vehicleId, message: `I'm interested in the ${vehicleTitle}.` }} submitLabel="Send enquiry" successTitle="Enquiry sent" successText="A member of our team will contact you shortly." onDone={onDone}>
    {(f) => <><PersonFields {...f} /><Field label="Message" required error={err(f.errors, "message")}><Textarea rows={4} {...f.register("message")} /></Field></>}
  </LeadForm>
);

export const TestDriveForm = ({ vehicleId, onDone }: { vehicleId: string; onDone?: () => void }) => {
  const min = new Date().toISOString().slice(0, 10);
  return (
    <LeadForm schema={testDriveSchema} endpoint="test-drive" defaults={{ vehicleId }} submitLabel="Request test drive" successTitle="Test drive requested" successText="We'll confirm your appointment by phone or email shortly." onDone={onDone}>
      {(f) => (
        <>
          <PersonFields {...f} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred date" required error={err(f.errors, "preferredDate")}><Input type="date" min={min} {...f.register("preferredDate")} /></Field>
            <Field label="Preferred time" error={err(f.errors, "preferredTime")}><Select {...f.register("preferredTime")}><option value="">Any time</option><option>Morning</option><option>Afternoon</option><option>Evening</option></Select></Field>
          </div>
          <Field label="Notes" error={err(f.errors, "message")}><Textarea rows={3} {...f.register("message")} /></Field>
        </>
      )}
    </LeadForm>
  );
};

export const FinancingForm = ({ vehicleId, onDone }: { vehicleId?: string; onDone?: () => void }) => (
  <LeadForm schema={financingSchema} endpoint="financing" defaults={{ vehicleId }} submitLabel="Submit application" successTitle="Application received" successText="Thank you. A finance specialist will review your information and contact you." onDone={onDone}>
    {(f) => (
      <>
        <PersonFields {...f} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employment status" error={err(f.errors, "employmentStatus")}><Select {...f.register("employmentStatus")}><option value="">Select…</option><option>Full-time</option><option>Part-time</option><option>Self-employed</option><option>Retired</option><option>Other</option></Select></Field>
          <Field label="Employer" error={err(f.errors, "employer")}><Input {...f.register("employer")} /></Field>
          <Field label="Annual income (CAD)" error={err(f.errors, "annualIncome")}><Input type="number" min={0} {...f.register("annualIncome")} /></Field>
          <Field label="Monthly housing cost" error={err(f.errors, "monthlyHousing")}><Input type="number" min={0} {...f.register("monthlyHousing")} /></Field>
          <Field label="Down payment" error={err(f.errors, "downPayment")}><Input type="number" min={0} {...f.register("downPayment")} /></Field>
          <Field label="Preferred term" error={err(f.errors, "termMonths")}><Select {...f.register("termMonths")}><option value="">Select…</option>{[36, 48, 60, 72, 84].map((m) => <option key={m} value={m}>{m} months</option>)}</Select></Field>
          <Field label="Credit rating (self-assessed)" error={err(f.errors, "creditRating")}><Select {...f.register("creditRating")}><option value="">Not sure</option><option>Excellent</option><option>Good</option><option>Fair</option><option>Rebuilding</option></Select></Field>
        </div>
        <Field label="Comments" error={err(f.errors, "message")}><Textarea rows={3} {...f.register("message")} /></Field>
        <p className="text-xs text-ink/50">We never perform a credit check without your explicit consent. Your information is used only to arrange financing.</p>
      </>
    )}
  </LeadForm>
);

export const TradeInForm = () => (
  <LeadForm schema={tradeInSchema} endpoint="trade-in" submitLabel="Request valuation" successTitle="Valuation requested" successText="Our appraiser will review your vehicle and reply within one business day.">
    {(f) => (
      <>
        <PersonFields {...f} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Make" required error={err(f.errors, "make")}><Input {...f.register("make")} /></Field>
          <Field label="Model" required error={err(f.errors, "model")}><Input {...f.register("model")} /></Field>
          <Field label="Year" required error={err(f.errors, "year")}><Input type="number" {...f.register("year")} /></Field>
          <Field label="Mileage (km)" required error={err(f.errors, "mileage")}><Input type="number" min={0} {...f.register("mileage")} /></Field>
          <Field label="VIN" error={err(f.errors, "vin")}><Input maxLength={17} {...f.register("vin")} /></Field>
          <Field label="Condition" error={err(f.errors, "condition")}><Select {...f.register("condition")}><option value="">Select…</option><option>Excellent</option><option>Good</option><option>Fair</option><option>Needs work</option></Select></Field>
        </div>
        <Field label="Details (accidents, modifications, service history)" error={err(f.errors, "details")}><Textarea rows={4} {...f.register("details")} /></Field>
      </>
    )}
  </LeadForm>
);

/** Modal wrapper used from the vehicle detail page. */
export function LeadDialog({ kind, vehicle, onClose }: { kind: "enquiry" | "test-drive" | "financing" | null; vehicle: { id: string; title: string }; onClose: () => void }) {
  const titles = { enquiry: "Contact the dealership", "test-drive": "Book a test drive", financing: "Financing enquiry" } as const;
  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()} title={kind ? titles[kind] : ""} description={vehicle.title} wide>
      {kind === "enquiry" && <VehicleEnquiryForm vehicleId={vehicle.id} vehicleTitle={vehicle.title} />}
      {kind === "test-drive" && <TestDriveForm vehicleId={vehicle.id} />}
      {kind === "financing" && <FinancingForm vehicleId={vehicle.id} />}
    </Dialog>
  );
}
