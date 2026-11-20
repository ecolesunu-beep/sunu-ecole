"use client";
import { readSession, sessionRequest } from "@/lib/tab-session";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try { response = await sessionRequest(path, { ...init, signal: init.signal || AbortSignal.timeout(20000) }); }
  catch (cause) {
    if (init.signal?.aborted) throw cause;
    if (cause instanceof Error && ["AbortError", "TimeoutError"].includes(cause.name)) throw new Error("Le serveur met trop de temps à répondre. Réessayez dans un instant.");
    throw new Error("Connexion au serveur interrompue. Vérifiez votre connexion, puis réessayez.");
  }
  if (!response.ok) {
    let message = response.status === 401 ? "Connectez-vous pour retrouver votre école." : "Le serveur ne peut pas traiter cette demande. Réessayez.";
    try { const body = await response.json(); if (body.code === "SESSION_REQUIRED" && readSession()) message = "L’accès à votre école n’a pas pu être rétabli dans cet aperçu. Votre session est conservée."; else if (typeof body.error === "string") message = body.error; } catch { /* Non-JSON gateway error. */ }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response;
}
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("La réponse du serveur est incomplète. Rouvrez la page depuis la prévisualisation.");
  return response.json() as Promise<T>;
}
export const jsonRequest = (method: "POST" | "PATCH" | "DELETE", data?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });

/** The caller revokes this object URL when the image is replaced or unmounted. */
export async function privatePhoto(id: string, signal?: AbortSignal) {
  const signed = await apiJson<{ url: string }>(`/api/data/pieces-jointes?id=${encodeURIComponent(id)}&url=1`, { signal });
  const response = await apiFetch(signed.url, { signal });
  const image = await response.blob();
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) throw new Error("Cette image n’est pas disponible.");
  return URL.createObjectURL(image);
}

/** Fetch-based SSE supports Authorization headers; native EventSource does not. */
export function watchSchoolChanges(onChange: () => void) {
  const controller = new AbortController();
  let retry: number | undefined;
  async function connect() {
    try {
      const response = await sessionRequest("/api/events", { headers: { Accept: "text/event-stream" }, signal: controller.signal });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      try {
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const parts = pending.split(/\r?\n\r?\n/);
          pending = parts.pop() || "";
          for (const event of parts) if (/^data: \{"changed":true\}$/m.test(event)) onChange();
        }
      } finally { reader.releaseLock(); }
    } catch { /* The authenticated four-second poll also keeps this workspace current. */ }
    finally { if (!controller.signal.aborted && readSession()) retry = window.setTimeout(connect, 4000); }
  }
  void connect();
  return () => { controller.abort(); if (retry !== undefined) window.clearTimeout(retry); };
}
