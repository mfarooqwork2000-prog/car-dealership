export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { fieldErrors?: Record<string, string[]> }) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<(t: string | null) => void>();
export const setAccessToken = (t: string | null) => { accessToken = t; listeners.forEach((l) => l(t)); };
export const getAccessToken = () => accessToken;
export const onTokenChange = (fn: (t: string | null) => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export type Envelope<T> = { success: true; data: T; meta?: Record<string, any> } | { success: false; error: { code: string; message: string; details?: any } };

async function refresh(): Promise<string | null> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then(async (r) => {
      if (!r.ok) return null;
      const j = await r.json();
      setAccessToken(j.data.accessToken);
      return j.data.accessToken as string;
    })
    .catch(() => null)
    .finally(() => { refreshing = null; });
  return refreshing;
}
export const tryRefresh = refresh;

async function raw<T>(path: string, init: RequestInit & { json?: unknown; retry?: boolean } = {}): Promise<{ data: T; meta?: Record<string, any> }> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: "include", body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  if (res.status === 401 && init.retry !== false && accessToken && !path.startsWith("/auth/")) {
    const t = await refresh();
    if (t) return raw<T>(path, { ...init, retry: false });
    setAccessToken(null);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    if (!res.ok) throw new ApiError(res.status, "HTTP_ERROR", res.statusText);
    return { data: (await res.blob()) as unknown as T };
  }
  const body = (await res.json()) as Envelope<T>;
  if (!body.success) throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  return { data: body.data, meta: body.meta };
}

export const api = {
  get: <T>(p: string) => raw<T>(p).then((r) => r.data),
  list: <T>(p: string) => raw<T[]>(p),
  post: <T>(p: string, json?: unknown) => raw<T>(p, { method: "POST", json: json ?? {} }).then((r) => r.data),
  put: <T>(p: string, json?: unknown) => raw<T>(p, { method: "PUT", json: json ?? {} }).then((r) => r.data),
  patch: <T>(p: string, json?: unknown) => raw<T>(p, { method: "PATCH", json: json ?? {} }).then((r) => r.data),
  del: <T>(p: string) => raw<T>(p, { method: "DELETE" }).then((r) => r.data),
  upload: <T>(p: string, form: FormData) => raw<T>(p, { method: "POST", body: form }).then((r) => r.data),
  blob: (p: string) => raw<Blob>(p).then((r) => r.data),
};

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
