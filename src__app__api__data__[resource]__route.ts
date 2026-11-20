import { NextRequest } from "next/server";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import * as XLSX from "@e965/xlsx";
import { db } from "@/db";
import { ecoles, eleves, fichesRenvoi, historique, journal, piecesJointes, utilisateurs } from "@/db/schema";
import { audit, can, getAuth, invalidSession, isGeneral, publicUser, revokeSessions, type Auth } from "@/lib/auth";
import { attachmentSignature, decrypt, decryptBytes, encrypt, encryptBytes, lookup, originAllowed, randomToken, schoolCode, verifyAttachmentSignature, UnavailableEnvelope } from "@/lib/security";
import { DEFAULT_PERMISSIONS, type Permission } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const error = (message: string, status = 400) => Response.json({ error: message }, { status });
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const rawString = (value: unknown) => typeof value === "string" ? value : "";
const bodyOf = async (request: Request): Promise<Record<string, unknown>> => { try { return await request.json(); } catch { return {}; } };
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T12:00:00Z").getTime());
const dedupe = (first: string, last: string, classe: string) => lookup([first, last, classe].map((x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()).join("|"));
const permissionFor = (resource: string): Permission | null => resource === "journal" || resource === "export-journal" ? "journal" : resource === "eleves" || resource === "import" ? "eleves" : resource === "fiches" ? "fiches" : resource === "utilisateurs" ? "utilisateurs" : null;
async function requireAuth(resource: string, request: Request) {
  let auth: Auth | null;
  try { auth = await getAuth(request); } catch { return { failure: error("Le service de votre école est momentanément indisponible. Réessayez dans un instant.", 503) }; }
  if (!auth) return { failure: invalidSession(request) };
  const permission = permissionFor(resource);
  if (permission && !can(auth, permission)) return { failure: error("Vous n'avez pas l'autorisation pour cette action.", 403) };
  return { auth };
}
function publicStudent(student: typeof eleves.$inferSelect, sensitive = false) {
  return { id: student.id, ecoleId: student.ecoleId, prenom: student.prenom, nom: student.nom, classe: student.classe, photoId: student.photoId, dateCreation: student.dateCreation, ...(sensitive ? { telephoneParent: decrypt(student.telephoneParent), emailParent: decrypt(student.emailParent) } : {}) };
}
async function belongingStudent(auth: Auth, id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  const [student] = await db.select().from(eleves).where(and(eq(eleves.id, id), eq(eleves.ecoleId, auth.school.id))).limit(1);
  return student || null;
}
async function belongingEntry(auth: Auth, id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  const [entry] = await db.select().from(journal).where(and(eq(journal.id, id), eq(journal.ecoleId, auth.school.id))).limit(1);
  return entry || null;
}
async function snapshot(auth: Auth) {
  const [students, entries, fiches, history] = await Promise.all([
    db.select().from(eleves).where(eq(eleves.ecoleId, auth.school.id)).orderBy(eleves.classe, eleves.nom),
    db.select().from(journal).where(eq(journal.ecoleId, auth.school.id)).orderBy(desc(journal.dateCreation)),
    db.select().from(fichesRenvoi).where(eq(fichesRenvoi.ecoleId, auth.school.id)).orderBy(desc(fichesRenvoi.dateCreation)),
    db.select().from(historique).where(eq(historique.ecoleId, auth.school.id)).orderBy(desc(historique.dateHeure)).limit(100),
  ]);
  return { school: auth.school, user: publicUser(auth.user), students: students.map((s) => publicStudent(s)), entries, fiches, history, users: [], updatedAt: new Date().toISOString() };
}
function friendlyDbError(err: unknown) {
  if (err instanceof UnavailableEnvelope) return error(err.message, 503);
  if (err && typeof err === "object" && "code" in err && err.code === "23505") return error("Cette donnée existe déjà dans votre école.", 409);
  console.error("Data API error", err);
  return error("Une erreur est survenue. Réessayez.", 500);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const checked = await requireAuth(resource, request);
  if (checked.failure) return checked.failure;
  const auth = checked.auth!;
  const query = request.nextUrl.searchParams;
  try {
    if (resource === "snapshot") return Response.json(await snapshot(auth), { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
    if (resource === "eleves") {
      if (!can(auth, "eleves") && !can(auth, "fiches")) return error("Accès refusé.", 403);
      const id = query.get("id");
      if (!id) return Response.json((await db.select().from(eleves).where(eq(eleves.ecoleId, auth.school.id))).map((s) => publicStudent(s)));
      const student = await belongingStudent(auth, id);
      if (!student) return error("Élève introuvable.", 404);
      await audit(auth, "Lecture de coordonnées", `Fiche de ${student.prenom} ${student.nom} consultée`, request);
      return Response.json(publicStudent(student, true));
    }
    if (resource === "historique") {
      let conditions = [eq(historique.ecoleId, auth.school.id)];
      if (query.get("utilisateur")) conditions.push(eq(historique.utilisateurId, query.get("utilisateur")!));
      if (query.get("action")) conditions.push(eq(historique.action, query.get("action")!));
      if (query.get("date") && validDate(query.get("date")!)) {
        const start = new Date(query.get("date")! + "T00:00:00Z");
        conditions = [...conditions, gte(historique.dateHeure, start), lt(historique.dateHeure, new Date(start.getTime() + 86400000))];
      }
      return Response.json(await db.select().from(historique).where(and(...conditions)).orderBy(desc(historique.dateHeure)));
    }
    if (resource === "utilisateurs") {
      if (!isGeneral(auth)) return error("Réservé au Surveillant Général.", 403);
      const team = await db.select().from(utilisateurs).where(eq(utilisateurs.ecoleId, auth.school.id)).orderBy(utilisateurs.dateArrivee);
      await audit(auth, "Lecture de données sensibles", "Liste des comptes de l'équipe consultée", request);
      return Response.json(team.map(publicUser));
    }
    if (resource === "pieces-jointes") {
      const id = query.get("id") || "";
      if (!/^[a-f0-9-]{36}$/i.test(id)) return error("Pièce jointe invalide.");
      const [piece] = await db.select().from(piecesJointes).where(and(eq(piecesJointes.id, id), eq(piecesJointes.ecoleId, auth.school.id))).limit(1);
      if (!piece) return error("Pièce jointe introuvable.", 404);
      if (query.get("url") === "1") {
        const expires = Math.floor(Date.now() / 1000) + 3600;
        return Response.json({ url: `/api/data/pieces-jointes?id=${id}&expires=${expires}&signature=${attachmentSignature(id, auth.school.id, expires)}`, expires });
      }
      if (!verifyAttachmentSignature(id, auth.school.id, Number(query.get("expires")), query.get("signature") || "")) return error("Lien expiré. Ouvrez à nouveau la pièce jointe.", 403);
      await audit(auth, "Lecture de données sensibles", `Justificatif ${id} consulté`, request);
      return new Response(new Uint8Array(decryptBytes(piece.contenuChiffre)), { headers: { "Content-Type": piece.mimeType, "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="justificatif"`, "X-Content-Type-Options": "nosniff" } });
    }
    if (resource === "export" || resource === "export-journal") {
      if (resource === "export" && !isGeneral(auth)) return error("Réservé au Surveillant Général.", 403);
      const [students, entries, fiches, history, team] = await Promise.all([
        db.select().from(eleves).where(eq(eleves.ecoleId, auth.school.id)), db.select().from(journal).where(eq(journal.ecoleId, auth.school.id)), db.select().from(fichesRenvoi).where(eq(fichesRenvoi.ecoleId, auth.school.id)), db.select().from(historique).where(eq(historique.ecoleId, auth.school.id)), resource === "export" ? db.select().from(utilisateurs).where(eq(utilisateurs.ecoleId, auth.school.id)) : Promise.resolve([]),
      ]);
      const names = new Map(students.map((s) => [s.id, `${s.prenom} ${s.nom}`]));
      const wb = XLSX.utils.book_new();
      const add = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Information: "Aucune donnée pour le moment." }]), name);
      if (resource === "export") {
        add("Ecole", [{ Nom: auth.school.nomEcole, Type: auth.school.typeEtablissement, Ville: auth.school.ville, Pays: auth.school.pays, "Année scolaire": auth.school.anneeScolaire, "Seuil retards": auth.school.seuilRetards, "Seuil absences": auth.school.seuilAbsences, "Seuil renvois": auth.school.seuilRenvois }]);
        add("Eleves", students.map((s) => ({ "Prénoms": s.prenom, Nom: s.nom, Classe: s.classe, "Téléphone parent": decrypt(s.telephoneParent), "Email parent": decrypt(s.emailParent) })));
        add("Equipe", team.map((u) => ({ Nom: u.nom, Email: decrypt(u.email), Rôle: u.role, Actif: u.actif ? "Oui" : "Non", "Date d'arrivée": u.dateArrivee.toISOString() })));
        add("Fiches", fiches.map((f) => ({ Date: f.date, Élève: names.get(f.eleveId) || "", Motif: f.motif, "Durée (jours)": f.dureeJours, Retour: f.dateRetour, Cumul: f.cumul })));
        add("Historique", history.map((h) => ({ Date: h.dateHeure.toISOString(), Qui: h.qui, Action: h.action, Détails: h.details })));
      }
      add("Journal", entries.map((e) => ({ Date: e.date, Heure: e.heure, Élève: names.get(e.eleveId) || "", Classe: students.find((s) => s.id === e.eleveId)?.classe || "", Type: e.type, Motif: e.motif, Décision: e.decision, Justifié: e.justifie, "Parents informés": e.parentsInformes, "Saisi par": e.saisiParNom })));
      await audit(auth, "Export de données sensibles", resource === "export" ? "Export complet de l'école" : "Export Excel du journal", request);
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="sunu-ecole-${resource === "export" ? "donnees" : "journal"}.xlsx"`, "Cache-Control": "private, no-store" } });
    }
    return error("Ressource introuvable.", 404);
  } catch (err) { return friendlyDbError(err); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  if (!originAllowed(request)) return error("Origine non autorisée.", 403);
  const { resource } = await params;
  const checked = await requireAuth(resource, request);
  if (checked.failure) return checked.failure;
  const auth = checked.auth!;
  try {
    if (resource === "pieces-jointes") {
      if (!can(auth, "journal") && !can(auth, "eleves")) return error("Accès refusé.", 403);
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) return error("Ajoutez une image JPG, PNG ou WebP de 5 Mo maximum.");
      const content = Buffer.from(await file.arrayBuffer());
      const jpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
      const png = content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp = content.toString("ascii", 0, 4) === "RIFF" && content.toString("ascii", 8, 12) === "WEBP";
      const mime = jpeg ? "image/jpeg" : png ? "image/png" : webp ? "image/webp" : "";
      if (!mime || file.type !== mime) return error("Format d'image invalide. Formats autorisés : JPG, PNG, WebP.");
      const [piece] = await db.insert(piecesJointes).values({ ecoleId: auth.school.id, contenuChiffre: encryptBytes(content), mimeType: mime, nomFichier: file.name.slice(0, 180), ajouteParId: auth.user.id }).returning();
      await audit(auth, "Justificatif ajouté", `Pièce ${piece.id} enregistrée et chiffrée`, request);
      return Response.json({ id: piece.id }, { status: 201 });
    }
    const body = await bodyOf(request);
    if (resource === "eleves") {
      const prenom = str(body.prenom).slice(0, 100), nom = str(body.nom).slice(0, 100), classe = str(body.classe).slice(0, 100);
      if (!prenom || !nom || !classe) return error("Prénom, nom et classe sont obligatoires.");
      const photoId = str(body.photoId);
      if (photoId && (!/^[a-f0-9-]{36}$/i.test(photoId) || !(await db.select({ id: piecesJointes.id }).from(piecesJointes).where(and(eq(piecesJointes.id, photoId), eq(piecesJointes.ecoleId, auth.school.id))).limit(1)).length)) return error("Photo introuvable dans votre école.");
      const [student] = await db.insert(eleves).values({ ecoleId: auth.school.id, prenom, nom, classe, photoId: photoId || null, dedupeKey: dedupe(prenom, nom, classe), telephoneParent: encrypt(str(body.telephoneParent)), emailParent: encrypt(str(body.emailParent)) }).returning();
      await audit(auth, "Élève ajouté", `${prenom} ${nom} · ${classe}`, request);
      return Response.json(publicStudent(student), { status: 201 });
    }
    if (resource === "import") {
      const rows = Array.isArray(body.students) ? body.students : [];
      if (!rows.length || rows.length > 250) return error("Envoyez entre 1 et 250 élèves par lot.");
      const updateExisting = body.strategy === "update";
      const existing = await db.select({ id: eleves.id, prenom: eleves.prenom, nom: eleves.nom, classe: eleves.classe }).from(eleves).where(eq(eleves.ecoleId, auth.school.id));
      const known = new Map(existing.map((row) => [dedupe(row.prenom, row.nom, row.classe), row.id]));
      let imported = 0, duplicates = 0, ignored = 0, updated = 0;
      for (const candidate of rows) {
        if (!candidate || typeof candidate !== "object") { ignored++; continue; }
        const row = candidate as Record<string, unknown>;
        const prenom = str(row.prenom).slice(0, 100), nom = str(row.nom).slice(0, 100), classe = str(row.classe).slice(0, 100);
        if (!prenom && !nom && !classe) { ignored++; continue; }
        if (!prenom || !nom || !classe) { ignored++; continue; }
        const key = dedupe(prenom, nom, classe), id = known.get(key);
        if (id) {
          duplicates++;
          if (updateExisting) {
            await db.update(eleves).set({ prenom, nom, classe }).where(and(eq(eleves.id, id), eq(eleves.ecoleId, auth.school.id)));
            updated++;
          }
          continue;
        }
        const inserted = await db.insert(eleves).values({ ecoleId: auth.school.id, prenom, nom, classe, dedupeKey: key }).onConflictDoNothing().returning({ id: eleves.id });
        if (inserted.length) { imported++; known.set(key, inserted[0].id); } else duplicates++;
      }
      await audit(auth, "Import Excel", `${imported} élèves importés, ${duplicates} doublons, ${updated} mis à jour, ${ignored} lignes ignorées`, request);
      return Response.json({ imported, duplicates, ignored, updated });
    }
    if (resource === "journal") {
      const student = await belongingStudent(auth, str(body.eleveId));
      if (!student) return error("Sélectionnez un élève de votre école.");
      const type = str(body.type), date = str(body.date), heure = str(body.heure);
      if (!["Retard", "Absence", "Renvoi"].includes(type) || !validDate(date) || (heure && !/^\d{2}:\d{2}$/.test(heure))) return error("Type, date ou heure invalide.");
      const attachment = str(body.photoJustificatifUrl);
      if (attachment) {
        const [piece] = await db.select({ id: piecesJointes.id }).from(piecesJointes).where(and(eq(piecesJointes.id, attachment), eq(piecesJointes.ecoleId, auth.school.id))).limit(1);
        if (!piece) return error("Justificatif introuvable.");
      }
      const [entry] = await db.insert(journal).values({ ecoleId: auth.school.id, eleveId: student.id, type, date, heure, motif: str(body.motif).slice(0, 1000), decision: str(body.decision).slice(0, 1000), justifie: body.justifie === "Oui" ? "Oui" : "Non", parentsInformes: body.parentsInformes === "Oui" ? "Oui" : "Non", photoJustificatifUrl: attachment || null, saisiParId: auth.user.id, saisiParNom: auth.user.nom }).returning();
      await audit(auth, `${type} ajouté`, `${student.prenom} ${student.nom} · ${student.classe} · ${date}`, request);
      return Response.json(entry, { status: 201 });
    }
    if (resource === "fiches") {
      const student = await belongingStudent(auth, str(body.eleveId));
      const date = str(body.date), motif = str(body.motif).slice(0, 1000), days = Number(body.dureeJours);
      if (!student || !validDate(date) || !motif || !Number.isInteger(days) || days < 1 || days > 365) return error("Sélectionnez un élève, une date, un motif et une durée valide.");
      const returnDate = new Date(`${date}T12:00:00Z`); returnDate.setUTCDate(returnDate.getUTCDate() + days);
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(journal).where(and(eq(journal.ecoleId, auth.school.id), eq(journal.eleveId, student.id), eq(journal.type, "Renvoi")));
      const [fiche] = await db.transaction(async (tx) => {
        await tx.insert(journal).values({ ecoleId: auth.school.id, eleveId: student.id, date, type: "Renvoi", motif, decision: `Renvoi de ${days} jour${days > 1 ? "s" : ""}`, heure: "", justifie: "Non", parentsInformes: body.parentsInformes === "Oui" ? "Oui" : "Non", saisiParId: auth.user.id, saisiParNom: auth.user.nom });
        return tx.insert(fichesRenvoi).values({ ecoleId: auth.school.id, eleveId: student.id, date, motif, dureeJours: days, dateRetour: returnDate.toISOString().slice(0, 10), cumul: count + 1, saisiParId: auth.user.id }).returning();
      });
      await audit(auth, "Fiche de renvoi créée", `${student.prenom} ${student.nom} · ${days} jour(s) · retour ${fiche.dateRetour}`, request);
      return Response.json(fiche, { status: 201 });
    }
    if (resource === "code") {
      if (!isGeneral(auth)) return error("Réservé au Surveillant Général.", 403);
      const [school] = await db.update(ecoles).set({ codeParrainageUnique: schoolCode() }).where(eq(ecoles.id, auth.school.id)).returning();
      await audit(auth, "Code régénéré", "L'ancien code d'invitation a été invalidé", request);
      return Response.json(school);
    }
    if (resource === "utilisateurs") {
      if (!isGeneral(auth)) return error("Réservé au Surveillant Général.", 403);
      const resetId = str(body.resetId);
      if (resetId) {
        const [user] = await db.select().from(utilisateurs).where(and(eq(utilisateurs.id, resetId), eq(utilisateurs.ecoleId, auth.school.id))).limit(1);
        if (!user) return error("Compte introuvable.", 404);
        const temporary = `T!${randomToken()}9a`;
        await db.update(utilisateurs).set({ passwordHash: await argon2.hash(temporary, { type: argon2.argon2id, timeCost: 3, memoryCost: 65536, salt: randomBytes(16) }), passwordHistory: [], mustChangePassword: false, passwordChangedAt: new Date() }).where(eq(utilisateurs.id, user.id));
        await revokeSessions(user.id);
        await audit(auth, "Accès temporaire créé", `Mot de passe de ${user.nom} renouvelé ; sessions invalidées`, request);
        return Response.json({ temporary, message: "Communiquez ce mot de passe temporaire de manière sûre. Il ne sera plus affiché." });
      }
      const nom = str(body.nom).slice(0, 120), email = str(body.email).toLowerCase().slice(0, 254);
      if (!nom || !/^\S+@\S+\.\S+$/.test(email)) return error("Nom et email valide requis.");
      const temporary = `T!${randomToken()}9a`;
      const [user] = await db.insert(utilisateurs).values({ ecoleId: auth.school.id, nom, email: encrypt(email)!, emailLookup: lookup(email), passwordHash: await argon2.hash(temporary, { type: argon2.argon2id, timeCost: 3, memoryCost: 65536, salt: randomBytes(16) }), role: "Surveillant", permissions: { ...DEFAULT_PERMISSIONS, ...(body.permissions && typeof body.permissions === "object" ? body.permissions as Record<string, boolean> : {}), utilisateurs: false }, inviteParId: auth.user.id, mustChangePassword: false }).returning();
      await audit(auth, "Compte créé", `${nom} rejoint l'équipe comme Surveillant`, request);
      return Response.json({ user: publicUser(user), temporary, message: "Communiquez ce mot de passe temporaire de manière sûre. Il ne sera plus affiché." }, { status: 201 });
    }
    return error("Ressource introuvable.", 404);
  } catch (err) { return friendlyDbError(err); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  if (!originAllowed(request)) return error("Origine non autorisée.", 403);
  const { resource } = await params;
  const checked = await requireAuth(resource, request);
  if (checked.failure) return checked.failure;
  const auth = checked.auth!;
  const body = await bodyOf(request), id = request.nextUrl.searchParams.get("id") || "";
  try {
    if (resource === "ecole") {
      if (!isGeneral(auth)) return error("Réservé au Surveillant Général.", 403);
      const nomEcole = str(body.nomEcole).slice(0, 160);
      if (!nomEcole) return error("Le nom de l'établissement est obligatoire.");
      const threshold = (v: unknown) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100 ? Number(v) : null;
      const retards = threshold(body.seuilRetards), absences = threshold(body.seuilAbsences), renvois = threshold(body.seuilRenvois);
      if (!retards || !absences || !renvois) return error("Les seuils doivent être des nombres entre 1 et 100.");
      const [school] = await db.update(ecoles).set({ nomEcole, typeEtablissement: ["Primaire", "Collège", "Lycée", "Université", "Autre"].includes(str(body.typeEtablissement)) ? str(body.typeEtablissement) : auth.school.typeEtablissement, ville: str(body.ville).slice(0, 100), pays: str(body.pays).slice(0, 100), anneeScolaire: str(body.anneeScolaire).slice(0, 30), seuilRetards: retards, seuilAbsences: absences, seuilRenvois: renvois }).where(eq(ecoles.id, auth.school.id)).returning();
      await audit(auth, "Paramètres modifiés", `Établissement et seuils mis à jour ; statuts recalculés automatiquement`, request);
      return Response.json(school);
    }
    if (resource === "eleves") {
      const student = await belongingStudent(auth, id);
      if (!student) return error("Élève introuvable.", 404);
      const prenom = str(body.prenom).slice(0, 100), nom = str(body.nom).slice(0, 100), classe = str(body.classe).slice(0, 100);
      if (!prenom || !nom || !classe) return error("Prénom, nom et classe sont obligatoires.");
      const photoId = str(body.photoId);
      if (photoId && !(await db.select({ id: piecesJointes.id }).from(piecesJointes).where(and(eq(piecesJointes.id, photoId), eq(piecesJointes.ecoleId, auth.school.id))).limit(1)).length) return error("Photo introuvable dans votre école.");
      const [updated] = await db.update(eleves).set({ prenom, nom, classe, dedupeKey: dedupe(prenom, nom, classe), ...(body.photoId !== undefined ? { photoId: photoId || null } : {}), ...(body.telephoneParent !== undefined ? { telephoneParent: encrypt(str(body.telephoneParent)) } : {}), ...(body.emailParent !== undefined ? { emailParent: encrypt(str(body.emailParent)) } : {}) }).where(and(eq(eleves.id, id), eq(eleves.ecoleId, auth.school.id))).returning();
      await audit(auth, "Élève modifié", `${student.prenom} ${student.nom} → ${prenom} ${nom} · ${classe}`, request);
      return Response.json(publicStudent(updated, true));
    }
    if (resource === "journal") {
      const previous = await belongingEntry(auth, id);
      if (!previous) return error("Saisie introuvable.", 404);
      if (!isGeneral(auth) && previous.saisiParId !== auth.user.id) return error("Seul l'auteur de la saisie ou le Surveillant Général peut la modifier.", 403);
      const student = await belongingStudent(auth, str(body.eleveId) || previous.eleveId);
      const type = str(body.type), date = str(body.date), heure = str(body.heure);
      if (!student || !["Retard", "Absence", "Renvoi"].includes(type) || !validDate(date) || (heure && !/^\d{2}:\d{2}$/.test(heure))) return error("Élève, type, date ou heure invalide.");
      const attachment = str(body.photoJustificatifUrl);
      if (attachment) {
        const [piece] = await db.select({ id: piecesJointes.id }).from(piecesJointes).where(and(eq(piecesJointes.id, attachment), eq(piecesJointes.ecoleId, auth.school.id))).limit(1);
        if (!piece) return error("Justificatif introuvable.");
      }
      const [entry] = await db.update(journal).set({ eleveId: student.id, type, date, heure, motif: str(body.motif).slice(0, 1000), decision: str(body.decision).slice(0, 1000), justifie: body.justifie === "Oui" ? "Oui" : "Non", parentsInformes: body.parentsInformes === "Oui" ? "Oui" : "Non", photoJustificatifUrl: attachment || null }).where(and(eq(journal.id, id), eq(journal.ecoleId, auth.school.id))).returning();
      await audit(auth, "Saisie modifiée", `${previous.type} → ${type} · ${student.prenom} ${student.nom} · ${date}`, request);
      return Response.json(entry);
    }
    if (resource === "utilisateurs") {
      if (!isGeneral(auth)) return error("Réservé au Surveillant Général.", 403);
      const [user] = await db.select().from(utilisateurs).where(and(eq(utilisateurs.id, id), eq(utilisateurs.ecoleId, auth.school.id))).limit(1);
      if (!user) return error("Compte introuvable.", 404);
      const role = body.role === "Surveillant Général" ? "Surveillant Général" : "Surveillant";
      const active = typeof body.actif === "boolean" ? body.actif : user.actif;
      if (user.id === auth.user.id && (!active || role !== "Surveillant Général")) return error("Vous ne pouvez pas retirer votre propre accès général.");
      if (user.role === "Surveillant Général" && (!active || role !== "Surveillant Général")) {
        const generals = await db.select({ id: utilisateurs.id }).from(utilisateurs).where(and(eq(utilisateurs.ecoleId, auth.school.id), eq(utilisateurs.role, "Surveillant Général"), eq(utilisateurs.actif, true)));
        if (generals.length <= 1) return error("Il faut conserver au moins un Surveillant Général actif.");
      }
      const permissions: Record<string, boolean> = { ...DEFAULT_PERMISSIONS };
      if (body.permissions && typeof body.permissions === "object") for (const permission of Object.keys(DEFAULT_PERMISSIONS)) permissions[permission] = permission === "utilisateurs" ? false : (body.permissions as Record<string, unknown>)[permission] === true;
      else Object.assign(permissions, user.permissions);
      const [updated] = await db.update(utilisateurs).set({ nom: str(body.nom).slice(0, 120) || user.nom, role, actif: active, permissions }).where(and(eq(utilisateurs.id, id), eq(utilisateurs.ecoleId, auth.school.id))).returning();
      if (!active) await revokeSessions(id);
      await audit(auth, active ? "Compte modifié" : "Compte retiré", `${user.nom} · ${role} · ${active ? "actif" : "désactivé"}`, request);
      return Response.json(publicUser(updated));
    }
    return error("Ressource introuvable.", 404);
  } catch (err) { return friendlyDbError(err); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  if (!originAllowed(request)) return error("Origine non autorisée.", 403);
  const { resource } = await params;
  const checked = await requireAuth(resource, request);
  if (checked.failure) return checked.failure;
  const auth = checked.auth!, id = request.nextUrl.searchParams.get("id") || "";
  try {
    if (resource === "eleves") {
      const student = await belongingStudent(auth, id);
      if (!student) return error("Élève introuvable.", 404);
      await db.delete(eleves).where(and(eq(eleves.id, id), eq(eleves.ecoleId, auth.school.id)));
      await audit(auth, "Élève supprimé", `${student.prenom} ${student.nom} · ${student.classe} ; saisies et fiches liées supprimées`, request);
      return Response.json({ ok: true });
    }
    if (resource === "journal") {
      const entry = await belongingEntry(auth, id);
      if (!entry) return error("Saisie introuvable.", 404);
      if (!isGeneral(auth) && entry.saisiParId !== auth.user.id) return error("Seul l'auteur de la saisie ou le Surveillant Général peut la supprimer.", 403);
      await db.delete(journal).where(and(eq(journal.id, id), eq(journal.ecoleId, auth.school.id)));
      await audit(auth, "Saisie supprimée", `${entry.type} · ${entry.date} · élève ${entry.eleveId}`, request);
      return Response.json({ ok: true });
    }
    if (resource === "fiches") {
      if (!isGeneral(auth)) return error("Réservé au Surveillant Général.", 403);
      const [fiche] = await db.delete(fichesRenvoi).where(and(eq(fichesRenvoi.id, id), eq(fichesRenvoi.ecoleId, auth.school.id))).returning();
      if (!fiche) return error("Fiche introuvable.", 404);
      await audit(auth, "Fiche supprimée", `Fiche ${id} supprimée ; le renvoi au journal est conservé`, request);
      return Response.json({ ok: true });
    }
    return error("Ressource introuvable.", 404);
  } catch (err) { return friendlyDbError(err); }
}
