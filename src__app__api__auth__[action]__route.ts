import { NextRequest } from "next/server";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { ecoles, passwordResets, refreshSessions, utilisateurs } from "@/db/schema";
import { audit, getAuth, invalidSession, issueSession, publicUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { isPasswordProvided } from "@/lib/password";
import { encrypt, lookup, lookupCandidates, originAllowed, randomToken, schoolCode, sha256 } from "@/lib/security";
import { DEFAULT_PERMISSIONS } from "@/lib/types";
import { unavailableIfNotReady } from "@/lib/runtime-ready";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Authorization" } });
const fail = (error: string, status = 400) => reply({ error }, status);
const invalidCode = "Code invalide. Demandez le bon code à votre Surveillant Général.";
const hashPassword = (value: string) => argon2.hash(value, { type: argon2.argon2id, timeCost: 3, memoryCost: 65536, salt: randomBytes(16) });
let dummyHash: Promise<string> | null = null;
const dummy = () => dummyHash ||= hashPassword(randomToken());
const str = (value: unknown) => typeof value === "string" ? value : "";
async function input(request: Request): Promise<Record<string, unknown>> {
  try { const body: unknown = await request.json(); return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {}; } catch { return {}; }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if ((await params).action !== "me") return fail("Route inconnue.", 404);
  const unavailable = await unavailableIfNotReady();
  if (unavailable) return unavailable;
  try {
    const auth = await getAuth(request);
    if (!auth) return invalidSession(request);
    return reply({ user: publicUser(auth.user), school: auth.school });
  } catch { return fail("La vérification de la session est momentanément indisponible. Réessayez.", 503); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if (!originAllowed(request)) return fail("Origine non autorisée.", 403);
  const { action } = await params;
  const unavailable = await unavailableIfNotReady();
  if (unavailable) return unavailable;
  try {
    if (action === "logout") {
      const auth = await getAuth(request);
      if (!auth) return invalidSession(request);
      await db.update(refreshSessions).set({ revokedAt: new Date() }).where(eq(refreshSessions.id, auth.sessionId));
      await audit(auth, "Déconnexion", "Session fermée");
      return reply({ ok: true });
    }
    const body = await input(request);
    if (action === "signup") {
      const nom = str(body.nom).trim().slice(0, 120), email = str(body.email).toLocaleLowerCase("fr").trim().slice(0, 254), password = str(body.password);
      const join = body.mode === "join", nomEcole = str(body.nomEcole).trim().slice(0, 160), type = str(body.type).trim();
      if (!nom || !/^\S+@\S+\.\S+$/.test(email)) return fail("Renseignez votre nom et un email valide.");
      if (!join && (!nomEcole || !["Primaire", "Collège", "Lycée", "Université", "Autre"].includes(type))) return fail("Renseignez le nom et le type de votre établissement.");
      if (!isPasswordProvided(password)) return fail("Renseignez votre mot de passe.");
      const [existing] = await db.select({ id: utilisateurs.id }).from(utilisateurs).where(inArray(utilisateurs.emailLookup, lookupCandidates(email))).limit(1);
      if (existing) return fail("Un compte existe déjà avec cet email.", 409);
      let joinedSchool: typeof ecoles.$inferSelect | undefined;
      if (join) {
        [joinedSchool] = await db.select().from(ecoles).where(eq(ecoles.codeParrainageUnique, str(body.code).trim().toUpperCase())).limit(1);
        if (!joinedSchool) return fail(invalidCode);
      }
      const passwordHash = await hashPassword(password);
      const { user, school } = await db.transaction(async (tx) => {
        let school = joinedSchool;
        if (!school) [school] = await tx.insert(ecoles).values({ nomEcole, typeEtablissement: type, codeParrainageUnique: schoolCode(), ville: str(body.ville).trim().slice(0, 100), pays: str(body.pays).trim().slice(0, 100), anneeScolaire: str(body.anneeScolaire).trim().slice(0, 30) }).returning();
        const [user] = await tx.insert(utilisateurs).values({ ecoleId: school.id, nom, email: encrypt(email)!, emailLookup: lookup(email), passwordHash, role: join ? "Surveillant" : "Surveillant Général", permissions: DEFAULT_PERMISSIONS, inviteParId: join ? school.creeParId : null }).returning();
        if (!join) [school] = await tx.update(ecoles).set({ creeParId: user.id }).where(eq(ecoles.id, school.id)).returning();
        return { user, school };
      });
      const sessionToken = await issueSession(user.id);
      await audit({ user, school, sessionId: "" }, join ? "Équipe rejointe" : "École créée", join ? `${nom} a rejoint l'équipe` : `Établissement ${school.nomEcole} créé`);
      return reply({ user: publicUser(user), school, sessionToken, redirect: join ? "/dashboard" : "/onboarding" }, 201);
    }
    if (action === "login") {
      const email = str(body.email).toLocaleLowerCase("fr").trim().slice(0, 254), password = str(body.password);
      const bySchool = body.identifier === "school";
      const name = str(body.nom).trim().slice(0, 120), establishment = str(body.establishment).trim().slice(0, 160);
      if (!isPasswordProvided(password) || (bySchool ? !name || !establishment : !email)) return fail("Renseignez vos identifiants et votre mot de passe.");
      // This alternate username consists of school + member name. It never
      // authenticates by password alone, searches password hashes, or claims an account.
      const candidates = await db.select({ user: utilisateurs, school: ecoles }).from(utilisateurs)
        .innerJoin(ecoles, eq(ecoles.id, utilisateurs.ecoleId))
        .where(bySchool
          ? and(sql`lower(${utilisateurs.nom}) = lower(${name})`, or(sql`lower(${ecoles.nomEcole}) = lower(${establishment})`, eq(ecoles.codeParrainageUnique, establishment.toUpperCase())))
          : inArray(utilisateurs.emailLookup, lookupCandidates(email))).limit(2);
      const account = candidates.length === 1 ? candidates[0] : undefined;
      const verified = await argon2.verify(account?.user.passwordHash || await dummy(), password);
      if (!account?.user.actif || !verified) return fail(bySchool ? "Identifiants ou mot de passe incorrects." : "E-mail ou mot de passe incorrect.", 401);
      const { user, school } = account;
      const code = str(body.code).trim().toUpperCase();
      if (code && code !== school.codeParrainageUnique) return fail(invalidCode, 403);
      const sessionToken = await issueSession(user.id);
      await audit({ user, school, sessionId: "" }, "Connexion", "Espace de l’établissement ouvert");
      return reply({ user: publicUser(user), school, sessionToken, redirect: "/dashboard" });
    }
    if (action === "forgot") {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return fail("La réinitialisation par email n'est pas disponible tant que SMTP n'est pas configuré.", 503);
      const email = str(body.email).toLocaleLowerCase("fr").trim().slice(0, 254);
      if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Email invalide.");
      const [user] = await db.select().from(utilisateurs).where(and(inArray(utilisateurs.emailLookup, lookupCandidates(email)), eq(utilisateurs.actif, true))).limit(1);
      if (user) {
        const token = randomToken();
        await db.insert(passwordResets).values({ utilisateurId: user.id, tokenHash: sha256(token), expireAt: new Date(Date.now() + 30 * 60000) });
        const url = new URL("/reinitialiser", process.env.NEXT_PUBLIC_APP_URL || request.url); url.searchParams.set("token", token);
        await sendMail(email, "Réinitialiser votre mot de passe Sunu École", `Utilisez ce lien unique dans les 30 minutes : ${url.href}\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez cet email.`);
      }
      return reply({ message: "Si ce compte existe, un lien de réinitialisation a été envoyé." });
    }
    if (action === "reset") {
      const token = str(body.token), password = str(body.password);
      if (!isPasswordProvided(password)) return fail("Renseignez votre nouveau mot de passe.");
      const lookupReset = and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expireAt, new Date()));
      const [reset] = await db.select().from(passwordResets).where(lookupReset).limit(1);
      if (!token || !reset) return fail("Lien expiré ou déjà utilisé. Demandez un nouveau lien.");
      const passwordHash = await hashPassword(password);
      const updated = await db.transaction(async (tx) => {
        const now = new Date();
        const used = await tx.update(passwordResets).set({ usedAt: now }).where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt), gt(passwordResets.expireAt, now))).returning({ userId: passwordResets.utilisateurId });
        if (!used.length) return null;
        const [user] = await tx.update(utilisateurs).set({ passwordHash, passwordHistory: [], passwordChangedAt: now, mustChangePassword: false }).where(and(eq(utilisateurs.id, used[0].userId), eq(utilisateurs.actif, true))).returning();
        if (!user) return null;
        await tx.update(passwordResets).set({ usedAt: now }).where(and(eq(passwordResets.utilisateurId, user.id), isNull(passwordResets.usedAt)));
        await tx.update(refreshSessions).set({ revokedAt: now }).where(and(eq(refreshSessions.utilisateurId, user.id), isNull(refreshSessions.revokedAt)));
        return user;
      });
      if (!updated) return fail("Lien expiré ou déjà utilisé. Demandez un nouveau lien.");
      const [school] = await db.select().from(ecoles).where(eq(ecoles.id, updated.ecoleId)).limit(1);
      await audit({ user: updated, school, sessionId: "" }, "Mot de passe réinitialisé", "Sessions précédentes fermées");
      return reply({ message: "Mot de passe mis à jour. Connectez-vous." });
    }
    if (action === "password") {
      const auth = await getAuth(request);
      if (!auth) return invalidSession(request);
      if (!await argon2.verify(auth.user.passwordHash, str(body.currentPassword))) return fail("Mot de passe actuel incorrect.", 403);
      const password = str(body.password);
      if (!isPasswordProvided(password)) return fail("Renseignez votre nouveau mot de passe.");
      const passwordHash = await hashPassword(password);
      const saved = await db.transaction(async (tx) => {
        const now = new Date();
        const updated = await tx.update(utilisateurs).set({ passwordHash, passwordHistory: [], passwordChangedAt: now, mustChangePassword: false }).where(and(eq(utilisateurs.id, auth.user.id), eq(utilisateurs.ecoleId, auth.school.id), eq(utilisateurs.passwordHash, auth.user.passwordHash), eq(utilisateurs.actif, true))).returning({ id: utilisateurs.id });
        if (!updated.length) return false;
        await tx.update(refreshSessions).set({ revokedAt: now }).where(and(eq(refreshSessions.utilisateurId, auth.user.id), isNull(refreshSessions.revokedAt)));
        await tx.update(passwordResets).set({ usedAt: now }).where(and(eq(passwordResets.utilisateurId, auth.user.id), isNull(passwordResets.usedAt)));
        return true;
      });
      if (!saved) return fail("Votre compte a changé. Reconnectez-vous.", 401);
      const sessionToken = await issueSession(auth.user.id);
      await audit(auth, "Mot de passe modifié", "Toutes les autres sessions ont été fermées");
      return reply({ sessionToken, message: "Mot de passe modifié. Les autres sessions ont été fermées." });
    }
    return fail("Route inconnue.", 404);
  } catch (error) {
    // Avoid logging request bodies, SQL parameters, credentials or session tokens.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    console.error("[Sunu École] Échec de la demande d’authentification", action, code);
    if (code === "23505") return fail("Ce compte existe déjà. Connectez-vous.", 409);
    return fail("Impossible de traiter la demande. Réessayez.", 500);
  }
}
