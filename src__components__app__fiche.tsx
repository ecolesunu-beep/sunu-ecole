"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Eye, FileText, Printer } from "lucide-react";
import { apiJson, jsonRequest, useSchool } from "@/components/app-shell";
import { Empty, Guard, Heading, StudentPicker } from "@/components/app/ui";
import { formatDate, localDate, type Fiche, type School, type Student } from "@/lib/types";

function DocumentPreview({ school, student, date, days, dateRetour, motif, cumul }: { school: School; student?: Student; date: string; days: number; dateRetour: string; motif: string; cumul?: number }) {
  const fields = [["Élève", student ? `${student.prenom} ${student.nom}` : "—"], ["Classe", student?.classe || "—"], ["Date du renvoi", formatDate(date)], ["Durée", days > 0 ? `${days} jour${days !== 1 ? "s" : ""}` : "—"], ["Retour en classe", formatDate(dateRetour)], ["Cumul", cumul ?? "—"]];
  return <article className="fiche-sheet" aria-label="Aperçu de la fiche de renvoi">
    <header className="fiche-sheet__head"><img src="/brand-s.svg" alt="" width="30" height="30" /><strong>{school.nomEcole}</strong><span>Année scolaire : {school.anneeScolaire || "Non renseignée"}</span></header>
    <h3>FICHE DE RENVOI</h3><dl className="fiche-sheet__fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="fiche-sheet__reason"><strong>Motif :</strong> {motif || "—"}</p>
    <div className="fiche-sheet__signatures">{["Surveillant", "Parent", "Surveillant Général"].map((role) => <div key={role}><strong>Signature</strong><span>{role}</span></div>)}</div>
    <p className="fiche-sheet__footer">Généré avec Sunu École - ecolesunu@gmail.com</p>
  </article>;
}

