import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureRuntime } from "@/lib/runtime-ready";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await ensureRuntime();
    // Validate the actual app schema, without reading or returning any school records.
    await db.execute(sql`select e.nom_ecole, u.password_hash, j.type, s.classe from public.ecoles e, public.utilisateurs u, public.journal j, public.eleves s, public.refresh_sessions r limit 0`);
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ ok: false }, { status: 503, headers }); }
}
