"use client";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, ArrowUpRight, ChartNoAxesCombined, ClipboardList, FileText, GraduationCap, History, LayoutDashboard, LayoutGrid, LockKeyhole, Settings2, Users } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/workspace-link";
import { onSessionChange, readSession } from "@/lib/tab-session";
import { loginFor, modulesForMember, workspaceModules, type WorkspaceArea, type WorkspaceMember, type WorkspaceModule } from "@/lib/workspace-navigation";

export const moduleIcons = { dashboard: LayoutDashboard, journal: ClipboardList, students: GraduationCap, summary: ChartNoAxesCombined, forms: FileText, history: History, settings: Settings2, team: Users };
const areas: (WorkspaceArea | "Toutes")[] = ["Toutes", "Pilotage", "Suivi des élèves", "Administration"];

export function WorkspaceDirectory({ member }: { member?: WorkspaceMember }) {
  const [area, setArea] = useState<WorkspaceArea | "Toutes">("Toutes");
  const session = useSyncExternalStore(onSessionChange, readSession, () => null);
  const items = member ? modulesForMember(member) : workspaceModules;
  const groups = areas.filter((group) => group === "Toutes" || items.some((item) => item.area === group));
  const shown = items.filter((item) => area === "Toutes" || item.area === area);
  const href = (item: WorkspaceModule) => member || session ? item.href : loginFor(item.href);
  return <section className={`workspace-directory ${member ? "workspace-directory--inside" : "workspace-directory--public"}`} id="rubriques" aria-labelledby="directory-title">
    <div className={member ? "directory-inner" : "container directory-inner"}>
      <div className="directory-heading"><div>
        {!member && <span className="eyebrow">Espace école</span>}
        <h2 id="directory-title" className={member ? "" : "serif-title"}>{member ? "Mes rubriques" : "Les pages de votre école."}</h2>
        <p>{member ? "Ouvrez une rubrique de votre espace de travail." : "Choisissez une rubrique. La connexion vous y conduira directement."}</p>
      </div><span className="directory-count"><LayoutGrid size={14} aria-hidden="true" />{items.length} rubriques</span></div>
      {!member && <div className="directory-filters" role="group" aria-label="Filtrer les rubriques">{groups.map((group) => <button type="button" aria-pressed={area === group} key={group} onClick={() => setArea(group)}>{group}</button>)}</div>}
      <nav className="directory-grid" aria-label={member ? "Accès directs à mes rubriques" : "Répertoire des pages de l’école"}>
        {shown.map((item) => { const Icon = moduleIcons[item.key]; return <Link className="directory-card" href={href(item)} key={item.key} aria-label={`Ouvrir ${item.title}`}>
          <div className="directory-card__lead"><span className="directory-icon"><Icon size={member ? 18 : 22} strokeWidth={1.65} aria-hidden="true" /></span>{!member && <span className="directory-index">{String(workspaceModules.findIndex((module) => module.key === item.key) + 1).padStart(2, "0")}</span>}</div>
          <div className="directory-card__body"><strong>{member ? item.label : item.title}</strong><p>{item.description}</p></div>
          <ArrowUpRight className="directory-arrow" size={16} aria-hidden="true" />
        </Link>; })}
      </nav>
      {!member && <div className="directory-note"><LockKeyhole size={14} aria-hidden="true" /><span>Les données de votre école restent privées. Les rubriques disponibles dépendent de vos permissions.</span></div>}
    </div>
  </section>;
}

/** Direct entry without a second login when this tab already has a session. */
export function WorkspaceEntry({ className = "btn btn--gold", guestLabel = "Se connecter" }: { className?: string; guestLabel?: string }) {
  const session = useSyncExternalStore(onSessionChange, readSession, () => null);
  return <Link className={className} href={session ? "/dashboard" : "/login"}>{session ? "Mon tableau de bord" : guestLabel}<ArrowRight size={16} aria-hidden="true" /></Link>;
}
