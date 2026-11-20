"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { House, LayoutGrid, LogOut, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { moduleIcons } from "@/components/workspace-directory";
import { moduleForPath, modulesForMember, type WorkspaceMember, type WorkspaceModule } from "@/lib/workspace-navigation";

export function WorkspaceNavigation({ member, schoolName, pathname, open, onOpenChange, onLogout }: {
  member: WorkspaceMember; schoolName: string; pathname: string; open: boolean; onOpenChange: (open: boolean) => void; onLogout: () => void;
}) {
  const sidebar = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const items = modulesForMember(member);
  const active = moduleForPath(pathname)?.key;
  const keys = new Set(["dashboard", "journal", "students"]);
  const primary = items.filter((item) => keys.has(item.key));
  const general = member.role === "Surveillant Général";
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scroll = document.body.style.overflow;
    const media = window.matchMedia("(max-width: 760px)");
    const resize = () => { if (!media.matches) onOpenChange(false); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onOpenChange(false); return; }
      if (event.key !== "Tab" || !sidebar.current) return;
      const controls = Array.from(sidebar.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')).filter((el) => el.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    document.addEventListener("keydown", keydown);
    media.addEventListener("change", resize);
    return () => {
      window.cancelAnimationFrame(frame); document.body.style.overflow = scroll;
      document.removeEventListener("keydown", keydown); media.removeEventListener("change", resize);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, onOpenChange]);
  const renderLink = (item: WorkspaceModule) => {
    const Icon = moduleIcons[item.key];
    return <Link key={item.key} href={item.href} className={`sidebar-link ${item.key === active ? "active" : ""}`} aria-current={item.key === active ? "page" : undefined} onClick={() => onOpenChange(false)}><Icon strokeWidth={1.8} aria-hidden="true" />{item.label}</Link>;
  };
  return <>
    {open && <button type="button" tabIndex={-1} aria-label="Fermer la navigation" className="mobile-overlay open" onClick={() => onOpenChange(false)} />}
    <aside ref={sidebar} id="school-navigation" className={`app-sidebar ${open ? "open" : ""}`} role={open ? "dialog" : undefined} aria-modal={open || undefined} aria-label="Pages de mon école">
      <div className="sidebar-brand"><Brand light href="/dashboard" /><button ref={closeButton} className="sidebar-close" type="button" onClick={() => onOpenChange(false)} aria-label="Fermer le menu"><X size={18} /></button></div>
      <nav className="sidebar-links" aria-label="Navigation de l'application">
        <div className="sidebar-subtitle">ESPACE ÉCOLE</div>
        {items.filter((item) => item.area !== "Administration").map(renderLink)}
        <div className="sidebar-subtitle">{general ? "ADMINISTRATION" : "COMPTE"}</div>
        {items.filter((item) => item.area === "Administration").map(renderLink)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-bottom__school" title={schoolName}>{schoolName}</div><div className="sidebar-bottom__role">{member.role}</div><Link href="/" className="sidebar-logout"><House size={15} /> Accueil du site</Link><button type="button" className="sidebar-logout" onClick={onLogout}><LogOut size={16} /> Se déconnecter</button></div>
    </aside>
    <nav className="workspace-dock" aria-label="Navigation rapide" inert={open || undefined}>
      {primary.map((item) => { const Icon = moduleIcons[item.key]; return <Link href={item.href} key={item.key} className={`dock-link ${item.key === active ? "active" : ""}`} aria-current={item.key === active ? "page" : undefined}><Icon size={19} strokeWidth={1.7} />{item.label}</Link>; })}
      <button type="button" className={`dock-link ${!active || !keys.has(active) ? "active" : ""}`} aria-label="Toutes les pages" aria-controls="school-navigation" aria-expanded={open} onClick={() => onOpenChange(true)}><LayoutGrid size={19} strokeWidth={1.7} />Pages</button>
    </nav>
  </>;
}
