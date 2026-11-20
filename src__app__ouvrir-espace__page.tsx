"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";

const subscribe = () => () => {};
function destination() {
  const path = window.location.pathname;
  return /^\/(?:login|connexion|inscription|onboarding|dashboard|journal|eleves|synthese|fiche-renvoi|historique|parametres|utilisateurs|mot-de-passe-oublie|reinitialiser)(?:\/|$)/.test(path) ? path + window.location.search : "/login";
}

// This document contains no account details or credential fields. An embedded
// navigation to a protected URL is rewritten here, never to the actual workspace.
export default function OpenWorkspacePage() {
  const href = useSyncExternalStore(subscribe, destination, () => "/login");
  return <main className="secure-launch"><div className="secure-launch__card"><Brand /><div className="secure-launch__icon"><LockKeyhole size={24} strokeWidth={1.7} /></div><span className="eyebrow">Espace sécurisé</span><h1>Ouvrir votre espace Sunu École</h1><p>La connexion et les dossiers de votre école s’ouvrent dans un onglet dédié, en dehors de la prévisualisation.</p><a className="btn btn--navy" href={href} target="_blank" rel="noopener">Continuer dans un nouvel onglet <ArrowUpRight size={16} /></a><Link href="/espace-ecole" className="text-link"><ArrowLeft size={15} /> Voir les rubriques de l’école</Link></div></main>;
}
