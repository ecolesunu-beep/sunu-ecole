"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { WorkspaceLink as Link } from "@/components/workspace-link";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUpRight, LayoutGrid, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { onSessionChange, readSession } from "@/lib/tab-session";

const links = [
  { href: "/", label: "Accueil" }, { href: "/espace-ecole", label: "Espace école" },
  { href: "/fonctionnalites", label: "Fonctionnalités" }, { href: "/faq", label: "FAQ" }, { href: "/contact", label: "Contact" },
];
export function PublicShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const session = useSyncExternalStore(onSessionChange, readSession, () => null);
  const [scrolled, setScrolled] = useState(false), [menu, setMenu] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { const update = () => setScrolled(window.scrollY > 25); update(); window.addEventListener("scroll", update, { passive: true }); return () => window.removeEventListener("scroll", update); }, []);
  useEffect(() => { const timeout = window.setTimeout(() => setMenu(false), 0); return () => clearTimeout(timeout); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenu(false); toggle.current?.focus(); } };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [menu]);
  return <>
    <header className={`public-header ${scrolled ? "public-header--scrolled" : ""}`}><div className="container public-header__inner">
      <Brand />
      <nav aria-label="Navigation principale" className="public-links">{links.map((link) => <Link key={link.href} className={path === link.href ? "active" : ""} href={link.href} aria-current={path === link.href ? "page" : undefined}>{link.label}</Link>)}</nav>
      <div className="public-actions">{session ? <Link href="/dashboard" className="btn btn--gold">Mon tableau de bord <ArrowRight size={15} /></Link> : <><Link href="/login" className="btn btn--ghost">Se connecter</Link><Link href="/inscription" className="btn btn--gold">Commencer <ArrowUpRight size={15} /></Link></>}</div>
      <Link className="mobile-space-entry" href={session ? "/dashboard" : "/espace-ecole"}><LayoutGrid size={15} aria-hidden="true" />{session ? "Mon espace" : "Espace école"}</Link>
      <button ref={toggle} type="button" className="public-menu-toggle" aria-label={menu ? "Fermer le menu" : "Ouvrir le menu"} aria-controls="public-mobile-menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={23} /> : <Menu size={23} />}</button>
      {menu && <nav id="public-mobile-menu" className="public-mobile" aria-label="Navigation mobile">{links.map((link) => <Link key={link.href} href={link.href} onClick={() => setMenu(false)}>{link.label}</Link>)}{session ? <Link href="/dashboard">Mon tableau de bord</Link> : <><Link href="/login">Se connecter</Link><Link href="/inscription">Commencer</Link></>}</nav>}
    </div></header>
    <main>{children}</main>
    <footer className="public-footer"><div className="container"><div className="public-footer__top"><div><Brand light /><p className="public-footer__desc">Le logiciel de suivi de discipline pour Primaire, Collège, Lycée et Universités — Privé et Public.</p><a className="text-link" style={{ color: "#fff" }} href="mailto:ecolesunu@gmail.com">ecolesunu@gmail.com <ArrowUpRight size={14} /></a></div><div className="public-footer__links">{links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}{session ? <Link href="/dashboard">Mon tableau de bord</Link> : <Link href="/login">Se connecter</Link>}</div></div><div className="public-footer__bottom"><span>Accès libre.</span><span>© 2026 Sunu École — Tous droits réservés.</span></div></div></footer>
  </>;
}
