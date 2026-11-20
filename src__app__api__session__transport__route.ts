import { NextRequest } from "next/server";
import { GET as readAccount, POST as writeAccount } from "@/app/api/auth/[action]/route";
import { GET as readData, POST as createData, PATCH as updateData, DELETE as deleteData } from "@/app/api/data/[resource]/route";
import { GET as listen } from "@/app/api/events/route";
import { originAllowed } from "@/lib/security";
import { SESSION_TOKEN_PATTERN, transportTarget } from "@/lib/session-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dataHandlers = { GET: readData, POST: createData, PATCH: updateData, DELETE: deleteData };
const maxJson = 1024 * 1024;
const maxUpload = 6 * 1024 * 1024;
const cacheControl = "private, no-store, no-transform";
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": cacheControl } });
class PayloadTooLarge extends Error {}

async function readPayload(request: Request, limit: number) {
  const advertised = request.headers.get("content-length");
  if (advertised && Number(advertised) > limit) throw new PayloadTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new PayloadTooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return buffer;
}

/**
 * Some preview reverse proxies reserve or remove Authorization. This internal
 * entry accepts the same verified bearer in a POST body and dispatches only to
 * the application's allowlisted handlers. It never fetches a supplied URL.
 */
export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail("Origine non autorisée.", 403);
  const contentType = request.headers.get("content-type") || "";
  const upload = /^multipart\/form-data\s*;/i.test(contentType);
  if (!upload && !/^application\/json(?:\s*;|$)/i.test(contentType)) return fail("Format de requête non pris en charge.", 415);

  let message: unknown, file: File | null = null;
  try {
    const bytes = await readPayload(request, upload ? maxUpload : maxJson);
    if (upload) {
      const form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
      const descriptor = form.get("request"), attachment = form.get("file");
      if (typeof descriptor !== "string" || descriptor.length > 8192 || !(attachment instanceof File) || form.getAll("file").length !== 1) return fail("Transfert de fichier invalide.", 400);
      message = JSON.parse(descriptor);
      file = attachment;
    } else message = JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    return cause instanceof PayloadTooLarge ? fail("Le fichier ou la requête dépasse la taille autorisée.", 413) : fail("Requête de session illisible.", 400);
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) return fail("Requête de session invalide.", 400);
  const { path, method, token, query, data } = message as Record<string, unknown>;
  const target = transportTarget(path, method);
  if (!target || typeof query !== "string" || query.length > 4096) return fail("Cette route n’est pas disponible par ce canal.", 400);
  if (typeof token !== "string" || !SESSION_TOKEN_PATTERN.test(token)) return Response.json({ code: "SESSION_REQUIRED", error: "Une session est nécessaire pour accéder à cette rubrique." }, { status: 401, headers: { "Cache-Control": cacheControl } });
  if (Boolean(file) !== (target.path === "/api/data/pieces-jointes" && target.method === "POST")) return fail("Transfert de fichier invalide.", 400);

  const url = new URL(target.path, request.url);
  url.search = new URLSearchParams(query).toString();
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  // Copy only server-side request metadata, never user-supplied forwarded headers from the body.
  for (const name of ["origin", "host", "x-forwarded-host", "x-real-ip", "x-forwarded-for", "sec-fetch-site", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: FormData | string | undefined;
  if (file) { body = new FormData(); body.append("file", file, file.name); }
  else if (target.method !== "GET" && data !== undefined) { body = JSON.stringify(data); headers.set("Content-Type", "application/json"); }

  try {
    const forwarded = new NextRequest(url, { method: target.method, headers, body, signal: request.signal });
    let response: Response;
    if (target.path === "/api/events") response = await listen(forwarded);
    else if (target.path.startsWith("/api/auth/")) response = await (target.method === "GET" ? readAccount : writeAccount)(forwarded, { params: Promise.resolve({ action: target.path.slice(10) }) });
    else response = await dataHandlers[target.method](forwarded, { params: Promise.resolve({ resource: target.path.slice(10) }) });
    const protectedHeaders = new Headers(response.headers);
    protectedHeaders.set("Cache-Control", cacheControl);
    return new Response(response.body, { status: response.status, headers: protectedHeaders });
  } catch {
    // In particular, don't log envelopes containing credentials or school records.
    return fail("Le service de votre école est momentanément indisponible.", 503);
  }
}
