/**
 * Server-only backend client.
 *
 * Server Components and Route Handlers call Django directly over the
 * internal docker network (fast, no extra hop, backend URL never reaches
 * the browser). Client Components never import this file — they call
 * Next.js Route Handlers under app/api/*, which use this module on the
 * server to do the actual authenticated request.
 */
import "server-only";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
export const TOKEN_COOKIE = "vantage_token";
export const REFRESH_COOKIE = "vantage_refresh";

// Mirror SIMPLE_JWT's ACCESS_TOKEN_LIFETIME / REFRESH_TOKEN_LIFETIME.
export const ACCESS_MAX_AGE = 60 * 60 * 8;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Carries the HTTP status through to error boundaries.
 *
 * Previously every failure was a plain `Error` with the status stringified into
 * the message, so an expired session and a genuine outage were indistinguishable
 * and `error.tsx` had no way to offer "sign in again" for one and "try again"
 * for the other.
 */
export class BackendError extends Error {
  readonly status: number;
  readonly body: string;
  readonly path: string;

  constructor(path: string, status: number, body: string) {
    super(`Backend ${path} failed: ${status} ${body}`);
    this.name = "BackendError";
    this.status = status;
    this.body = body;
    this.path = path;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

export async function getServerToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}

export async function backendFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getServerToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new BackendError(path, res.status, await res.text());
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Like backendFetch, but returns a fallback instead of throwing.
 *
 * Dashboard pages fetch several independent panels at once; one empty panel is
 * a far better outcome than the whole page collapsing into an error boundary
 * because a single endpoint hiccuped.
 */
export async function backendFetchSafe<T>(
  path: string,
  fallback: T,
  init: RequestInit = {}
): Promise<T> {
  try {
    return await backendFetch<T>(path, init);
  } catch (error) {
    if (error instanceof BackendError && error.isAuthError) throw error;
    console.error(`backendFetchSafe: ${path} failed, using fallback`, error);
    return fallback;
  }
}

export async function login(username: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data as { access: string; refresh: string };
}

export type RegisterResult =
  | { ok: true; tokens: { access: string; refresh: string } }
  | { ok: false; status: number; detail: string };

/**
 * Unlike login, which is pass/fail, registration can fail for reasons the
 * person can act on — username taken, password too weak — so the specific
 * messages Django produced are carried back rather than flattened to
 * "something went wrong".
 */
export async function register(
  username: string,
  email: string,
  password: string
): Promise<RegisterResult> {
  const res = await fetch(`${BACKEND_URL}/api/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, tokens: data };
  return { ok: false, status: res.status, detail: flattenErrors(data) };
}

/**
 * DRF answers field errors as {field: [msg, ...]} but throttling and other
 * generic failures as {detail: "..."} — and a single weak password can trip
 * several validators at once, so every message is kept, not just the first.
 */
function flattenErrors(data: unknown): string {
  if (!data || typeof data !== "object") return "Could not create the account.";
  const record = data as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;

  const messages = Object.values(record)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string");

  return messages.length > 0 ? messages.join(" ") : "Could not create the account.";
}

export async function refreshAccess(refreshToken: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as { access: string };
}
