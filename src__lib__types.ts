export type Permission = "journal" | "eleves" | "synthese" | "fiches" | "utilisateurs";
export type School = { id: string; nomEcole: string; typeEtablissement: string; ville: string; pays: string; anneeScolaire: string; codeParrainageUnique: string; seuilRetards: number; seuilAbsences: number; seuilRenvois: number; emailEcole?: string | null; logoEcole?: string | null };
export type Person = { id: string; nom: string; email: string; emailUnavailable?: boolean; role: string; ecoleId: string; actif: boolean; permissions: Record<string, boolean>; dateArrivee: string; inviteParId?: string | null };
export type Student = { id: string; ecoleId: string; prenom: string; nom: string; classe: string; dateCreation: string; photoId?: string | null; telephoneParent?: string; emailParent?: string };
export type Entry = { id: string; ecoleId: string; eleveId: string; date: string; type: "Retard" | "Absence" | "Renvoi"; heure: string; justifie: string; motif: string; decision: string; parentsInformes: string; photoJustificatifUrl?: string | null; saisiParId?: string | null; saisiParNom: string; dateCreation: string };
export type Fiche = { id: string; ecoleId: string; eleveId: string; date: string; motif: string; dureeJours: number; dateRetour: string; cumul: number; pdfUrl?: string | null; dateCreation: string };
export type Audit = { id: string; ecoleId: string; dateHeure: string; utilisateurId?: string | null; qui: string; action: string; details: string; ipAdresse?: string | null };
export type Snapshot = { school: School; user: Person; students: Student[]; entries: Entry[]; fiches: Fiche[]; history: Audit[]; users: Person[]; updatedAt: string };
export const DEFAULT_PERMISSIONS: Record<Permission, boolean> = { journal: true, eleves: true, synthese: true, fiches: true, utilisateurs: false };
export const STUDENT_STATUS = { ok: "En règle", watch: "À surveiller", call: "À convoquer" } as const;
export function getStudentStatus(studentId: string, entries: Entry[], school: School) {
  const own = entries.filter((entry) => entry.eleveId === studentId);
  const retards = own.filter((entry) => entry.type === "Retard").length;
  const absences = own.filter((entry) => entry.type === "Absence" && entry.justifie === "Non").length;
  const renvois = own.filter((entry) => entry.type === "Renvoi").length;
  const status = renvois >= school.seuilRenvois ? STUDENT_STATUS.call : retards >= school.seuilRetards || absences >= school.seuilAbsences ? STUDENT_STATUS.watch : STUDENT_STATUS.ok;
  return { retards, absences, renvois, status };
}
export function formatDate(value: string | Date, includeTime = false) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", ...(includeTime ? { timeStyle: "short" as const } : {}) }).format(date);
}
export const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
