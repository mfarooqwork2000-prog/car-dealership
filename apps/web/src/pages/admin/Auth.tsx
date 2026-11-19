import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@cd/shared";
import { useState, type ReactNode } from "react";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/features/auth";
import { Seo } from "@/features/site";
import { api } from "@/services/api";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-secondary px-4">
      <Seo title={title} noindex />
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl"><p className="eyebrow">Dealer Admin</p><h1 className="mb-6 mt-1 text-3xl">{title}</h1>{children}</div>
    </div>
  );
}

export function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<string | null>(null);
  const f = useForm<{ email: string; password: string }>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to="/admin" replace />;
  return (
    <Shell title="Sign in">
      <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => { setError(null); try { await login(v.email, v.password); nav((loc.state as { from?: string })?.from ?? "/admin", { replace: true }); } catch (e) { setError((e as Error).message); } })}>
        <Field label="Email" error={f.formState.errors.email?.message}><Input type="email" autoComplete="username" {...f.register("email")} /></Field>
        <Field label="Password" error={f.formState.errors.password?.message}><Input type="password" autoComplete="current-password" {...f.register("password")} /></Field>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={f.formState.isSubmitting}>Sign in</Button>
        <p className="text-center text-sm"><Link to="/admin/forgot-password" className="text-accent hover:underline">Forgot your password?</Link></p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const f = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema) });
  return (
    <Shell title="Reset password">
      {sent ? <p role="status" className="text-sm text-ink/70">If that account exists, a reset link has been sent. Check your inbox.</p> : (
        <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => { await api.post("/auth/forgot-password", v); setSent(true); })}>
          <Field label="Email" error={f.formState.errors.email?.message}><Input type="email" {...f.register("email")} /></Field>
          <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Send reset link</Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm"><Link to="/admin/login" className="text-accent hover:underline">Back to sign in</Link></p>
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const f = useForm<{ token: string; password: string }>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token: sp.get("token") ?? "", password: "" } });
  return (
    <Shell title="Choose a new password">
      <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => { try { await api.post("/auth/reset-password", v); nav("/admin/login"); } catch (e) { setError((e as Error).message); } })}>
        <Field label="New password" hint="10+ characters with upper, lower and a number" error={f.formState.errors.password?.message}><Input type="password" autoComplete="new-password" {...f.register("password")} /></Field>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Update password</Button>
      </form>
    </Shell>
  );
}
