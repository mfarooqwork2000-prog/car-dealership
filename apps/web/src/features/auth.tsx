import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setAccessToken, tryRefresh } from "@/services/api";
import type { AuthUser } from "@/services/types";
import { PageSpinner } from "@/components/ui";

interface Ctx { user: AuthUser | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; can: (...p: string[]) => boolean }
const AuthCtx = createContext<Ctx>(null as never);
/** Non-sensitive "has signed in before" flag (the real credential is the httpOnly refresh cookie). */
const hint = {
  get: () => { try { return localStorage.getItem("cd_signed_in") === "1"; } catch { return false; } },
  set: (v: boolean) => { try { v ? localStorage.setItem("cd_signed_in", "1") : localStorage.removeItem("cd_signed_in"); } catch { /* storage unavailable */ } },
};
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore a session from the httpOnly refresh cookie (admin routes only need this; harmless on public pages).
    // Only try when this browser has previously signed in, so public visitors never hit the auth endpoints.
    (async () => {
      try {
        if (hint.get() && (await tryRefresh())) setUser(await api.get<AuthUser>("/auth/me"));
        else hint.set(false);
      } catch {
        hint.set(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ accessToken: string }>("/auth/login", { email, password });
    setAccessToken(r.accessToken);
    hint.set(true);
    setUser(await api.get<AuthUser>("/auth/me"));
  }, []);
  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } finally { setAccessToken(null); setUser(null); hint.set(false); }
  }, []);
  const value = useMemo<Ctx>(() => ({ user, loading, login, logout, can: (...p) => !!user && p.some((x) => user.permissions.includes(x)) }), [user, loading, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** Route guard. `permission` = any-of; failing a permission shows 403, not a redirect loop. */
export function RequireAuth({ children, permission }: { children: ReactNode; permission?: string[] }) {
  const { user, loading, can } = useAuth();
  const loc = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />;
  if (permission && !can(...permission)) return <div className="p-10 text-center"><h2 className="font-heading text-2xl">Access denied</h2><p className="mt-2 text-ink/60">Your role does not have permission to view this page.</p></div>;
  return <>{children}</>;
}
