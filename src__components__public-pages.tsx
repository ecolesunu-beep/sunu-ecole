"use client";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { WorkspaceLink as Link } from "@/components/workspace-link";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { Activity, ArrowRight, ArrowUpRight, BarChart3, CalendarOff, Check, ClipboardList, Clock3, FileText, GraduationCap, LayoutDashboard, Mail, Minus, Plus } from "lucide-react";
import { Reveal } from "@/components/site-motion";
import { photos } from "@/lib/media";
import { moduleIcons } from "@/components/workspace-directory";
import { loginFor, workspaceModules } from "@/lib/workspace-navigation";
import { onSessionChange, readSession } from "@/lib/tab-session";

const essentials = [
  { icon: Clock3, title: "Retards", detail: "Enregistrez les arrivées tardives.", href: "/journal?ajouter=Retard" },
  { icon: CalendarOff, title: "Absences", detail: "Suivez et justifiez les absences.", href: "/journal?ajouter=Absence" },
  { icon: GraduationCap, title: "Dossiers élèves", detail: "Retrouvez chaque dossier en un clic.", href: "/eleves" },
  { icon: Activity, title: "Suivi en direct", detail: "Travaillez sur le même journal.", href: "/journal" },
  { icon: FileText, title: "Fiches de renvoi", detail: "Préparez vos documents à imprimer.", href: "/fiche-renvoi" },
  { icon: BarChart3, title: "Synthèse", detail: "Consultez le bilan par classe.", href: "/synthese" },
];
export function HomeContent() {
  const session = useSyncExternalStore(onSessionChange, readSession, () => null);
  return <>
    <section className="product-hero" aria-labelledby="home-title">
      <div className="product-hero__art" aria-hidden="true"><img src="/images/workspace-hero.jpg" alt="" width="1536" height="1024" fetchPriority="high" /></div>
      <div className="container product-hero__inner">
        <div className="product-hero__copy">
          <span className="product-kicker"><span /> La discipline scolaire, au quotidien</span>
          <h1 id="home-title"><img src="/brand-s-light.svg" alt="" width="51" height="51" /> Sunu École</h1>
          <p className="product-hero__statement">Notre école, notre discipline,<br />notre suivi.</p>
          <p className="product-hero__description">Le logiciel de suivi des retards, absences et renvois, pensé pour les équipes de surveillance.</p>
          <div className="product-hero__actions">
            {session ? <Link href="/dashboard" className="btn btn--gold">Ouvrir mon espace <ArrowRight size={16} /></Link> : <Link href="/inscription" className="btn btn--gold">Commencer <ArrowRight size={16} /></Link>}
            <Link href={session ? "/espace-ecole" : "/dashboard"} className="btn product-btn--glass"><LayoutDashboard size={15} /> {session ? "Voir les rubriques" : "Voir le tableau de bord"}</Link>
          </div>
        </div>
      </div>
      <svg className="product-hero__wave" viewBox="0 0 1440 52" preserveAspectRatio="none" aria-hidden="true"><path fill="#f6f8fc" d="M0,29 C205,68 497,2 829,11 C1081,14 1290,60 1440,34 L1440,52 L0,52 Z" /></svg>
    </section>
    <section className="product-essentials" aria-labelledby="essentials-title"><div className="container">
      <div className="product-section-heading"><span className="product-caption">Vos outils au même endroit</span><h2 id="essentials-title">6 fonctionnalités essentielles</h2><p>Des accès directs aux tâches de votre équipe.</p></div>
      <div className="product-feature-grid">{essentials.map(({ icon: Icon, title, detail, href }) => <Link key={title} href={session ? href : loginFor(href)} className="product-feature"><span className="product-feature__icon"><Icon size={21} strokeWidth={1.9} /></span><strong>{title}</strong><p>{detail}</p><ArrowUpRight size={13} className="product-feature__arrow" aria-hidden="true" /></Link>)}</div>
      <div className="product-section-end"><Link href="/espace-ecole" className="text-link">Toutes les rubriques de l’espace école <ArrowRight size={15} /></Link></div>
    </div></section>
    <section className="product-why"><div className="container product-why__grid">
      <div className="product-why__copy"><span className="product-caption">Pour les équipes de surveillance</span><h2>Un suivi clair, de la saisie au bilan.</h2><p>Retrouvez les informations utiles au même endroit et gardez une trace du suivi de chaque élève.</p><ul>
        <li><Check size={15} /> Importez vos listes d’élèves depuis Excel.</li><li><Check size={15} /> Partagez les saisies avec votre équipe.</li><li><Check size={15} /> Imprimez vos fiches et exportez vos bilans.</li>
      </ul><Link href="/fonctionnalites" className="text-link">Découvrir les fonctionnalités <ArrowRight size={15} /></Link></div>
      <div className="product-why__image"><Image src={photos.classroom} alt="Une salle de classe" fill loading="eager" sizes="(max-width:760px) 100vw, 48vw" /></div>
    </div></section>
  </>;
}
const modulePhotos = { dashboard: photos.students, journal: photos.notebook, students: photos.classroom, summary: photos.lecture, forms: photos.learning, settings: photos.lesson, team: photos.biology, history: photos.teacher };
export function FeaturesContent() {
  const session = useSyncExternalStore(onSessionChange, readSession, () => null);
  return <><section className="inner-hero"><div className="container inner-hero__inner"><span className="eyebrow eyebrow--light">La plateforme, en détail</span><h1 className="serif-title">Tous vos outils.<br /><span className="gold-highlight">Un seul espace.</span></h1><p>Du premier import à la dernière synthèse, chaque module répond à une tâche concrète de votre quotidien.</p></div></section>
    <section className="section section--soft"><div className="container"><div className="feature-grid">{workspaceModules.map((item, i) => {
      const Icon = moduleIcons[item.key];
      return <Reveal key={item.key} delay={i % 2 * .08}><article className="feature-card"><div className="feature-card__text"><div className="feature-card__icon"><Icon size={20} strokeWidth={1.8} /></div><small>MODULE {String(i + 1).padStart(2, "0")}</small><h3>{item.title}</h3><p>{item.description}</p><Link className="feature-route" aria-label={`Ouvrir ${item.title}`} href={session ? item.href : loginFor(item.href)}>Ouvrir la rubrique <ArrowRight size={14} /></Link></div><div className="feature-card__photo"><Image src={modulePhotos[item.key]} alt="Illustration d’un environnement scolaire" width={350} height={340} /></div></article></Reveal>;
    })}</div><div style={{ textAlign: "center", marginTop: 45 }}><Link href="/espace-ecole" className="btn btn--navy">Retrouver toutes les pages <ArrowRight size={17} /></Link></div></div></section></>;
}
const questions = [
  { q: "Où sont les pages après la connexion ?", a: "Après la connexion, le tableau de bord présente vos rubriques. Sur ordinateur, elles sont aussi dans le menu de gauche ; sur téléphone, touchez Pages. Vous pouvez également choisir une page dans Espace école avant de vous connecter. La gestion des utilisateurs est réservée au Surveillant Général." },
  { q: "Comment inviter mon équipe ?", a: "Le Surveillant Général partage le code unique de l'établissement, disponible sur le tableau de bord et dans les paramètres. Les collègues choisissent « Je rejoins une école avec un code » à l'inscription. Il peut également créer un accès temporaire depuis Gestion des utilisateurs." },
  { q: "Comment importer ma liste Excel ?", a: "Depuis Élèves, choisissez « Importer liste Excel », glissez un fichier .xlsx ou .xls, vérifiez l'aperçu et associez les colonnes Prénoms, Nom et Classe. L'import accepte plusieurs onglets. Les doublons peuvent être ignorés ou mis à jour." },
  { q: "Mon école est-elle isolée des autres ?", a: "Oui. Chaque compte est rattaché à un seul établissement. Toutes les opérations métier sont contrôlées côté serveur et filtrées par l'identifiant de votre école. Le code d'une autre école ne permet pas de consulter vos données." },
  { q: "Puis-je changer mes classes et mes seuils ?", a: "Les classes proviennent des élèves que vous créez ou importez : vous pouvez les modifier sur chaque fiche. Le Surveillant Général ajuste les seuils et l'année scolaire dans Paramètres ; les statuts sont recalculés avec les nouvelles valeurs." },
  { q: "Que se passe-t-il si je ferme mon navigateur ?", a: "Vos données sont enregistrées dans PostgreSQL, pas seulement dans votre navigateur. Votre session se retrouve dans les onglets du même navigateur, sans cookie. Un autre appareil ou une session révoquée nécessite une nouvelle connexion." },
  { q: "Peut-on joindre une photo de justificatif ?", a: "Oui. Les images JPG, PNG et WebP sont chiffrées avant stockage, accessibles uniquement aux comptes autorisés de votre établissement grâce à un lien temporaire." },
  { q: "Comment récupérer mon accès ?", a: "Depuis la connexion, choisissez « Mot de passe oublié ». Un lien de réinitialisation valable 30 minutes vous est envoyé lorsque l'envoi d'email a été configuré pour l'instance." },
];
export function FAQContent() {
  const [open, setOpen] = useState<number | null>(0);
  return <><section className="inner-hero"><div className="container inner-hero__inner"><span className="eyebrow eyebrow--light">Besoin d'un éclairage ?</span><h1 className="serif-title">Les réponses, <span className="gold-highlight">simplement.</span></h1><p>Les informations essentielles pour prendre en main votre espace et votre équipe.</p></div></section><section className="section"><div className="container"><div className="faq-list">{questions.map((item, i) => <Reveal key={item.q}><div className={`faq-item ${open === i ? "open" : ""}`}><button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{item.q}{open === i ? <Minus size={18} /> : <Plus size={18} />}</button><AnimatePresence initial={false}>{open === i && <motion.div className="faq-item__answer" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .27 }}><p>{item.a}</p></motion.div>}</AnimatePresence></div></Reveal>)}</div></div></section><section className="closing-cta"><div className="container closing-cta__inner"><div><span className="eyebrow eyebrow--light">Une autre question ?</span><h2 className="serif-title">Écrivez-nous directement.</h2><p>Nous sommes disponibles par e-mail.</p></div><Link href="/contact" className="btn btn--gold">Nous contacter <ArrowRight size={17} /></Link></div></section></>;
}
export function ContactContent() {
  const [school, setSchool] = useState(""), [email, setEmail] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSuccess(""); setLoading(true);
    try { const response = await fetch("/api/contact", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ school, email, message }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "L'envoi a échoué."); setSuccess(result.message); setSchool(""); setEmail(""); setMessage(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "L'envoi a échoué."); } finally { setLoading(false); }
  }
  return <><section className="inner-hero"><div className="container inner-hero__inner"><span className="eyebrow eyebrow--light">Restons en contact</span><h1 className="serif-title">Une question ?<br /><span className="gold-highlight">Parlons-en.</span></h1><p>Une demande concernant la plateforme ou votre établissement ? Écrivez-nous.</p></div></section><section className="section"><div className="container contact-grid"><Reveal><div><span className="eyebrow">Notre contact</span><h2 className="serif-title" style={{ fontSize: 46, margin: "20px 0" }}>Un échange direct, sans détour.</h2><p className="muted" style={{ lineHeight: 1.8, fontSize: 14 }}>Envoyez-nous votre message avec le formulaire ou écrivez directement à notre adresse officielle.</p><a href="mailto:ecolesunu@gmail.com" className="contact-address"><Mail size={21} /> ecolesunu@gmail.com</a></div></Reveal><Reveal delay={.12}><form onSubmit={submit} className="panel" style={{ padding: 32 }}><div className="field"><label htmlFor="contact-school">Nom de l'établissement</label><input id="contact-school" className="input" required value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Votre établissement" /></div><div className="field"><label htmlFor="contact-email">Adresse e-mail</label><input id="contact-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" /></div><div className="field"><label htmlFor="contact-message">Votre message</label><textarea id="contact-message" className="textarea" required minLength={10} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Comment pouvons-nous vous aider ?" /></div><input tabIndex={-1} aria-hidden="true" name="website" style={{ display: "none" }} /><p className="field-hint">Votre message est envoyé uniquement à ecolesunu@gmail.com.</p>{error && <div className="form-error" role="alert">{error}</div>}{success && <div className="form-success" role="status">{success}</div>}<button className="btn btn--navy" type="submit" disabled={loading}>{loading ? "Envoi en cours..." : "Envoyer le message"} <ArrowRight size={16} /></button></form></Reveal></div></section></>;
}
