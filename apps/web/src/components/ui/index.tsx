import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from "lucide-react";
import { cloneElement, createContext, forwardRef, isValidElement, useCallback, useContext, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/services/format";

// ───── Button ─────
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn text-sm font-medium transition-all focus-visible:outline disabled:pointer-events-none disabled:opacity-50 active:scale-[.98]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary/90 shadow-sm",
        accent: "bg-accent text-primary hover:brightness-110 shadow-sm font-semibold",
        outline: "border border-ink/20 bg-transparent hover:bg-ink/5",
        ghost: "hover:bg-ink/5",
        danger: "bg-red-600 text-white hover:bg-red-700",
        light: "bg-white text-primary hover:bg-white/90",
        "outline-light": "border border-white/60 text-white hover:bg-white/10",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-7 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; loading?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...p }, ref) => {
  const C = asChild ? Slot : "button";
  return (
    <C ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...p}>
      {asChild ? children : <>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}</>}
    </C>
  );
});
Button.displayName = "Button";
export { buttonVariants };

// ───── Form controls ─────
const control = "w-full rounded-btn border border-ink/20 bg-white px-3 text-sm placeholder:text-ink/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:bg-ink/5 aria-[invalid=true]:border-red-500";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(control, "h-10", className)} {...p} />);
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(control, "min-h-[96px] py-2", className)} {...p} />);
Textarea.displayName = "Textarea";
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} className={cn(control, "h-10 pr-8", className)} {...p}>{children}</select>);
Select.displayName = "Select";

export function Field({ label, error, hint, children, className, required }: { label?: string; error?: string; hint?: string; children: ReactNode; className?: string; required?: boolean }) {
  // Give native controls an explicit accessible name: a wrapping <label> alone would fold a <select>'s option text into it.
  const isControl = isValidElement(children) && (children.type === Input || children.type === Select || children.type === Textarea || children.type === "input" || children.type === "select" || children.type === "textarea");
  const control = isControl && label && !(children.props as Record<string, unknown>)["aria-label"] ? cloneElement(children as ReactElement<Record<string, unknown>>, { "aria-label": label }) : children;
  return (
    <label className={cn("block space-y-1.5", className)}>
      {label && <span className="text-sm font-medium text-ink/80">{label}{required && <span className="text-red-600"> *</span>}</span>}
      {control}
      {hint && !error && <span className="block text-xs text-ink/50">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

// ───── Layout bits ─────
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("rounded-lg border border-ink/10 bg-white shadow-sm", className)} {...p} />;
export const CardHeader = ({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) => (
  <div className={cn("flex items-center justify-between gap-2 border-b border-ink/10 px-5 py-3", className)}><h3 className="font-sans text-sm font-semibold">{title}</h3>{action}</div>
);
const badgeTones = { neutral: "bg-ink/10 text-ink/70", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", blue: "bg-sky-100 text-sky-800", accent: "bg-accent text-primary", dark: "bg-primary text-white" };
export const Badge = ({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTones }) => <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], className)} {...p} />;
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded bg-ink/10", className)} />;
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn("h-5 w-5 animate-spin text-ink/50", className)} aria-label="Loading" />;
export const PageSpinner = () => <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 px-4 py-14 text-center"><Inbox className="h-10 w-10 text-ink/25" /><p className="font-medium">{title}</p>{description && <p className="max-w-sm text-sm text-ink/60">{description}</p>}{action}</div>;
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert" className="flex flex-col items-center gap-2 px-4 py-14 text-center"><AlertCircle className="h-10 w-10 text-red-500" /><p className="font-medium">Something went wrong</p><p className="text-sm text-ink/60">{(error as Error)?.message ?? "Unexpected error"}</p>{retry && <Button variant="outline" onClick={retry}>Try again</Button>}</div>;
}

// ───── Dialog ─────
export function Dialog({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-2xl", wide ? "max-w-2xl" : "max-w-lg")}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div><DialogPrimitive.Title className="font-heading text-xl font-semibold">{title}</DialogPrimitive.Title>{description ? <DialogPrimitive.Description className="mt-1 text-sm text-ink/60">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}</div>
            <DialogPrimitive.Close className="rounded p-1 hover:bg-ink/10" aria-label="Close"><X className="h-5 w-5" /></DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", onConfirm, danger, loading }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel?: string; onConfirm: () => void; danger?: boolean; loading?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="mt-2 flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></div>
    </Dialog>
  );
}

// ───── Toasts ─────
type Toast = { id: number; kind: "success" | "error"; text: string };
const ToastCtx = createContext<{ toast: (kind: Toast["kind"], text: string) => void }>({ toast: () => undefined });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role="status" className={cn("pointer-events-auto flex items-start gap-2 rounded-lg border bg-white p-3 text-sm shadow-lg animate-fade-up", t.kind === "error" ? "border-red-300" : "border-emerald-300")}>
            {t.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
