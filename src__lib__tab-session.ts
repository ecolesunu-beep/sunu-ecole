"use client";
import { SESSION_TOKEN_PATTERN, SESSION_TRANSPORT_PATH, transportTarget, type TransportTarget } from "@/lib/session-transport";

// Persist only the opaque credential. Names, passwords and school data never
// go into browser storage; the API resolves every permission from PostgreSQL.
const key = "sunu.browser-session.v1";
const legacyKey = "sunu.tab-session.v1";
const valid = (value: unknown): value is string => typeof value === "string" && SESSION_TOKEN_PATTERN.test(value);
let memory: string | null = null;
let loaded = false;
let useTransport = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function readSession(): string | null {
  if (typeof window === "undefined") return null;
  if (!loaded) {
    loaded = true;
    try { const saved = window.localStorage.getItem(key); memory = valid(saved) ? saved : null; } catch { /* Embedded or private browsers can deny storage. */ }
    if (!memory) {
      try {
        const saved = window.sessionStorage.getItem(key) || window.sessionStorage.getItem(legacyKey);
        if (valid(saved)) {
          memory = saved;
          try { window.localStorage.setItem(key, saved); window.sessionStorage.removeItem(key); window.sessionStorage.removeItem(legacyKey); } catch { /* Same-tab fallback. */ }
        }
      } catch { /* In-memory fallback. */ }
    }
    window.addEventListener("storage", (event) => {
      if (event.key !== key && event.key !== null) return;
      const replacement = valid(event.newValue) ? event.newValue : null;
      if (replacement === memory) return;
      memory = replacement;
      try { window.sessionStorage.removeItem(key); window.sessionStorage.removeItem(legacyKey); } catch { /* No older fallback to revive. */ }
      notify();
    });
  }
  return memory;
}
export function saveSession(token: unknown) {
  if (!valid(token)) throw new Error("La connexion n’a pas pu être établie. Réessayez.");
  readSession(); memory = token;
  try { window.localStorage.setItem(key, token); } catch { try { window.sessionStorage.setItem(key, token); } catch { /* Keep the current page usable. */ } }
  notify();
}
export function clearSession(expected?: string) {
  if (expected && readSession() !== expected) return;
  readSession(); memory = null;
  try { window.localStorage.removeItem(key); } catch { /* Not available. */ }
  try { window.sessionStorage.removeItem(key); window.sessionStorage.removeItem(legacyKey); } catch { /* Not available. */ }
  notify();
}
export function onSessionChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

function transportPayload(target: TransportTarget, url: URL, token: string, init: RequestInit): { headers?: HeadersInit; body: BodyInit } | null {
  const descriptor = { ...target, token, query: url.search.slice(1) };
  if (init.body instanceof FormData) {
    if (target.path !== "/api/data/pieces-jointes" || target.method !== "POST") return null;
    const file = init.body.get("file");
    if (!(file instanceof File) || init.body.getAll("file").length !== 1) return null;
    const upload = new FormData(); upload.set("request", JSON.stringify(descriptor)); upload.set("file", file, file.name);
    return { body: upload };
  }
  if (init.body != null && typeof init.body !== "string") return null;
  try {
    const data: unknown = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    return { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...descriptor, data }) };
  } catch { return null; }
}
async function sessionCode(response: Response) {
  if (response.status !== 401 || !response.headers.get("content-type")?.includes("application/json")) return null;
  return (await response.clone().json().catch(() => null))?.code ?? null;
}

/** The credential is sent only to same-origin APIs, never in an address or redirect. */
export async function sessionRequest(path: string, init: RequestInit = {}) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || url.username || url.password) throw new Error("Adresse de service non valide.");
  const token = readSession();
  const options = { credentials: "omit", cache: "no-store", redirect: "error" } as const;
  const headers = new Headers(init.headers);
  headers.delete("Authorization");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const target = transportTarget(url.pathname, (init.method || "GET").toUpperCase());
  const payload = token && target ? transportPayload(target, url, token, init) : null;
  const forward = (body: NonNullable<typeof payload>) => fetch(SESSION_TRANSPORT_PATH, { ...options, method: "POST", signal: init.signal, ...body });
  let response: Response;
  let code: string | null;
  if (useTransport && payload) {
    response = await forward(payload);
    code = await sessionCode(response);
  } else {
    response = await fetch(url, { ...init, ...options, headers });
    code = await sessionCode(response);
    // SESSION_REQUIRED is sent before any handler can change data. Retrying only
    // that precise response doesn't duplicate writes or hide permission errors.
    if (code === "SESSION_REQUIRED" && payload && (readSession() === token || target?.path === "/api/auth/logout")) {
      response = await forward(payload);
      code = await sessionCode(response);
      if (response.ok) useTransport = true;
    }
  }
  // Generic proxy errors never erase a saved session. Only a definitive verdict
  // for the credential that was actually submitted is authoritative.
  if (token && code === "SESSION_INVALID") clearSession(token);
  return response;
}
