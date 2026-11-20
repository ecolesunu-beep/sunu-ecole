"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, House, LockKeyhole, LogOut, Menu, School, Settings2, WifiOff } from "lucide-react";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { canOpenModule, loginFor, moduleForPath } from "@/lib/workspace-navigation";
import { Brand } from "@/components/brand";
import type { Person, Snapshot } from "@/lib/types";
import { clearSession, onSessionChange, readSession } from "@/lib/tab-session";
import { apiJson, watchSchoolChanges } from "@/lib/client-api";
export { apiFetch, apiJson, jsonRequest } from "@/lib/client-api";

type Context = { data: Snapshot; reload: () => Promise<void>; toast: (message: string) => void; online: boolean; busy: boolean; setBusy: (value: boolean) => void };
const SchoolContext = createContext<Context | null>(null);
export function useSchool() { const context = useContext(SchoolContext); if (!context) throw new Error("Contexte de l’école indisponible."); return context; }

function AccountMenu({ user, onLogout }: { user: Person; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => { const id = window.setTimeout(() => setOpen(false), 0); return () => window.clearTimeout(id); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => { if (e.target instanceof Node && !container.current?.contains(e.target)) setOpen(false); };
    const closeEscape = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside); document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  const initials = user.nom.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <div ref={container} className="workspace-account">
    <button ref={trigger} type="button" className="workspace-account__trigger" aria-label="Options du compte" aria-expanded={open} aria-controls="workspace-account-links" onClick={() => setOpen(!open)}>
      <span className="workspace-account__initials" aria-hidden="true">{initials}</span><span className="workspace-account__name">{user.nom}</span><span className="workspace-account__role">{user.role}</span><ChevronDown size={13} />
    </button>
    {open && <div className="workspace-account__menu" id="workspace-account-links">
      <div className="workspace-account__details"><strong>{user.nom}</strong><span>{user.email || user.role}</span></div>
      <Link href="/parametres" onClick={() => setOpen(false)}><Settings2 size={15} /> Mon compte</Link>
      <Link href="/" onClick={() => setOpen(false)}><House size={15} /> Accueil du site</Link>
      <button type="button" onClick={() => { setOpen(false); onLogout(); }}><LogOut size={15} /> Se déconnecter</button>
    </div>}
  </div>;
}

function AccessPanel({ pathname, busy, error, onRetry }: { pathname: string; busy: boolean; error: string; onRetry: () => void }) {
  const [target, setTarget] = useState(pathname);
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { setTarget(window.location.pathname + window.location.search); setEmbedded(window.self !== window.top); }, 0); return () => window.clearTimeout(timer); }, [pathname]);
  const title = moduleForPath(pathname)?.title || "Ouvrir votre espace";
  return <main className="access-stage"><header className="access-stage__bar"><Brand /><Link href="/espace-ecole" className="text-link"><ArrowLeft size={14} /> Toutes les rubriques</Link></header>
    <section className="access-stage__card"><span className="access-stage__icon">{busy ? <span className="spinner" /> : error ? <WifiOff size={23} /> : <LockKeyhole size={23} />}</span>
      <span className="eyebrow">Espace école</span><h1>{title}</h1>
      {busy ? <p role="status">Ouverture de votre espace…</p> : error ? <><p role="status">{error}</p><div className="access-stage__actions"><button type="button" className="btn btn--navy" onClick={onRetry}>Réessayer</button>{embedded && <a href={target} target="_blank" rel="noopener" className="btn btn--outline">Ouvrir hors de l’aperçu <ArrowRight size={15} /></a>}</div></> : <><p>Connectez-vous une seule fois sur ce navigateur pour ouvrir cette rubrique et retrouver les données de votre établissement.</p><Link href={loginFor(target)} className="btn btn--navy">Ouvrir mon espace <ArrowRight size={15} /></Link></>}
    </section>
  </main>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname();
  const session = useSyncExternalStore(onSessionChange, readSession, () => null);
  const [record, setRecord] = useState<{ credential: string; snapshot: Snapshot } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [online, setOnline] = useState(true), [menu, setMenu] = useState(false), [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const data = record && record.credential === session ? record.snapshot : null;
  const memberId = data?.user.id;
  const latestRef = useRef<{ credential: string; id?: string } | null>(null);
  const refreshing = useRef<string | null>(null);
  const toast = useCallback((text: string) => { const id = Date.now() + Math.random(); setMessages((items) => [...items, { id, text }].slice(-4)); window.setTimeout(() => setMessages((items) => items.filter((item) => item.id !== id)), 5200); }, []);
  const reload = useCallback(async () => {
    const credential = readSession();
    if (!credential) { setRecord(null); setError(""); setLoading(false); return; }
    if (refreshing.current === credential) return;
    refreshing.current = credential;
    try {
      const fresh = await apiJson<Snapshot>("/api/data/snapshot");
      if (readSession() !== credential) return;
      const last = latestRef.current;
      if (last?.credential === credential && last.id && fresh.history[0]?.id !== last.id) {
        const position = fresh.history.findIndex((event) => event.id === last.id);
        const other = fresh.history.slice(0, position < 0 ? 1 : position).find((event) => event.utilisateurId !== fresh.user.id && /ajouté|créée|créé/i.test(event.action));
        if (other) toast(`Nouvelle saisie par ${other.qui} — ${other.action} — ${other.details}`);
      }
      latestRef.current = { credential, id: fresh.history[0]?.id };
      setRecord({ credential, snapshot: fresh }); setError("");
    } catch (cause) {
      // sessionRequest only clears an explicitly invalid credential. A transient
      // authentication/proxy problem leaves the current screen and session in place.
      if (readSession() !== credential) return;
      setError(cause instanceof Error ? cause.message : "La synchronisation a échoué.");
    } finally { if (refreshing.current === credential) { refreshing.current = null; setLoading(false); } }
  }, [toast]);
  useEffect(() => { const timer = window.setTimeout(() => { setOnline(navigator.onLine); void reload(); }, 0); return () => clearTimeout(timer); }, [reload, session]);
  useEffect(() => {
    const reconnect = () => { setOnline(true); void reload(); };
    const disconnect = () => setOnline(false);
    document.addEventListener("visibilitychange", reconnectWhenVisible);
    function reconnectWhenVisible() { if (!document.hidden && navigator.onLine) void reload(); }
    window.addEventListener("online", reconnect); window.addEventListener("offline", disconnect);
    return () => { window.removeEventListener("online", reconnect); window.removeEventListener("offline", disconnect); document.removeEventListener("visibilitychange", reconnectWhenVisible); };
  }, [reload]);
  useEffect(() => {
    if (!session || !online) return;
    const polling = window.setInterval(() => { if (!document.hidden) void reload(); }, 4000);
    const stop = memberId ? watchSchoolChanges(() => { if (navigator.onLine) void reload(); }) : undefined;
    return () => { window.clearInterval(polling); stop?.(); };
  }, [memberId, online, reload, session]);
  useEffect(() => { const timer = window.setTimeout(() => setMenu(false), 0); return () => clearTimeout(timer); }, [pathname, session]);
  async function logout() {
    const credential = readSession();
    // Remove the local credential now; the fetch has already captured its header.
    const request = apiJson("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(8000) });
    if (credential) clearSession(credential);
    setRecord(null); setMenu(false); router.replace("/");
    await request.catch(() => {});
  }
  if (!data) return <AccessPanel pathname={pathname} busy={loading || Boolean(session && !error)} error={session ? error : ""} onRetry={() => { setError(""); void reload(); }} />;
  const current = moduleForPath(pathname);
  const allowed = current ? canOpenModule(current, data.user) : pathname !== "/onboarding" || data.user.role === "Surveillant Général";
  return <SchoolContext.Provider value={{ data, reload, toast, online, busy, setBusy }}><div className="app-shell">
    <WorkspaceNavigation member={data.user} schoolName={data.school.nomEcole} pathname={pathname} open={menu} onOpenChange={setMenu} onLogout={logout} />
    <div className="app-workspace" inert={menu || undefined}>
      <header className="app-topbar"><div className="app-topbar__left"><button type="button" className="mobile-sidebar-toggle" aria-label="Ouvrir le menu" aria-controls="school-navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={17} /><span>Menu</span></button><span className="workspace-school-icon"><School size={17} strokeWidth={1.8} /></span><span className="app-topbar__school">{data.school.nomEcole}</span></div>
        <div className="app-topbar__right"><div className={`sync ${online && !error ? "" : "offline"}`} title={`Dernière mise à jour : ${new Date(data.updatedAt).toLocaleTimeString("fr-FR")}`}><span className="sync-dot" /><span className="sync-label">{!online ? "Hors ligne" : error ? "Synchronisation en attente" : "Synchronisé"}</span></div><AccountMenu user={data.user} onLogout={logout} /></div>
      </header>
      {!online && <div className="offline-banner"><WifiOff size={15} /> Mode hors-ligne — synchronisation au retour de la connexion.</div>}
      {error && online && <div className="offline-banner"><WifiOff size={15} /> {error} <button type="button" onClick={() => void reload()}>Réessayer</button></div>}
      <main className="app-content">{allowed ? children : <section className="panel"><div className="page-heading__eyebrow">Accès à une rubrique</div><h1>Cette rubrique n’est pas accessible à votre compte.</h1><p className="muted" style={{ margin: "12px 0 20px" }}>Retrouvez les pages autorisées dans « Mes rubriques » ou adressez-vous au Surveillant Général de votre école.</p><Link className="btn btn--navy" href="/dashboard#rubriques"><ArrowLeft size={15} /> Revenir à mes rubriques</Link></section>}</main>
    </div></div>{messages.length > 0 && <div className="toast-stack" role="status">{messages.map((item) => <div className="toast" key={item.id}>{item.text}</div>)}</div>}</SchoolContext.Provider>;
}
