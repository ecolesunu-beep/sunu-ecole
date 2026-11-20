"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarClock, CalendarOff, ChevronRight, ClipboardList, Copy, Download, FileWarning, Inbox, KeyRound, Plus, RefreshCw, UploadCloud, Users, UserRoundCheck } from "lucide-react";
import { AnimatedNumber } from "@/components/site-motion";
import { WorkspaceDirectory } from "@/components/workspace-directory";
import { apiJson, jsonRequest, useSchool } from "@/components/app-shell";
import { Empty, Heading, Tag } from "@/components/app/ui";
import { modulesForMember } from "@/lib/workspace-navigation";
import { formatDate, localDate, STUDENT_STATUS, type Entry, type School } from "@/lib/types";

type Kind = Entry["type"];
type ChartPoint = { id: string; label: string; detail: string; counts: Record<Kind, number> };
const chartSeries: { type: Kind; label: string; color: string }[] = [
  { type: "Retard", label: "Retards", color: "#4096ed" }, { type: "Absence", label: "Absences", color: "#1756c8" }, { type: "Renvoi", label: "Renvois", color: "#ffc329" },
];
const blankCounts = () => ({ Retard: 0, Absence: 0, Renvoi: 0 });

function IncidentChart({ points, byClass }: { points: ChartPoint[]; byClass: boolean }) {
  const series = byClass ? chartSeries : chartSeries.slice(1);
  const largest = Math.max(0, ...points.flatMap((point) => series.map(({ type }) => point.counts[type])));
  const interval = Math.max(1, Math.ceil(largest / 4));
  const limit = interval * 4;
  const chart = { left: 28, top: 12, right: 514, bottom: 155 };
  const width = chart.right - chart.left, height = chart.bottom - chart.top;
  const group = width / Math.max(1, points.length), bar = Math.min(21, (group - Math.min(12, group / 3)) / series.length);
  const alt = points.map((point) => `${point.detail} : ${series.map(({ type, label }) => `${label.toLowerCase()} ${point.counts[type]}`).join(", ")}`).join(" ; ");
  return <>
    <div className="chart-legend" aria-hidden="true">{series.map(({ type, label, color }) => <span key={type}><i style={{ background: color }} />{label}</span>)}</div>
    <div className="incident-chart">
      <svg viewBox="0 0 528 185" role="img" aria-label={largest ? alt : "Aucun événement à représenter pour cette sélection."}>
        {Array.from({ length: 5 }, (_, index) => { const y = chart.bottom - index / 4 * height; return <g key={index}><line x1={chart.left} x2={chart.right} y1={y} y2={y} stroke={index ? "#e8eef6" : "#d3dfec"} />{(largest > 0 || index === 0) && <text x={chart.left - 7} y={y + 3} textAnchor="end" className="chart-label">{index * interval}</text>}</g>; })}
        {points.map((point, index) => { const x = chart.left + group * (index + .5); return <g key={point.id}>
          {series.map(({ type, label, color }, seriesIndex) => { const amount = point.counts[type], h = amount / limit * height; return amount > 0 && <rect key={type} x={x - series.length * bar / 2 + seriesIndex * bar + 1} y={chart.bottom - h} width={Math.max(2, bar - 3)} height={h} rx={2.6} fill={color}><title>{point.detail} · {label} : {amount}</title></rect>; })}
          <text x={x} y={chart.bottom + 19} textAnchor="middle" className="chart-label"><title>{point.detail}</title>{point.label}</text>
        </g>; })}
      </svg>
      {largest === 0 && <div className="chart-empty"><Inbox size={17} strokeWidth={1.6} /><span>Aucune donnée pour le moment.</span></div>}
    </div>
  </>;
}

