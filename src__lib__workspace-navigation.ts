import type { Permission } from "@/lib/types";

export type WorkspaceArea = "Pilotage" | "Suivi des élèves" | "Administration";
export type WorkspaceModule = {
  key: "dashboard" | "journal" | "students" | "summary" | "forms" | "history" | "settings" | "team";
  href: string;
  label: string;
  title: string;
  description: string;
  area: WorkspaceArea;
  permission?: Permission;
  generalOnly?: boolean;
};
export const workspaceModules: readonly WorkspaceModule[] = [
  { key: "dashboard", href: "/dashboard", label: "Tableau de bord", title: "Tableau de bord", description: "Les événements du jour et les situations à suivre.", area: "Pilotage" },
  { key: "journal", href: "/journal", label: "Journal", title: "Journal de discipline", description: "Enregistrer un retard, une absence ou un renvoi.", area: "Suivi des élèves", permission: "journal" },
  { key: "students", href: "/eleves", label: "Élèves", title: "Gestion des élèves", description: "Importer une liste et retrouver le dossier d’un élève.", area: "Suivi des élèves", permission: "eleves" },
  { key: "summary", href: "/synthese", label: "Synthèse", title: "Synthèse disciplinaire", description: "Comparer les classes et consulter les bilans par période.", area: "Pilotage", permission: "synthese" },
  { key: "forms", href: "/fiche-renvoi", label: "Fiche de renvoi", title: "Fiche de renvoi", description: "Préparer, imprimer et retrouver les fiches de renvoi.", area: "Suivi des élèves", permission: "fiches" },
  { key: "history", href: "/historique", label: "Historique", title: "Historique des actions", description: "Retrouver les opérations effectuées par votre équipe.", area: "Pilotage" },
  { key: "settings", href: "/parametres", label: "Paramètres", title: "Paramètres", description: "Gérer l’établissement, ses seuils et votre compte.", area: "Administration" },
  { key: "team", href: "/utilisateurs", label: "Utilisateurs", title: "Gestion des utilisateurs", description: "Inviter vos collègues et attribuer leurs accès.", area: "Administration", generalOnly: true },
];
export type WorkspaceMember = { role: string; permissions: Record<string, boolean> };

export function moduleForPath(value: string) {
  const path = value.split(/[?#]/)[0];
  return workspaceModules.find((item) => item.href === path || (item.key === "students" && /^\/eleves\/[a-f0-9-]{36}$/i.test(path)));
}
export function canOpenModule(item: WorkspaceModule, member: WorkspaceMember) {
  return member.role === "Surveillant Général" || (!item.generalOnly && (!item.permission || member.permissions?.[item.permission] === true));
}
export function modulesForMember(member: WorkspaceMember): WorkspaceModule[] {
  return workspaceModules.filter((item) => canOpenModule(item, member)).map((item) => item.key === "settings" && member.role !== "Surveillant Général" ? { ...item, label: "Mon compte", title: "Mon compte", description: "Consulter vos paramètres personnels et modifier votre mot de passe." } : item);
}

const isUuid = (value: string) => /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
/** Only local, known workspace destinations and supported actions can survive sign-in. */
export function safeWorkspaceDestination(input: unknown, fallback = "/dashboard"): string {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//") || input.length > 512 || /[\\\u0000-\u001f]/.test(input)) return fallback;
  try {
    const url = new URL(input, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || url.hash) return fallback;
    const path = url.pathname.replace(/\/$/, "");
    if (path.split("/").length > 2 && !(path.startsWith("/eleves/") && isUuid(path.slice(8)))) return fallback;
    if (!moduleForPath(path) && path !== "/onboarding") return fallback;
    const params = new URLSearchParams();
    if (path === "/journal" && ["Retard", "Absence", "Renvoi"].includes(url.searchParams.get("ajouter") || "")) params.set("ajouter", url.searchParams.get("ajouter")!);
    if (path === "/eleves" && url.searchParams.get("import") === "1") params.set("import", "1");
    if (path === "/eleves" && isUuid(url.searchParams.get("modifier") || "")) params.set("modifier", url.searchParams.get("modifier")!);
    if (path === "/fiche-renvoi" && isUuid(url.searchParams.get("eleve") || "")) params.set("eleve", url.searchParams.get("eleve")!);
    const query = params.toString();
    return path + (query ? `?${query}` : "");
  } catch { return fallback; }
}
export function destinationForMember(input: unknown, member: WorkspaceMember) {
  const destination = safeWorkspaceDestination(input);
  if (destination === "/onboarding") return member.role === "Surveillant Général" ? destination : "/dashboard";
  const item = moduleForPath(destination);
  return item && canOpenModule(item, member) ? destination : "/dashboard";
}
export function loginFor(destination: string) {
  const next = safeWorkspaceDestination(destination);
  return next === "/dashboard" ? "/login" : `/login?${new URLSearchParams({ next }).toString()}`;
}
