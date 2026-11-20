import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const fields = ["DATA_ENCRYPTION_KEY", "LOOKUP_KEY"] as const;
const requiredTables = ["ecoles", "utilisateurs", "eleves", "journal", "fiches_renvoi", "historique", "pieces_jointes", "password_resets", "refresh_sessions"];
const state = globalThis as typeof globalThis & { __sunuReady?: Promise<void> };

function validateKeys(values: Record<string, string | undefined>) {
  for (const name of fields) if (!values[name]) throw new Error(`Configuration requise : ${name}.`);
  for (const name of fields) if (Buffer.from(values[name]!, "base64").length !== 32) throw new Error(`Clé de chiffrement invalide : ${name}.`);
}

async function initialize() {
  const database = new URL(process.env.DATABASE_URL!);
  const preview = !!process.env.E2B_SANDBOX_ID && process.env.SUNU_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname);
  await db.transaction(async (tx) => {
    // Serialize cold starts, including different Next.js worker processes.
    await tx.execute(sql`select pg_advisory_xact_lock(741903221)`);
    const { rows } = await tx.execute<{ name: string }>(sql`select tablename as name from pg_catalog.pg_tables where schemaname = 'public'`);
    const present = new Set(rows.map((row) => row.name));
    const missing = requiredTables.filter((table) => !present.has(table));
    if (missing.length) {
      if (!preview || missing.length !== requiredTables.length) throw new Error("Le schéma de l'instance est incomplet. Appliquez les migrations avant d'ouvrir les inscriptions.");
      // This is a versioned, application-owned SQL baseline, never user input.
      // No DROP, ALTER of existing data, seed rows, or Supabase-only policies.
      const schema = await readFile(path.join(process.cwd(), "supabase.sql"), "utf8");
      const end = schema.indexOf("-- END OF PORTABLE SCHEMA");
      if (end < 0) throw new Error("Schéma initial PostgreSQL introuvable.");
      await tx.execute(sql.raw(schema.slice(0, end)));
    }
    if (fields.every((name) => !!process.env[name])) { validateKeys(process.env); return; }
    // Never generate production data keys. Production and partial configurations
    // must be completed by the deployment's secret manager.
    if (!preview || fields.some((name) => !!process.env[name])) throw new Error("Restaurez les deux clés d'instance depuis le gestionnaire de secrets.");
    const dbId = createHash("sha256").update(database.host + database.pathname).digest("hex").slice(0, 16);
    const directory = path.join(process.env.SUNU_STATE_DIR || path.join(homedir(), ".local", "state", "sunu-ecole"), dbId);
    async function readKeys(file: string): Promise<Record<string, string> | null> {
      try { const values = parse(await readFile(path.join(directory, file))); validateKeys(values); return values; }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null; throw cause; }
    }
    const original = await readKeys("instance.env");
    let local = await readKeys("storage-v2.env");
    if (local && original) {
      // An operator can restore the original file without overwriting newer keys.
      process.env.PREVIOUS_DATA_ENCRYPTION_KEY ||= original.DATA_ENCRYPTION_KEY;
      process.env.PREVIOUS_LOOKUP_KEY ||= original.LOOKUP_KEY;
    }
    local ||= original;
    if (!local) {
      // Preview snapshots can preserve PostgreSQL without the private filesystem.
      // A separate generation is ONLY for new writes. No existing ciphertext,
      // password hash, school, or lookup index is modified by this initialization.
      const used = await tx.execute<{ used: boolean }>(sql`select exists(select 1 from public.utilisateurs) as used`);
      if (used.rows[0]?.used) console.warn("[Sunu École] Anciennes clés absentes de l’aperçu. Données conservées ; identification par nom et établissement disponible.");
      local = { DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64"), LOOKUP_KEY: randomBytes(32).toString("base64") };
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const filename = path.join(directory, "storage-v2.env");
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, fields.map((name) => `${name}=${local![name]}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
        await rename(temporary, filename);
      } finally { await unlink(temporary).catch(() => {}); }
    }
    validateKeys(local);
    for (const name of fields) process.env[name] = local[name];
  });
}

export function ensureRuntime(): Promise<void> {
  if (!state.__sunuReady) state.__sunuReady = initialize().catch((cause: unknown) => {
    delete state.__sunuReady;
    // Never put keys, connection strings or request content in the response.
    console.error("[Sunu École] Instance indisponible :", cause instanceof Error ? cause.message.split("\n")[0].slice(0, 220) : "initialisation incomplète");
    throw new Error("Le service de connexion n’est pas disponible. Réessayez dans quelques instants.");
  });
  return state.__sunuReady;
}
export async function unavailableIfNotReady() {
  try { await ensureRuntime(); return null; }
  catch { return Response.json({ error: "L’espace de votre école n’est pas disponible pour le moment. Aucune donnée n’a été modifiée." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "10" } }); }
}
