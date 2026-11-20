import { getAuth, invalidSession } from "@/lib/auth";
import { pool } from "@/db";
import type { PoolClient } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Subscriber = { schoolId: string; notify: () => void; close: () => void };
type Hub = { subscribers: Set<Subscriber>; connecting?: Promise<void>; client?: PoolClient };
const shared = globalThis as typeof globalThis & { __sunuNotifications?: Hub };
const hub: Hub = shared.__sunuNotifications ||= { subscribers: new Set() };

// One LISTEN connection per server, not one per browser tab. The request pool
// therefore remains available to the dashboard, students and journal routes.
async function connectNotifications() {
  if (hub.client) return;
  hub.connecting ||= (async () => {
    const client = await pool.connect();
    let released = false;
    const disconnect = () => {
      if (released) return; released = true;
      if (hub.client === client) hub.client = undefined;
      for (const subscriber of [...hub.subscribers]) subscriber.close();
      client.release(true);
    };
    client.on("error", disconnect);
    client.on("end", disconnect);
    client.on("notification", (message) => {
      if (message.channel !== "sunu_events" || !message.payload) return;
      try {
        const change = JSON.parse(message.payload) as { school?: string };
        for (const subscriber of hub.subscribers) if (change.school === subscriber.schoolId) subscriber.notify();
      } catch { /* Malformed notifications never become browser events. */ }
    });
    try { await client.query("LISTEN sunu_events"); hub.client = client; }
    catch (cause) { disconnect(); throw cause; }
  })().finally(() => { hub.connecting = undefined; });
  await hub.connecting;
}

export async function GET(request: Request) {
  let schoolId: string;
  try {
    const auth = await getAuth(request);
    if (!auth) return invalidSession(request);
    schoolId = auth.school.id;
    await connectNotifications();
  } catch { return Response.json({ error: "Le flux en direct est indisponible. L’actualisation automatique reste active." }, { status: 503 }); }
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const push = (value: string) => { if (!closed) try { controller.enqueue(encoder.encode(value)); } catch { cleanup?.(); } };
      // Only an invalidation flag is sent. Every data refresh rechecks authentication,
      // active membership and tenant permissions, even if a session was just revoked.
      const subscriber: Subscriber = { schoolId, notify: () => push('data: {"changed":true}\n\n'), close: () => cleanup?.() };
      const heartbeat = setInterval(() => push(": keepalive\n\n"), 20000);
      const lifetime = setTimeout(() => cleanup?.(), 10 * 60000);
      cleanup = () => {
        if (closed) return; closed = true;
        clearInterval(heartbeat); clearTimeout(lifetime);
        hub.subscribers.delete(subscriber);
        request.signal.removeEventListener("abort", subscriber.close);
        try { controller.close(); } catch { /* Already cancelled by the browser. */ }
      };
      hub.subscribers.add(subscriber);
      request.signal.addEventListener("abort", subscriber.close, { once: true });
      if (request.signal.aborted) cleanup(); else push("retry: 4000\n: connected\n\n");
    },
    cancel() { cleanup?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive" } });
}
