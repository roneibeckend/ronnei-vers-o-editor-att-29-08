import { jsPDF } from "jspdf";
import { saveBlob } from "@/lib/download";
import { BRIEFING_LABELS, challengeLabel } from "@/lib/consultation-briefing";

/**
 * Relatório em PDF de uma consultoria agendada, com os dados que o aluno
 * preencheu no briefing. Usado pelo admin para preparar o roteiro da reunião.
 */

const PAGE_W = 210;
const PAGE_H = 297;
const MX = 18;
const CW = PAGE_W - MX * 2;

const money = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const dateBR = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—";

const STATUS: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  scheduled: "Agendada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

const ORDER = [
  "business_name",
  "city_state",
  "whatsapp",
  "instagram",
  "works_with_skewers",
  "monthly_revenue",
  "main_challenge",
  "goal",
  "specific_question",
] as const;

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function generateConsultationReportPdf(c: any) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const briefing = (c?.briefing_data ?? null) as any;
  let y = 0;

  // Cabeçalho
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, PAGE_W, 38, "F");
  doc.setFillColor(255, 106, 0);
  doc.rect(0, 38, PAGE_W, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Relatório da Consultoria", MX, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(230, 230, 235);
  doc.text(`Ronnei na Veia · gerado em ${dateBR(new Date().toISOString())}`, MX, 28);
  y = 52;

  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - 20) {
      doc.addPage();
      y = 24;
    }
  };

  const sectionTitle = (label: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 22);
    doc.text(label.toUpperCase(), MX, y);
    doc.setDrawColor(255, 106, 0);
    doc.setLineWidth(0.8);
    doc.line(MX, y + 1.8, MX + 22, y + 1.8);
    doc.setLineWidth(0.2);
    y += 9;
  };

  const row = (label: string, value: string) => {
    const lines = doc.splitTextToSize(value || "—", CW - 52);
    ensure(lines.length * 5 + 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(90, 90, 95);
    doc.text(doc.splitTextToSize(label, 48), MX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 34);
    doc.text(lines, MX + 52, y);
    y += Math.max(lines.length * 5, 5) + 2;
  };

  sectionTitle("Dados da reunião");
  row("Aluno", c?.client_name || "Aluno");
  row("E-mail", c?.client_email || "—");
  row("Produto", c?.product_title || "—");
  row("Data e hora", dateBR(c?.scheduled_at));
  row("Duração", `${c?.duration_minutes ?? "—"} min`);
  row("Status", STATUS[c?.status] ?? String(c?.status ?? "—"));
  row("Valor", money(c?.amount));
  if (c?.meet_link) row("Link do Meet", String(c.meet_link));

  y += 4;
  sectionTitle("Briefing preenchido pelo aluno");

  if (briefing && typeof briefing === "object") {
    ORDER.forEach((key) => {
      if (key === "main_challenge") {
        row(BRIEFING_LABELS.main_challenge, challengeLabel(briefing));
        return;
      }
      const value = briefing[key];
      if (value === undefined || value === null || value === "") return;
      row((BRIEFING_LABELS as any)[key] ?? key, String(value));
    });
  } else if (c?.briefing) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 34);
    doc.splitTextToSize(String(c.briefing), CW).forEach((line: string) => {
      ensure(6);
      doc.text(line, MX, y);
      y += 5;
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(150, 60, 60);
    doc.text("Briefing não preenchido pelo aluno.", MX, y);
    y += 8;
  }

  if (c?.admin_notes) {
    y += 4;
    sectionTitle("Notas internas");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 34);
    doc.splitTextToSize(String(c.admin_notes), CW).forEach((line: string) => {
      ensure(6);
      doc.text(line, MX, y);
      y += 5;
    });
  }

  // Espaço para o roteiro do Ronnei
  y += 6;
  sectionTitle("Roteiro / análise (preencher)");
  doc.setDrawColor(215, 215, 220);
  for (let i = 0; i < 10; i += 1) {
    ensure(9);
    doc.line(MX, y, PAGE_W - MX, y);
    y += 9;
  }

  // Rodapé em todas as páginas
  const total = (doc as any).getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 145);
    doc.text("Documento interno · Ronnei na Veia", MX, PAGE_H - 10);
    doc.text(`${p}/${total}`, PAGE_W - MX, PAGE_H - 10, { align: "right" });
  }

  const name = `consultoria-${slug(c?.client_name || "aluno")}-${(c?.scheduled_at || "").slice(0, 10)}.pdf`;
  saveBlob(doc.output("blob"), name);
}