export function FichePage() {
  const { data, reload, toast, online } = useSchool();
  const { students, fiches, entries, school } = data;
  const [classe, setClasse] = useState(""), [eleveId, setEleveId] = useState(""), [date, setDate] = useState(localDate()), [days, setDays] = useState(1), [motif, setMotif] = useState(""), [parents, setParents] = useState("Non"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState<Fiche | null>(null);
  const [exporting, setExporting] = useState(false);
  const initialSelection = useRef(false);
  const student = students.find((item) => item.id === eleveId);
  const previewStudent = selected ? students.find((item) => item.id === selected.eleveId) : student;
  const dateRetour = (() => {
    if (!date || !Number.isInteger(days) || days < 1 || days > 365) return "";
    const value = new Date(date + "T12:00:00Z");
    if (Number.isNaN(value.getTime())) return "";
    value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
  })();
  const previous = entries.filter((entry) => entry.eleveId === eleveId && entry.type === "Renvoi").length;
  useEffect(() => {
    if (initialSelection.current) return;
    const id = new URLSearchParams(window.location.search).get("eleve"), requested = students.find((item) => item.id === id);
    if (!requested) return;
    const timer = window.setTimeout(() => { initialSelection.current = true; setEleveId(requested.id); setClasse(requested.classe); }, 0);
    return () => window.clearTimeout(timer);
  }, [students]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!student || !dateRetour || !motif.trim()) { setError("Renseignez l’élève, la date, la durée et le motif du renvoi."); return; }
    if (!online || busy) return;
    setBusy(true); setError("");
    try { const fiche = await apiJson<Fiche>("/api/data/fiches", jsonRequest("POST", { eleveId, date, motif, dureeJours: days, parentsInformes: parents })); setSelected(fiche); await reload(); toast("Fiche enregistrée et renvoi ajouté au journal."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de créer la fiche."); }
    finally { setBusy(false); }
  }
  async function pdf(fiche: Fiche, action: "save" | "print") {
    const ownStudent = students.find((item) => item.id === fiche.eleveId);
    if (!ownStudent) { toast("L’élève de cette fiche n’est plus disponible."); return; }
    const printWindow = action === "print" ? window.open("about:blank", "_blank") : null;
    if (printWindow) printWindow.opener = null;
    setExporting(true);
    try {
      const { fichePdf } = await import("@/lib/pdf");
      await fichePdf(school, ownStudent, fiche, printWindow ? "print" : "save", printWindow);
      toast(printWindow ? "La fiche est prête à imprimer." : "La fiche PDF a été téléchargée.");
    } catch (cause) { printWindow?.close(); toast(cause instanceof Error ? cause.message : "Impossible de générer le PDF."); }
    finally { setExporting(false); }
  }
  return <Guard permission="fiches"><div className="workspace-data-page"><Heading eyebrow="Documents disciplinaires" title="Fiche de renvoi" description="Recherchez un élève et générez une fiche imprimable." />
    <div className="fiche-layout">
      <section className="panel fiche-editor"><div className="panel-head"><div><h2>Nouvelle fiche</h2><p>Choisissez la classe, puis recherchez l’élève par son nom.</p></div><FileText size={17} /></div>
        <form onSubmit={save}>
          <StudentPicker students={students} value={eleveId} onChange={(id) => { setEleveId(id); setSelected(null); }} classe={classe} onClassChange={(value) => { setClasse(value); setSelected(null); }} label="Classe et élève" />
          <div className="form-grid"><div className="field"><label htmlFor="fiche-date">Date du renvoi</label><input id="fiche-date" className="input" type="date" required value={date} onChange={(e) => { setDate(e.target.value); setSelected(null); }} /></div>
            <div className="field"><label htmlFor="fiche-days">Durée (jours)</label><input id="fiche-days" className="input" type="number" min="1" max="365" required value={days || ""} onChange={(e) => { setDays(Number(e.target.value)); setSelected(null); }} /></div>
            <div className="field full"><label htmlFor="fiche-reason">Motif</label><textarea id="fiche-reason" className="textarea" maxLength={1000} required value={motif} onChange={(e) => { setMotif(e.target.value); setSelected(null); }} placeholder="Motif à faire figurer sur la fiche" /></div>
            <div className="field"><label htmlFor="fiche-return">Date de retour</label><input id="fiche-return" className="input" type="date" readOnly value={dateRetour} /></div><div className="field"><label htmlFor="fiche-parent">Parents informés</label><select id="fiche-parent" className="select" value={parents} onChange={(e) => { setParents(e.target.value); setSelected(null); }}><option>Non</option><option>Oui</option></select></div>
          </div>
          {student && <p className="field-hint">{selected ? `Cumul enregistré : ${selected.cumul}.` : `${previous} renvoi${previous === 1 ? "" : "s"} avant cette saisie.`}</p>}
          {error && <div className="form-error" role="alert">{error}</div>}<button type="submit" className="btn btn--navy fiche-generate" disabled={busy || !student || !online}>{busy ? <><span className="spinner" /> Enregistrement…</> : <><FileText size={15} /> Enregistrer la fiche</>}</button>
        </form>
      </section>
      <section className="fiche-document"><DocumentPreview school={school} student={previewStudent} date={selected?.date || date} days={selected?.dureeJours || days} dateRetour={selected?.dateRetour || dateRetour} motif={selected?.motif || motif} cumul={selected?.cumul ?? (student ? previous + 1 : undefined)} />
        {selected ? <div className="fiche-export-actions"><button type="button" className="btn btn--outline" disabled={exporting} onClick={() => void pdf(selected, "save")}><Download size={15} /> Export PDF</button><button type="button" className="btn btn--outline" disabled={exporting} onClick={() => void pdf(selected, "print")}><Printer size={15} /> Imprimer</button>{selected.eleveId !== eleveId && <button type="button" className="btn btn--outline" onClick={() => setSelected(null)}>Revenir au brouillon</button>}</div> : <p className="field-hint" style={{ marginTop: 9 }}>L’aperçu se complète pendant la saisie. Enregistrez la fiche pour l’exporter.</p>}
      </section>
    </div>
    <section className="panel fiche-history"><div className="panel-head"><div><h2>Historique des fiches</h2><p>Documents créés par votre équipe.</p></div></div>{fiches.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Élève</th><th>Classe</th><th>Durée</th><th>Retour en classe</th><th>Cumul</th><th style={{ textAlign: "right" }}>Documents</th></tr></thead><tbody>{fiches.map((fiche) => { const own = students.find((item) => item.id === fiche.eleveId); return <tr key={fiche.id}><td>{formatDate(fiche.date)}</td><td><strong>{own ? `${own.prenom} ${own.nom}` : "Élève retiré"}</strong></td><td>{own?.classe || "—"}</td><td>{fiche.dureeJours} jour{fiche.dureeJours !== 1 ? "s" : ""}</td><td>{formatDate(fiche.dateRetour)}</td><td>{fiche.cumul}</td><td><div className="table-actions"><button type="button" className="icon-btn" title="Afficher la fiche" aria-label="Afficher la fiche" onClick={() => setSelected(fiche)}><Eye size={14} /></button><button type="button" className="icon-btn" title="Télécharger le PDF" aria-label="Télécharger le PDF" disabled={exporting} onClick={() => void pdf(fiche, "save")}><Download size={14} /></button></div></td></tr>; })}</tbody></table></div> : <Empty title="Aucune fiche pour le moment" description="Les fiches de renvoi enregistrées apparaîtront ici." />}</section>
  </div></Guard>;
}
