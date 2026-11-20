"use client";
import type { School, Student, Entry, Fiche } from "@/lib/types";
import { formatDate } from "@/lib/types";
import { getStudentStatus } from "@/lib/types";
import type { jsPDF as PdfType } from "jspdf";

async function createDocument(school: School, title: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFillColor(5, 10, 26); pdf.rect(0, 0, 210, 36, "F");
  try {
    const image = new Image(); image.src = "/brand-s-light.svg"; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128;
    canvas.getContext("2d")?.drawImage(image, 0, 0, 128, 128);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 13, 8, 20, 20);
  } catch { pdf.setTextColor(255, 193, 7); pdf.setFontSize(19); pdf.text("S", 18, 22); }
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.text(school.nomEcole.slice(0, 55), 39, 16);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Année scolaire : ${school.anneeScolaire || "Non renseignée"}`, 39, 24);
  pdf.setTextColor(11, 44, 74); pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.text(title, 16, 51);
  pdf.setDrawColor(255, 193, 7); pdf.setLineWidth(.7); pdf.line(16, 56, 194, 56);
  return pdf;
}
function footer(pdf: PdfType) { pdf.setTextColor(105, 120, 135); pdf.setFontSize(8); pdf.text("Généré avec Sunu École - ecolesunu@gmail.com", 16, 286); }
function textRow(pdf: PdfType, label: string, value: string, y: number) {
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(11, 44, 74); pdf.text(label, 16, y);
  pdf.setFont("helvetica", "normal"); pdf.setTextColor(45, 61, 78); const lines = pdf.splitTextToSize(value || "—", 125); pdf.text(lines, 67, y); return y + Math.max(10, lines.length * 5 + 4);
}
export async function fichePdf(school: School, student: Student, fiche: Fiche, action: "save" | "print" = "save", printWindow?: Window | null) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  function sheetBorder() { pdf.setDrawColor(59, 88, 125); pdf.setLineWidth(.35); pdf.roundedRect(10, 10, 190, 271, 1.6, 1.6, "S"); }
  sheetBorder();
  try {
    const logo = new Image(); logo.src = "/brand-s.svg"; await logo.decode();
    const canvas = document.createElement("canvas"); canvas.width = 104; canvas.height = 104;
    canvas.getContext("2d")?.drawImage(logo, 0, 0, 104, 104);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 99, 19, 12, 12);
  } catch { /* The school name still identifies the document. */ }
  pdf.setTextColor(11, 44, 74); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
  const schoolLines = pdf.splitTextToSize(school.nomEcole, 164).slice(0, 3); pdf.text(schoolLines, 105, 40, { align: "center" });
  let y = 40 + schoolLines.length * 5 + 2;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Année scolaire : ${school.anneeScolaire || "Non renseignée"}`, 105, y, { align: "center" });
  y += 13; pdf.setFont("helvetica", "bold"); pdf.setFontSize(17); pdf.text("FICHE DE RENVOI", 105, y, { align: "center" });
  pdf.setDrawColor(216, 229, 244); pdf.line(16, y + 6, 194, y + 6); y += 15;
  y = textRow(pdf, "Élève", `${student.prenom} ${student.nom}`, y);
  y = textRow(pdf, "Classe", student.classe, y);
  y = textRow(pdf, "Date du renvoi", formatDate(fiche.date), y);
  y = textRow(pdf, "Durée", `${fiche.dureeJours} jour${fiche.dureeJours !== 1 ? "s" : ""}`, y);
  y = textRow(pdf, "Retour en classe", formatDate(fiche.dateRetour), y);
  y = textRow(pdf, "Cumul des renvois", String(fiche.cumul), y);
  y += 4; pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("Motif", 16, y); y += 7;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  const lines: string[] = pdf.splitTextToSize(fiche.motif, 172);
  for (const line of lines) {
    if (y > 236) { footer(pdf); pdf.addPage(); sheetBorder(); y = 25; }
    pdf.text(line, 16, y); y += 5;
  }
  if (y + 35 > 265) { footer(pdf); pdf.addPage(); sheetBorder(); y = 30; }
  const signatureY = Math.max(196, y + 9);
  for (const [index, role] of ["Surveillant", "Parent", "Surveillant Général"].entries()) {
    const x = margin + 61 * index;
    pdf.setDrawColor(175, 192, 214); pdf.roundedRect(x, signatureY, 57, 23, 1.6, 1.6, "S");
    pdf.setFontSize(9); pdf.setTextColor(37, 66, 97); pdf.text("Signature", x + 28.5, signatureY + 6, { align: "center" }); pdf.text(role, x + 28.5, signatureY + 18, { align: "center" });
  }
  footer(pdf);
  if (action === "print" && printWindow && !printWindow.closed) { pdf.autoPrint(); const url = pdf.output("bloburl"); printWindow.location.replace(String(url)); window.setTimeout(() => URL.revokeObjectURL(String(url)), 120000); }
  else pdf.save(`fiche-renvoi-${student.nom.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${fiche.date}.pdf`);
}
export async function journalPdf(school: School, students: Student[], entries: Entry[]) {
  const pdf = await createDocument(school, "JOURNAL DE DISCIPLINE");
  let y = 69; const names = new Map(students.map((s) => [s.id, s]));
  if (!entries.length) { pdf.setFontSize(11); pdf.text("Aucune donnée pour le moment.", 16, y); }
  for (const entry of entries) {
    if (y > 260) { footer(pdf); pdf.addPage(); y = 20; }
    const student = names.get(entry.eleveId);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(11, 44, 74); pdf.text(`${formatDate(entry.date)} · ${entry.type}`, 16, y);
    pdf.setFont("helvetica", "normal"); pdf.setTextColor(55, 68, 82); pdf.setFontSize(9); pdf.text(`${student ? `${student.prenom} ${student.nom} · ${student.classe}` : "Élève retiré"} — ${entry.heure || "Heure non indiquée"}`, 16, y + 5);
    const lines = pdf.splitTextToSize(`Motif : ${entry.motif || "—"}   Décision : ${entry.decision || "—"}`, 175); pdf.text(lines, 16, y + 10); y += 14 + lines.length * 5;
    pdf.setDrawColor(230, 236, 240); pdf.line(16, y, 194, y); y += 8;
  }
  footer(pdf); pdf.save("sunu-ecole-journal.pdf");
}
export async function summaryPdf(school: School, students: Student[], entries: Entry[], period: string, filtered: Entry[]) {
  const pdf = await createDocument(school, "SYNTHÈSE DISCIPLINAIRE");
  pdf.setFontSize(10); pdf.text(`Période : ${period}  |  Généré le ${formatDate(new Date())}`, 16, 66);
  const classes = [...new Set(students.map((s) => s.classe))].sort((a, b) => a.localeCompare(b, "fr"));
  let y = 80;
  for (const classe of classes) {
    if (y > 255) { footer(pdf); pdf.addPage(); y = 20; }
    const ownStudents = students.filter((s) => s.classe === classe), own = filtered.filter((e) => ownStudents.some((s) => s.id === e.eleveId));
    const calls = ownStudents.filter((s) => getStudentStatus(s.id, entries, school).status === "À convoquer").length;
    const watches = ownStudents.filter((s) => getStudentStatus(s.id, entries, school).status === "À surveiller").length;
    pdf.setFillColor(245, 248, 250); pdf.rect(15, y - 6, 180, 21, "F"); pdf.setFont("helvetica", "bold"); pdf.setTextColor(11, 44, 74); pdf.setFontSize(10); pdf.text(classe, 19, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.text(`Effectif ${ownStudents.length}  |  Retards ${own.filter((e) => e.type === "Retard").length}  |  Absences ${own.filter((e) => e.type === "Absence").length}  |  Renvois ${own.filter((e) => e.type === "Renvoi").length}`, 19, y + 6);
    pdf.text(`À convoquer ${calls}  |  À surveiller ${watches}`, 19, y + 11); y += 28;
  }
  if (!classes.length) { pdf.setTextColor(75, 90, 105); pdf.text("Aucune donnée pour le moment.", 16, y); }
  footer(pdf); pdf.save("sunu-ecole-synthese.pdf");
}

export async function dashboardPdf(school: School, report: { date: string; classe: string; totals: { label: string; number: number }[]; alerts: { student: Student; status: string }[] }) {
  const pdf = await createDocument(school, "TABLEAU DE BORD");
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(`${formatDate(report.date)}  ·  ${report.classe || "Toutes les classes"}`, 16, 66);
  let y = 80;
  for (const item of report.totals) y = textRow(pdf, item.label, String(item.number), y);
  y += 4;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(11, 44, 74); pdf.text("Élèves à suivre", 16, y); y += 10;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  if (!report.alerts.length) pdf.text("Aucun élève à signaler.", 16, y);
  for (const { student, status } of report.alerts) {
    const lines = pdf.splitTextToSize(`${student.prenom} ${student.nom} · ${student.classe} · ${status}`, 173);
    const size = Math.max(9, lines.length * 5 + 4);
    if (y + size > 267) { footer(pdf); pdf.addPage(); y = 23; }
    pdf.setTextColor(40, 60, 82); pdf.setFontSize(10); pdf.text(lines, 16, y); y += size;
  }
  footer(pdf); pdf.save(`sunu-ecole-tableau-de-bord-${report.date}.pdf`);
}
