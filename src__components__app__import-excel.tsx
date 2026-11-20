"use client";
import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { apiJson, useSchool } from "@/components/app-shell";
import { Modal } from "@/components/app/ui";

type Mapping = { first: number; last: number; classe: number };
type Sheet = { name: string; headers: string[]; rows: string[][]; mapping: Mapping };
type Row = { prenom: string; nom: string; classe: string };
const normal = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function guess(headers: string[]): Mapping {
  return { first: headers.findIndex((v) => /^(prenoms?|firstname|first name|given names?|forename|prenom s?)$/.test(normal(v))), last: headers.findIndex((v) => /^(nom|noms|nom de famille|surname|last name|family name)$/.test(normal(v))), classe: headers.findIndex((v) => /^(classe|class|niveau|groupe|section)$/.test(normal(v))) };
}
const isGeneric = (name: string) => /^(feuil\s*\d+|sheet\s*\d+|table\s*\d+)$/i.test(name.trim());
export function ImportExcel({ onClose }: { onClose: () => void }) {
  const { reload, toast, online } = useSchool();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]), [filename, setFilename] = useState(""), [fallback, setFallback] = useState(""), [strategy, setStrategy] = useState<"skip" | "update">("skip"), [viewAll, setViewAll] = useState(false), [drag, setDrag] = useState(false), [error, setError] = useState(""), [parsing, setParsing] = useState(false), [importing, setImporting] = useState(false), [progress, setProgress] = useState(0), [summary, setSummary] = useState<{ imported: number; duplicates: number; ignored: number; updated: number } | null>(null);
  const preview = useMemo(() => { const rows: Row[] = []; let ignored = 0; for (const sheet of sheets) { for (const row of sheet.rows) { const prenom = (row[sheet.mapping.first] || "").trim(), nom = (row[sheet.mapping.last] || "").trim(), classe = (sheet.mapping.classe >= 0 ? row[sheet.mapping.classe] || "" : isGeneric(sheet.name) ? fallback : sheet.name).trim(); if (!prenom && !nom && !classe) { ignored++; continue; } if (!prenom || !nom || !classe) { ignored++; continue; } rows.push({ prenom, nom, classe }); } } return { rows, ignored, classes: new Set(rows.map((r) => r.classe)).size }; }, [sheets, fallback]);
  async function parse(file: File) {
    setError(""); setSummary(null); setSheets([]); setProgress(0);
    if (!/\.(xlsx|xls)$/i.test(file.name)) { setError("Fichier invalide. Choisissez un fichier Excel .xlsx ou .xls."); return; }
    if (file.size > 10 * 1024 * 1024 || file.size === 0) { setError("Le fichier doit être valide et inférieur à 10 Mo."); return; }
    setFilename(file.name); setParsing(true);
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const parsed: Sheet[] = workbook.SheetNames.map((name) => {
        const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: true }).map((row) => row.map((cell) => String(cell ?? "")));
        const headerIndex = Math.max(0, raw.findIndex((row) => { const matched = guess(row); return Number(matched.first >= 0) + Number(matched.last >= 0) + Number(matched.classe >= 0) >= 2; }));
        return { name, headers: raw[headerIndex] || [], rows: raw.slice(headerIndex + 1), mapping: guess(raw[headerIndex] || []) };
      }).filter((sheet) => sheet.headers.length || sheet.rows.length);
      if (!parsed.length || !parsed.some((sheet) => sheet.rows.length)) throw new Error("Aucune ligne d'élève trouvée dans ce classeur.");
      setSheets(parsed);
      if (parsed.some((sheet) => sheet.mapping.first < 0 || sheet.mapping.last < 0)) setError("Vérifiez les correspondances des colonnes ci-dessous avant l'import.");
    } catch (cause) { setError(cause instanceof Error ? `Impossible de lire le fichier : ${cause.message}` : "Fichier Excel invalide."); }
    finally { setParsing(false); }
  }
  function updateMap(index: number, field: keyof Mapping, value: number) { setSheets((prev) => prev.map((sheet, i) => i === index ? { ...sheet, mapping: { ...sheet.mapping, [field]: value } } : sheet)); }
  async function template() { const XLSX = await import("@e965/xlsx"); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["N°", "Prénoms", "Nom", "Classe"]]), "Élèves"); XLSX.writeFile(workbook, "modele-eleves-sunu-ecole.xlsx"); }
  async function run() {
    if (!preview.rows.length) { setError("Aucun élève complet à importer. Vérifiez les colonnes et la classe."); return; }
    if (!online) { setError("Connexion indisponible. Réessayez lorsque la synchronisation sera rétablie."); return; }
    setImporting(true); setError(""); setProgress(0);
    const total = { imported: 0, duplicates: 0, ignored: preview.ignored, updated: 0 };
    const batches = Math.ceil(preview.rows.length / 100);
    try {
      for (let i = 0; i < batches; i++) {
        const batch = await apiJson<{ imported: number; duplicates: number; ignored: number; updated: number }>("/api/data/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ students: preview.rows.slice(i * 100, (i + 1) * 100), strategy }) });
        total.imported += batch.imported; total.duplicates += batch.duplicates; total.ignored += batch.ignored; total.updated += batch.updated;
        setProgress(Math.round((i + 1) / batches * 100));
      }
      setSummary(total); await reload(); toast(`${total.imported} élèves importés dans votre établissement.`);
    } catch (cause) { setError(`${cause instanceof Error ? cause.message : "Import interrompu."} ${total.imported} élèves déjà enregistrés avant l'interruption.`); await reload(); }
    finally { setImporting(false); }
  }
  const mapReady = sheets.every((sheet) => sheet.mapping.first >= 0 && sheet.mapping.last >= 0 && (sheet.mapping.classe >= 0 || !isGeneric(sheet.name) || !!fallback.trim()));
  return <Modal title="Importer liste Excel" subtitle="Prévisualisez et vérifiez les colonnes avant de copier vos élèves dans la base." onClose={() => { if (!importing) onClose(); }} wide footer={<>{summary ? <button className="btn btn--navy" onClick={onClose}>Terminer</button> : <><button className="btn btn--outline" onClick={onClose} disabled={importing}>Annuler</button><button className="btn btn--navy" onClick={() => void run()} disabled={importing || !mapReady || !preview.rows.length || !online}>{importing ? <><span className="spinner" /> Import en cours · {progress}%</> : `Importer ${preview.rows.length} élève${preview.rows.length > 1 ? "s" : ""}`}</button></>}</>}>
    {summary ? <div style={{ padding: "15px 0" }}><div className="form-success"><strong>Import terminé.</strong> Vos données sont enregistrées en base.</div><div className="stat-grid" style={{ margin: "22px 0", gridTemplateColumns: "repeat(4,1fr)" }}>{[["Importés", summary.imported], ["Doublons ignorés", summary.duplicates], ["Mis à jour", summary.updated], ["Lignes ignorées", summary.ignored]].map(([label, value]) => <div className="stat-card" key={label}><div className="stat-card__number">{value}</div><div className="stat-card__label">{label}</div></div>)}</div></div> : <>
    <div className={`upload-zone ${drag ? "drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) void parse(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}><UploadCloud size={26} /><strong>{parsing ? "Lecture du fichier..." : filename || "Glissez votre fichier Excel ici"}</strong><small>ou cliquez pour choisir un fichier .xlsx ou .xls · 10 Mo maximum</small><input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) void parse(e.target.files[0]); e.target.value = ""; }} /></div>
    <div style={{ display: "flex", justifyContent: "flex-end", margin: "11px 0 20px" }}><button className="text-link" onClick={() => void template()}><Download size={15} /> Télécharger modèle Excel vierge</button></div>
    {error && <div role="alert" className="form-error">{error}</div>}
    {sheets.map((sheet, index) => <section key={`${sheet.name}-${index}`} style={{ border: "1px solid #e7ecf1", borderRadius: 10, padding: 15, marginBottom: 15 }}><div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 13 }}><FileSpreadsheet size={16} color="#a77e00" /><strong style={{ fontSize: 13 }}>Onglet : {sheet.name}</strong><span className="muted" style={{ fontSize: 11 }}>· {sheet.rows.length} ligne(s)</span></div><div className="form-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>{(["first", "last", "classe"] as const).map((key) => <div className="field" key={key} style={{ marginBottom: 0 }}><label>Colonne {key === "first" ? "Prénoms" : key === "last" ? "Nom" : "Classe"}</label><select className="select" value={sheet.mapping[key]} onChange={(e) => updateMap(index, key, Number(e.target.value))}><option value={-1}>{key === "classe" ? "Nom de l'onglet" : "Choisir..."}</option>{sheet.headers.map((header, col) => <option key={col} value={col}>{header || `Colonne ${col + 1}`}</option>)}</select></div>)}</div>{sheet.mapping.classe < 0 && isGeneric(sheet.name) && <p className="field-hint" style={{ margin: "9px 0 0" }}>Sans colonne Classe, indiquez une classe ci-dessous ou renommez l'onglet avec le nom de la classe.</p>}</section>)}
    {sheets.some((sheet) => sheet.mapping.classe < 0 && isGeneric(sheet.name)) && <div className="field"><label htmlFor="fallback-classe">Classe des onglets sans colonne Classe</label><input id="fallback-classe" className="input" value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="Ex. classe indiquée dans votre fichier" /></div>}
    {!!sheets.length && <><p style={{ fontSize: 13, fontWeight: 700 }}>On a trouvé {preview.rows.length} élève{preview.rows.length > 1 ? "s" : ""} dans {preview.classes} classe{preview.classes > 1 ? "s" : ""}.</p><p className="field-hint">{preview.ignored} ligne(s) vide(s) ou incomplète(s) ignorée(s). Voici {viewAll ? "tous les élèves" : "les 10 premiers"} :</p><div className="table-wrap" style={{ maxHeight: 245, overflowY: "auto", border: "1px solid #e7ecf1", borderRadius: 8 }}><table className="data-table"><thead><tr><th>Prénoms</th><th>Nom</th><th>Classe</th></tr></thead><tbody>{preview.rows.slice(0, viewAll ? undefined : 10).map((row, index) => <tr key={index}><td>{row.prenom}</td><td>{row.nom}</td><td>{row.classe}</td></tr>)}</tbody></table></div>{preview.rows.length > 10 && <button className="text-link" style={{ margin: "12px 0" }} onClick={() => setViewAll(!viewAll)}>{viewAll ? "Voir les 10 premiers" : "Voir tout"}</button>}<div style={{ marginTop: 17 }}><span className="field-label">Si des élèves existent déjà</span><label className="check-row"><input type="radio" checked={strategy === "skip"} onChange={() => setStrategy("skip")} /> Ignorer les doublons</label><label className="check-row"><input type="radio" checked={strategy === "update"} onChange={() => setStrategy("update")} /> Mettre à jour les existants</label><p className="field-hint">Doublon = même prénom, même nom et même classe (sans tenir compte des accents ni de la casse).</p></div></>}
    {importing && <div style={{ marginTop: 18 }}><div className="progress-caption"><span>Copie sécurisée dans la base de données...</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
  </>}
  </Modal>;
}
