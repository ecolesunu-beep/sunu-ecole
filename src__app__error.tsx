"use client";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Brand } from "@/components/brand";

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, background: "#f4f6f8" }}><section className="panel" style={{ maxWidth: 480, padding: 32 }}><Brand /><h1 style={{ fontSize: 27, lineHeight: 1.2, margin: "27px 0 12px", color: "#0b2c4a" }}>Cette page n’a pas pu s’ouvrir.</h1><p className="muted" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>Réessayez de charger la page. Si le problème persiste, vous pouvez revenir à l’accueil.</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button className="btn btn--navy" onClick={reset}><RefreshCw size={16} /> Réessayer</button><Link className="btn btn--outline" href="/"><ArrowLeft size={16} /> Accueil</Link></div></section></main>;
}
