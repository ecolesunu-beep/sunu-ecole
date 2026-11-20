import { boolean, customType, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const createdAt = () => timestamp("date_creation", { withTimezone: true }).notNull().defaultNow();

export const ecoles = pgTable("ecoles", {
  id: uuid("id").primaryKey().defaultRandom(),
  nomEcole: text("nom_ecole").notNull(),
  typeEtablissement: text("type_etablissement").notNull(),
  ville: text("ville").notNull().default(""),
  pays: text("pays").notNull().default(""),
  anneeScolaire: text("annee_scolaire").notNull().default(""),
  emailEcole: text("email_ecole"),
  logoEcole: text("logo_ecole"),
  codeParrainageUnique: varchar("code_parrainage_unique", { length: 24 }).notNull().unique(),
  creeParId: uuid("cree_par_id"),
  seuilRetards: integer("seuil_retards").notNull().default(3),
  seuilAbsences: integer("seuil_absences").notNull().default(3),
  seuilRenvois: integer("seuil_renvois").notNull().default(1),
  dateCreation: createdAt(),
});

export const utilisateurs = pgTable("utilisateurs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecoleId: uuid("ecole_id").notNull().references(() => ecoles.id),
  nom: text("nom").notNull(),
  email: text("email").notNull(), // AES-256-GCM ciphertext, never plaintext
  emailLookup: varchar("email_lookup", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  passwordHistory: jsonb("password_history").$type<string[]>().notNull().default([]),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  role: text("role").notNull().default("Surveillant"),
  permissions: jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
  actif: boolean("actif").notNull().default(true),
  inviteParId: uuid("invite_par_id"),
  dateArrivee: timestamp("date_arrivee", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("utilisateurs_ecole_idx").on(t.ecoleId)]);

export const eleves = pgTable("eleves", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecoleId: uuid("ecole_id").notNull().references(() => ecoles.id),
  prenom: text("prenom").notNull(),
  nom: text("nom").notNull(),
  classe: text("classe").notNull(),
  dedupeKey: varchar("dedupe_key", { length: 64 }).notNull(),
  photoId: uuid("photo_id"), // private, encrypted attachment belonging to the same school
  telephoneParent: text("telephone_parent"), // AES-256-GCM ciphertext
  emailParent: text("email_parent"), // AES-256-GCM ciphertext
  dateCreation: createdAt(),
}, (t) => [uniqueIndex("eleves_ecole_dedupe_idx").on(t.ecoleId, t.dedupeKey), index("eleves_ecole_classe_idx").on(t.ecoleId, t.classe)]);

export const journal = pgTable("journal", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecoleId: uuid("ecole_id").notNull().references(() => ecoles.id),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull(),
  heure: text("heure").notNull().default(""),
  justifie: text("justifie").notNull().default("Non"),
  motif: text("motif").notNull().default(""),
  decision: text("decision").notNull().default(""),
  parentsInformes: text("parents_informes").notNull().default("Non"),
  photoJustificatifUrl: text("photo_justificatif_url"), // private attachment UUID, not a public URL
  saisiParId: uuid("saisi_par_id"),
  saisiParNom: text("saisi_par_nom").notNull(),
  dateCreation: createdAt(),
}, (t) => [index("journal_ecole_date_idx").on(t.ecoleId, t.date), index("journal_ecole_eleve_idx").on(t.ecoleId, t.eleveId)]);

export const fichesRenvoi = pgTable("fiches_renvoi", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecoleId: uuid("ecole_id").notNull().references(() => ecoles.id),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  motif: text("motif").notNull(),
  dureeJours: integer("duree_jours").notNull(),
  dateRetour: date("date_retour").notNull(),
  cumul: integer("cumul").notNull(),
  pdfUrl: text("pdf_url"),
  saisiParId: uuid("saisi_par_id"),
  dateCreation: createdAt(),
}, (t) => [index("fiches_ecole_idx").on(t.ecoleId)]);

export const historique = pgTable("historique", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecoleId: uuid("ecole_id").notNull().references(() => ecoles.id),
  dateHeure: timestamp("date_heure", { withTimezone: true }).notNull().defaultNow(),
  utilisateurId: uuid("utilisateur_id"),
  qui: text("qui").notNull(),
  action: text("action").notNull(),
  details: text("details").notNull().default(""),
  ipAdresse: text("ip_adresse"),
}, (t) => [index("historique_ecole_date_idx").on(t.ecoleId, t.dateHeure)]);

export const piecesJointes = pgTable("pieces_jointes", {
  id: uuid("id").primaryKey().defaultRandom(),
  ecoleId: uuid("ecole_id").notNull().references(() => ecoles.id),
  contenuChiffre: bytea("contenu_chiffre").notNull(),
  mimeType: text("mime_type").notNull(),
  nomFichier: text("nom_fichier").notNull(),
  ajouteParId: uuid("ajoute_par_id").notNull(),
  dateCreation: createdAt(),
}, (t) => [index("pieces_ecole_idx").on(t.ecoleId)]);

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull(),
  scopeKey: varchar("scope_key", { length: 128 }).notNull(),
  email: text("email"), // encrypted when present
  ipAdresse: text("ip_adresse"),
  userAgent: text("user_agent"),
  tentativesEchouees: integer("tentatives_echouees").notNull().default(0),
  derniereTentativeAt: timestamp("derniere_tentative_at", { withTimezone: true }),
  bloqueJusquaAt: timestamp("bloque_jusqua_at", { withTimezone: true }),
  statut: text("statut").notNull().default("actif"),
}, (t) => [uniqueIndex("login_attempts_scope_idx").on(t.scope, t.scopeKey)]);

export const loginEvents = pgTable("login_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailLookup: varchar("email_lookup", { length: 64 }),
  ipAdresse: text("ip_adresse").notNull(),
  userAgent: text("user_agent"),
  statut: text("statut").notNull(),
  dateHeure: timestamp("date_heure", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("login_events_ip_date_idx").on(t.ipAdresse, t.dateHeure)]);

export const refreshSessions = pgTable("refresh_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  utilisateurId: uuid("utilisateur_id").notNull().references(() => utilisateurs.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expireAt: timestamp("expire_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ipAdresse: text("ip_adresse"),
  userAgent: text("user_agent"),
  dateCreation: createdAt(),
});

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  utilisateurId: uuid("utilisateur_id").notNull().references(() => utilisateurs.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expireAt: timestamp("expire_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  dateCreation: createdAt(),
});