export function DashboardPage() {
  const { data, reload, toast, online } = useSchool();
  const { school, students, entries, history, user } = data;
  const [changing, setChanging] = useState(false), [exporting, setExporting] = useState(false);
  const [classe, setClasse] = useState("");
  const [chartMode, setChartMode] = useState<"month" | "class">("month");
  const available = new Set(modulesForMember(user).map((item) => item.key));
  const today = localDate();
  const classes = useMemo(() => [...new Set(students.map((s) => s.classe))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })), [students]);
  const activeClass = classes.includes(classe) ? classe : "";
  const visibleStudents = useMemo(() => students.filter((s) => !activeClass || s.classe === activeClass), [students, activeClass]);
  const visibleEntries = useMemo(() => { const ids = new Set(visibleStudents.map((s) => s.id)); return entries.filter((entry) => ids.has(entry.eleveId)); }, [entries, visibleStudents]);
  const alerts = useMemo(() => {
    const byStudent = new Map<string, { Retard: number; Absence: number; Renvoi: number }>();
    for (const entry of visibleEntries) {
      const counts = byStudent.get(entry.eleveId) || blankCounts();
      if (entry.type !== "Absence" || entry.justifie === "Non") counts[entry.type]++;
      byStudent.set(entry.eleveId, counts);
    }
    return visibleStudents.flatMap((student) => {
      const counts = byStudent.get(student.id);
      if (!counts) return [];
      const status = counts.Renvoi >= school.seuilRenvois ? STUDENT_STATUS.call : counts.Retard >= school.seuilRetards || counts.Absence >= school.seuilAbsences ? STUDENT_STATUS.watch : null;
      return status ? [{ student, status }] : [];
    }).sort((a, b) => Number(b.status === STUDENT_STATUS.call) - Number(a.status === STUDENT_STATUS.call) || a.student.nom.localeCompare(b.student.nom, "fr"));
  }, [visibleStudents, visibleEntries, school.seuilRetards, school.seuilAbsences, school.seuilRenvois]);
  const todayCounts = blankCounts();
  for (const entry of visibleEntries) if (entry.date === today) todayCounts[entry.type]++;
  const countCalls = alerts.filter(({ status }) => status === STUDENT_STATUS.call).length;
  const totals = [
    { label: "Retards aujourd’hui", number: todayCounts.Retard, color: "blue", icon: CalendarClock },
    { label: "Absences aujourd’hui", number: todayCounts.Absence, color: "amber", icon: CalendarOff },
    { label: "Renvois aujourd’hui", number: todayCounts.Renvoi, color: "red", icon: FileWarning },
    { label: "Élèves à convoquer", number: countCalls, color: "green", icon: UserRoundCheck },
  ];
  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (chartMode === "class") {
      const byClass = new Map((activeClass ? [activeClass] : classes).map((item) => [item, blankCounts()]));
      const studentClasses = new Map(visibleStudents.map((s) => [s.id, s.classe]));
      for (const entry of visibleEntries) { const counts = byClass.get(studentClasses.get(entry.eleveId) || ""); if (counts) counts[entry.type]++; }
      return [...byClass].sort((a, b) => (b[1].Retard + b[1].Absence + b[1].Renvoi) - (a[1].Retard + a[1].Absence + a[1].Renvoi)).slice(0, 6).map(([name, counts]) => ({ id: name, detail: name, label: name.length > 9 ? `${name.slice(0, 8)}…` : name, counts }));
    }
    const now = new Date(`${today}T12:00:00`);
    const points = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      return { id: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: new Intl.DateTimeFormat("fr", { month: "short" }).format(date), detail: new Intl.DateTimeFormat("fr", { month: "long", year: "numeric" }).format(date), counts: blankCounts() };
    });
    const counts = new Map(points.map((point) => [point.id, point.counts]));
    for (const entry of visibleEntries) { const month = counts.get(entry.date.slice(0, 7)); if (month && entry.date <= today) month[entry.type]++; }
    return points;
  }, [chartMode, activeClass, classes, today, visibleEntries, visibleStudents]);

  async function copyCode() { try { await navigator.clipboard.writeText(school.codeParrainageUnique); toast("Code copié."); } catch { toast("Le presse-papiers n’est pas disponible sur ce navigateur."); } }
  async function regenerate() { if (!confirm("Régénérer le code ? L’ancien code ne permettra plus de rejoindre l’école.")) return; setChanging(true); try { await apiJson<School>("/api/data/code", jsonRequest("POST", {})); await reload(); toast("Nouveau code enregistré."); } catch (cause) { toast(cause instanceof Error ? cause.message : "Impossible de régénérer le code."); } finally { setChanging(false); } }
  async function exportDashboard() {
    setExporting(true);
    try { const { dashboardPdf } = await import("@/lib/pdf"); await dashboardPdf(school, { date: today, classe: activeClass, totals, alerts }); toast("Le tableau de bord a été exporté."); }
    catch (cause) { toast(cause instanceof Error ? cause.message : "Impossible d’exporter le tableau de bord."); }
    finally { setExporting(false); }
  }
  return <div className="dashboard-page">
    <Heading eyebrow="Vue d’ensemble" title="Tableau de bord" description="Bienvenue sur votre espace de suivi." actions={<><button type="button" className="btn btn--outline" disabled={exporting} onClick={() => void exportDashboard()}><Download size={15} />{exporting ? "Préparation…" : "Exporter PDF"}</button><select className="select" aria-label="Filtrer le tableau de bord par classe" value={activeClass} onChange={(e) => setClasse(e.target.value)}><option value="">Toutes les classes</option>{classes.map((name) => <option key={name}>{name}</option>)}</select></>} />
    <div className="stat-grid dashboard-totals">{totals.map(({ label, number, color, icon: Icon }) => <section className={`stat-card metric metric--${color}`} key={label}><div className="stat-card__top"><span className="stat-icon"><Icon size={19} strokeWidth={1.9} /></span></div><div className="stat-card__number"><AnimatedNumber value={number} /></div><div className="stat-card__label">{label}</div></section>)}</div>
    <div className="dashboard-grid dashboard-overview">
      <section className="panel chart-panel"><div className="panel-head"><div><h2>{chartMode === "month" ? "Absences et renvois par mois" : "Incidents par classe"}</h2><p>{chartMode === "month" ? "Six derniers mois" : "Les classes les plus concernées"}{activeClass && ` · ${activeClass}`}</p></div><div className="chart-toggle" role="group" aria-label="Regrouper les incidents"><button type="button" aria-pressed={chartMode === "month"} onClick={() => setChartMode("month")}>Mois</button><button type="button" aria-pressed={chartMode === "class"} onClick={() => setChartMode("class")}>Classes</button></div></div><IncidentChart points={chartPoints} byClass={chartMode === "class"} /></section>
      <section className="panel watch-panel"><div className="panel-head"><div><h2>Élèves à suivre</h2><p>À surveiller ou à convoquer</p></div>{available.has("students") && <Link href="/eleves" className="text-link">Voir tout <ArrowRight size={14} /></Link>}</div>
        {alerts.length ? <ul className="watch-list">{alerts.slice(0, 5).map(({ student, status }) => {
          const content = <><span className="student-initials" aria-hidden="true">{`${student.prenom[0] || ""}${student.nom[0] || ""}`.toUpperCase()}</span><span className="watch-list__name"><strong>{student.prenom} {student.nom}</strong><small>{student.classe}</small></span><Tag text={status} /></>;
          return <li key={student.id}>{available.has("students") ? <Link className="watch-list__row" href={`/eleves/${student.id}`}>{content}</Link> : <div className="watch-list__row">{content}</div>}</li>;
        })}</ul> : <Empty title="Aucun élève à signaler" description="Les dossiers à suivre apparaîtront ici selon les seuils de votre établissement." />}
      </section>
    </div>
    {students.length === 0 && <section className="panel dashboard-start"><div><span className="dashboard-start__icon"><UploadCloud size={19} /></span><div><h2>Ajoutez vos élèves pour commencer</h2><p>Importez votre liste Excel, puis enregistrez les premières saisies dans le journal.</p></div></div>{available.has("students") && <Link href="/eleves?import=1" className="btn btn--navy"><UploadCloud size={15} /> Importer mes élèves</Link>}</section>}
    <div className="dashboard-grid dashboard-details"><section className="panel"><div className="panel-head"><div><h2>Dernières activités</h2><p>Les dix opérations les plus récentes.</p></div><Link href="/historique" className="text-link">Historique <ArrowRight size={14} /></Link></div>{history.length ? <div className="timeline">{history.slice(0, 10).map((event) => <div className="timeline-item" key={event.id}><span className="timeline-item__dot" /><div className="timeline-item__body"><strong>{event.action} · {event.qui}</strong><p>{event.details}</p></div><span className="timeline-item__date">{formatDate(event.dateHeure, true)}</span></div>)}</div> : <Empty description="Les activités de votre équipe apparaîtront ici." />}</section>
      <div className="dashboard-stack">{user.role === "Surveillant Général" && <section className="panel"><div className="panel-head"><div><h2>Code de votre école</h2><p>Invitez vos collègues dans votre espace.</p></div><KeyRound size={17} /></div><div className="code-box"><strong>{school.codeParrainageUnique}</strong><div className="code-box__actions"><button type="button" className="icon-btn" aria-label="Copier le code" onClick={() => void copyCode()}><Copy size={15} /></button><button type="button" className="icon-btn" aria-label="Régénérer le code" disabled={changing || !online} onClick={() => void regenerate()}>{changing ? <span className="spinner" /> : <RefreshCw size={15} />}</button></div></div></section>}
      {available.has("journal") && <Link href="/journal?ajouter=Retard" className="panel dashboard-action"><span className="dashboard-start__icon"><Plus size={19} /></span><span><strong>Nouvelle saisie</strong><small>Retard, absence ou renvoi</small></span><ChevronRight size={17} /></Link>}
      {available.has("summary") && <Link className="panel dashboard-action" href="/synthese"><span className="dashboard-start__icon"><BarChart3 size={18} /></span><span><strong>Synthèse disciplinaire</strong><small>Suivre toutes vos classes</small></span><ChevronRight size={17} /></Link>}
      </div>
    </div>
    <WorkspaceDirectory member={user} />
  </div>;
}
