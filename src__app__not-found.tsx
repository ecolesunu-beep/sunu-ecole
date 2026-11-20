import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export default function NotFoundPage() {
  return <PublicShell><section className="inner-hero"><div className="container inner-hero__inner"><span className="eyebrow eyebrow--light">Page introuvable</span><h1 className="serif-title">Cette page n'existe <span className="gold-highlight">pas.</span></h1><p>L'adresse demandée est incorrecte ou la page a été déplacée.</p></div></section><section className="section"><div className="container"><div className="panel" style={{ maxWidth: 620, margin: "0 auto", textAlign: "center", padding: 45 }}><div className="empty-state__icon" style={{ margin: "0 auto 16px" }}><SearchX size={24} /></div><h2 style={{ fontSize: 22, margin: "0 0 9px" }}>Retrouvons votre chemin</h2><p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>Revenez à l'accueil ou consultez les fonctionnalités de la plateforme.</p><div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 22 }}><Link href="/" className="btn btn--navy"><ArrowLeft size={16} /> Accueil</Link><Link href="/fonctionnalites" className="btn btn--outline">Fonctionnalités</Link></div></div></div></section></PublicShell>;
}
