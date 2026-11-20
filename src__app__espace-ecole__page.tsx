import type { Metadata } from "next";
import { ArrowRight, Layers3 } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { WorkspaceDirectory, WorkspaceEntry } from "@/components/workspace-directory";

export const metadata: Metadata = { title: "Espace école", description: "Retrouvez le tableau de bord et toutes les rubriques de votre établissement." };
export default function WorkspaceDirectoryPage() {
  return <PublicShell>
    <section className="directory-hero"><div className="container directory-hero__inner"><div>
      <span className="eyebrow eyebrow--light">Votre espace de travail</span>
      <h1 className="serif-title">Espace <em>école.</em></h1>
      <p>Du journal quotidien au bilan par classe, retrouvez les outils de votre établissement.</p>
      <div className="directory-hero__actions"><WorkspaceEntry guestLabel="Accéder à mon tableau de bord" /><a className="directory-jump" href="#rubriques">Voir les rubriques <ArrowRight size={15} /></a></div>
    </div><div className="directory-emblem" aria-hidden="true"><i /><i /><i /><Layers3 size={64} strokeWidth={1} /></div></div></section>
    <WorkspaceDirectory />
  </PublicShell>;
}
