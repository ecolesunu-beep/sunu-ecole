import "server-only";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { ecoles, historique, refreshSessions, utilisateurs } from "@/db/schema";
import { decrypt, getIp, randomToken, sha256, UnavailableEnvelope } from "@/lib/security";
import { ensureRuntime } from "@/lib/runtime-ready";
import type { Permission } from "@/lib/types";
import { SESSION_TOKEN_PATTERN } from "@/lib/session-transport";

export type Auth = { user: typeof utilisateurs.$inferSelect; school: typeof ecoles.$inferSelect; sessionId: string };
const day = 24 * 60 * 60 * 1000;
const sessionLifetime = 30 * day;
function bearer(request: Request) {
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") || "");
  return match && SESSION_TOKEN_PATTERN.test(match[1]) ? match[1] : undefined;
}
export function invalidSession(request: Request) {
  const received = Boolean(bearer(request));
  return Response.json({ code: received ? "SESSION_INVALID" : "SESSION_REQUIRED", error: received ? "Votre session n’est plus active. Connectez-vous pour retrouver votre école." : "Une session est nécessaire pour accéder à cette rubrique." }, { status: 401, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}
// Domain separation means a credential from the old refresh mechanism is never
// accepted as a new bearer session, even though we reuse its existing SQL table.
const tokenDigest = (token: string) => sha256(`sunu:tab-session:v1:${token}`);

export async function issueSession(userId: string): Promise<string> {
  const token = `se1.${randomToken()}`;
  await db.insert(refreshSessions).values({ utilisateurId: userId, tokenHash: tokenDigest(token), expireAt: new Date(Date.now() + sessionLifetime) });
  return token;
}

export async function getAuth(request: Request): Promise<Auth | null> {
  const token = bearer(request);
  if (!token) return null;
  await ensureRuntime();
  // The user ID, permissions and school are always resolved by the server.
  const now = new Date();
  const [result] = await db.select({ user: utilisateurs, school: ecoles, sessionId: refreshSessions.id, expiresAt: refreshSessions.expireAt })
    .from(refreshSessions)
    .innerJoin(utilisateurs, eq(utilisateurs.id, refreshSessions.utilisateurId))
    .innerJoin(ecoles, eq(ecoles.id, utilisateurs.ecoleId))
    .where(and(eq(refreshSessions.tokenHash, tokenDigest(token)), eq(utilisateurs.actif, true), isNull(refreshSessions.revokedAt), gt(refreshSessions.expireAt, now))).limit(1);
  if (!result) return null;
  // Extend active sessions quietly. Unknown, revoked or expired credentials never renew.
  const renewalThreshold = new Date(now.getTime() + 7 * day);
  if (result.expiresAt < renewalThreshold) {
    await db.update(refreshSessions).set({ expireAt: new Date(now.getTime() + sessionLifetime) })
      .where(and(eq(refreshSessions.id, result.sessionId), isNull(refreshSessions.revokedAt), gt(refreshSessions.expireAt, now), lt(refreshSessions.expireAt, renewalThreshold)));
  }
  return { user: result.user, school: result.school, sessionId: result.sessionId };
}

export async function revokeSessions(userId: string) {
  await db.update(refreshSessions).set({ revokedAt: new Date() }).where(and(eq(refreshSessions.utilisateurId, userId), isNull(refreshSessions.revokedAt)));
}
export function can(auth: Auth, permission: Permission) { return auth.user.role === "Surveillant Général" || !!auth.user.permissions?.[permission]; }
export function isGeneral(auth: Auth) { return auth.user.role === "Surveillant Général"; }
export function publicUser(user: typeof utilisateurs.$inferSelect) {
  let email = "", emailUnavailable = false;
  try { email = decrypt(user.email); } catch (cause) { if (!(cause instanceof UnavailableEnvelope)) throw cause; emailUnavailable = true; }
  return { id: user.id, ecoleId: user.ecoleId, nom: user.nom, email, emailUnavailable, role: user.role, permissions: user.permissions, actif: user.actif, dateArrivee: user.dateArrivee.toISOString(), inviteParId: user.inviteParId };
}
export async function audit(auth: Auth, action: string, details: string, request?: Request) {
  const [event] = await db.insert(historique).values({ ecoleId: auth.school.id, utilisateurId: auth.user.id, qui: auth.user.nom, action, details: details.slice(0, 500), ipAdresse: request ? getIp(request) : null }).returning();
  try { await db.execute(sql`select pg_notify('sunu_events', ${JSON.stringify({ school: auth.school.id, id: event.id })})`); } catch { /* The four-second polling fallback remains available. */ }
  return event;
}
