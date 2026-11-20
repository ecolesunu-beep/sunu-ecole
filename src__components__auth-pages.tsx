"use client";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck, KeyRound, AlertCircle, LayoutGrid, Compass } from "lucide-react";
import { Brand } from "@/components/brand";
import { onSessionChange, readSession, saveSession } from "@/lib/tab-session";
import { apiJson } from "@/lib/client-api";
import { destinationForMember, loginFor, moduleForPath } from "@/lib/workspace-navigation";
import type { Person } from "@/lib/types";
import { photos } from "@/lib/media";
import { isPasswordProvided } from "@/lib/password";

type Mode = "login" | "signup" | "forgot" | "reset";
export function PasswordField({ value, onChange, autocomplete = "current-password", id = "password", label = "Mot de passe" }: { value: string; onChange: (value: string) => void; autocomplete?: string; id?: string; label?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="field"><label htmlFor={id}>{label}</label><div className="input-wrap"><input id={id} className="input" type={visible ? "text" : "password"} autoComplete={autocomplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} required placeholder={autocomplete === "new-password" ? "Choisissez votre mot de passe" : "Votre mot de passe"} /><button type="button" aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>;
}
export function AuthView({ mode, token = "", nextPath = "/dashboard" }: { mode: Mode; token?: string; nextPath?: string }) {
  const router = useRouter();
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState(""), [school, setSchool] = useState(""), [type, setType] = useState("Collège"), [choice, setChoice] = useState<"create" | "join">("create");
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [busy, setBusy] = useState(false);
  const [bySchool, setBySchool] = useState(false);
  const [opening, setOpening] = useState("");
  const [resumeError, setResumeError] = useState("");
  const existingSession = useSyncExternalStore(onSessionChange, readSession, () => null);
  const [establishment, setEstablishment] = useState("");
  const selectedPage = moduleForPath(nextPath)?.title || "Votre espace école";
  const signupHref = nextPath === "/dashboard" ? "/inscription" : `/inscription?${new URLSearchParams({ next: nextPath })}`;
  useEffect(() => {
    if (mode !== "login") return;
    const existing = existingSession;
    if (!existing) return;
    const controller = new AbortController();
    // A token in storage alone is not proof of identity: verify on the server.
    apiJson<{ user: Person }>("/api/auth/me", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) }).then(({ user }) => {
      if (!controller.signal.aborted && readSession() === existing) {
        const destination = destinationForMember(nextPath, user);
        setOpening(destination); router.replace(destination);
      }
    }).catch(() => { if (!controller.signal.aborted && readSession() === existing) setResumeError("La connexion au service est momentanément indisponible. Votre session a été conservée."); });
    return () => controller.abort();
  }, [mode, nextPath, router, existingSession]);
  const titles = { login: "Bon retour parmi nous.", signup: "Créons votre espace.", forgot: "Retrouvons votre accès.", reset: "Un nouveau départ." };
  const descriptions = { login: "Connectez-vous pour ouvrir les rubriques de votre établissement.", signup: "Votre établissement et votre équipe réunis dans un seul espace.", forgot: "Saisissez votre email pour recevoir un lien de réinitialisation valable 30 minutes.", reset: "Choisissez le mot de passe que vous souhaitez utiliser pour vous connecter." };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(""); setSuccess("");
    if (mode !== "forgot" && !isPasswordProvided(password)) { setError("Renseignez votre mot de passe."); return; }
    if (mode === "reset" && !token) { setError("Lien de réinitialisation manquant ou invalide."); return; }
    setBusy(true);
    const endpoint = mode === "signup" ? "signup" : mode === "login" ? "login" : mode === "forgot" ? "forgot" : "reset";
    const payload = mode === "signup" ? { nom: name, email, password, mode: choice, nomEcole: school, type, code } : mode === "login" ? (bySchool ? { identifier: "school", nom: name, establishment, password } : { email, password, code }) : mode === "forgot" ? { email } : { token, password };
    try {
      const response = await fetch(`/api/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000), body: JSON.stringify(payload) });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Le service de connexion ne répond pas. Réessayez dans un instant.");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Impossible de continuer.");
      if (mode === "forgot" || mode === "reset") { setSuccess(result.message); setPassword(""); }
      else {
        saveSession(result.sessionToken);
        setPassword("");
        const destination = destinationForMember(mode === "signup" && nextPath === "/dashboard" && result.redirect === "/onboarding" ? "/onboarding" : nextPath, result.user);
        setOpening(destination); router.replace(destination);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de continuer."); } finally { setBusy(false); }
  }
  if (opening) return <main className="secure-launch"><section className="secure-launch__card"><Brand /><div className="secure-launch__icon"><LayoutGrid size={23} /></div><span className="eyebrow">Connexion réussie</span><h1>Votre espace est prêt.</h1><p role="status">Ouverture de la rubrique : <strong>{moduleForPath(opening)?.title || "Configuration de votre école"}</strong>.</p><Link href={opening} replace className="btn btn--navy">Continuer vers cette page <ArrowRight size={16} /></Link></section></main>;
  if (mode === "login" && existingSession) return <main className="secure-launch"><section className="secure-launch__card"><Brand /><h1>Reprise de votre espace</h1><p role="status">{resumeError || "Votre session est en cours de vérification…"}</p><Link href={nextPath} replace className="btn btn--navy">Reprendre mon espace <ArrowRight size={16} /></Link></section></main>;
  return <main className="auth-layout"><div className="auth-side"><Image className="auth-side__photo" src={photos.hero} alt="Élèves dans une salle de classe" fill sizes="(max-width:760px) 100vw, 48vw" priority /><div className="auth-side__brand"><Brand light /></div><div className="auth-side__copy"><span className="eyebrow eyebrow--light">L'espace de votre établissement</span><h2 className="serif-title">Chaque suivi compte.</h2><p>Notre école, notre discipline, notre suivi. Un travail d'équipe, une vision partagée.</p></div></div><div className="auth-main"><div className="auth-form"><div className="auth-form__top"><span className="eyebrow">Sunu École</span><Link href="/" className="text-link"><ArrowLeft size={14} /> Accueil</Link></div><h1>{titles[mode]}</h1><p className="auth-form__lead">{descriptions[mode]}</p>{(mode === "login" || (mode === "signup" && nextPath !== "/dashboard")) && <div className="login-destination"><Compass size={17} aria-hidden="true" /><span>Après la connexion : <strong>{selectedPage}</strong></span></div>}<form onSubmit={submit}>
    {mode === "signup" && <><div className="field"><label htmlFor="auth-name">Votre nom</label><input id="auth-name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom complet" /></div></>}
    {mode !== "reset" && !(mode === "login" && bySchool) && <div className="field"><label htmlFor="auth-email">Adresse e-mail</label><input id="auth-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Votre adresse e-mail" /></div>}
    {mode === "login" && bySchool && <><div className="field"><label htmlFor="login-establishment">Nom de votre établissement ou code de l’école</label><input id="login-establishment" className="input" autoComplete="organization" required value={establishment} onChange={(event) => setEstablishment(event.target.value)} placeholder="Votre établissement" /></div><div className="field"><label htmlFor="login-member">Votre nom sur le compte</label><input id="login-member" className="input" autoComplete="username" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom complet" /></div></>}
    {mode === "signup" && <><span className="field-label" style={{ display: "block", margin: "22px 0 9px" }}>Votre parcours</span><div className="choice-row"><button type="button" className={`choice ${choice === "create" ? "active" : ""}`} onClick={() => setChoice("create")}><ShieldCheck size={19} /> Je crée une école<small>Je serai Surveillant Général</small></button><button type="button" className={`choice ${choice === "join" ? "active" : ""}`} onClick={() => setChoice("join")}><KeyRound size={19} /> Je rejoins une école<small>J'ai un code d'invitation</small></button></div>{choice === "create" ? <><div className="field"><label htmlFor="auth-school">Nom de l'établissement</label><input id="auth-school" className="input" required value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Nom officiel de l'établissement" /></div><div className="field"><label htmlFor="auth-type">Type d'établissement</label><select id="auth-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>{["Primaire", "Collège", "Lycée", "Université", "Autre"].map((item) => <option key={item}>{item}</option>)}</select></div></> : <div className="field"><label htmlFor="auth-code">Code de parrainage de votre école</label><input id="auth-code" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="SUNU-XXXXXXXX" autoCapitalize="characters" /><span className="field-hint">Demandez ce code à votre Surveillant Général.</span></div>}</>}
    {(mode === "login" || mode === "signup" || mode === "reset") && <PasswordField id={`password-${mode}`} value={password} onChange={setPassword} autocomplete={mode === "login" ? "current-password" : "new-password"} label={mode === "reset" ? "Nouveau mot de passe" : "Mot de passe"} />}
    {mode === "login" && <>{!bySchool && <div className="field"><label htmlFor="login-code">Code de parrainage de votre école <span className="muted" style={{ fontWeight: 500 }}>(si vous rejoignez une école existante)</span></label><input id="login-code" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUNU-XXXXXXXX (facultatif)" /></div>}<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "-2px 0 22px" }}><button type="button" className="text-link" onClick={() => { setBySchool(!bySchool); setError(""); setCode(""); }}>{bySchool ? "Utiliser mon e-mail" : "Avec mon nom et mon établissement"}</button><Link href="/mot-de-passe-oublie" className="text-link">Mot de passe oublié ?</Link></div></>}
    {error && <div className="form-error" role="alert"><AlertCircle size={16} style={{ flexShrink: 0 }} /> {error}</div>}{success && <div className="form-success" role="status">{success}{mode === "reset" && <span> <Link href="/login" style={{ textDecoration: "underline" }}>Se connecter</Link></span>}</div>}
    <button className="btn btn--navy" type="submit" disabled={busy} style={{ width: "100%", marginTop: 6 }}>{busy ? <><span className="spinner" /> Traitement en cours...</> : <>{mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon espace" : mode === "forgot" ? "Envoyer le lien" : "Enregistrer le nouveau mot de passe"} <ArrowRight size={17} /></>}</button>
  </form><div className="auth-bottom">{mode === "login" ? <>Pas encore de compte ? <Link href={signupHref}>Commencer</Link></> : mode === "signup" ? <>Déjà membre ? <Link href={loginFor(nextPath)}>Se connecter</Link></> : <Link href="/login">Retour à la connexion</Link>}</div><Link href="/espace-ecole" className="auth-directory-link"><LayoutGrid size={14} /> Voir toutes les rubriques</Link><p style={{ textAlign: "center", color: "#99a7b5", fontSize: 11, marginTop: 30 }}>Besoin d'aide ? <a href="mailto:ecolesunu@gmail.com" style={{ color: "#0b2c4a" }}>ecolesunu@gmail.com</a></p></div></div></main>;
}
