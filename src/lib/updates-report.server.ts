import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BRAND, EMAIL_ASSETS } from "@/emails/layout";

/**
 * Relatório diário de ATUALIZAÇÕES do sistema.
 * Lê o registro de atualizações (`system_updates`) e monta o e-mail enviado
 * todos os dias às 10:00 (Brasília) para os destinatários de relatórios.
 */

const COLORS = {
  black: "#111111",
  orange: "#C24A00",
  white: "#FFFFFF",
  page: "#F0F0F2",
  surface: "#F7F7F8",
  border: "#E1E1E4",
  text: "#18181B",
  muted: "#52525B",
  green: "#166534",
  blue: "#1D4ED8",
  yellow: "#92400E",
} as const;

const FONT = "Arial,Helvetica,sans-serif";

export const UPDATE_CATEGORIES: Record<string, { label: string; color: string }> = {
  fix: { label: "Correção", color: COLORS.green },
  improvement: { label: "Melhoria", color: COLORS.blue },
  feature: { label: "Novidade", color: COLORS.orange },
  security: { label: "Segurança", color: COLORS.yellow },
};

export interface SystemUpdateRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  impact: string;
  released_at: string;
}

export interface UpdatesReportData {
  dateStr: string;
  formattedDate: string;
  updates: SystemUpdateRow[];
  byCategory: { key: string; label: string; count: number }[];
  totalLast7Days: number;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Coleta as atualizações registradas no dia informado (padrão: hoje, fuso de Brasília). */
export async function collectUpdatesReport(date?: string): Promise<UpdatesReportData> {
  const reference = date ? new Date(`${date}T12:00:00-03:00`) : new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);

  const start = new Date(`${dateStr}T00:00:00-03:00`).toISOString();
  const end = new Date(`${dateStr}T23:59:59-03:00`).toISOString();
  const sevenDaysAgo = new Date(new Date(start).getTime() - 6 * 86400000).toISOString();

  const [dayRes, weekRes] = await Promise.all([
    supabaseAdmin
      .from("system_updates")
      .select("id, title, description, category, impact, released_at")
      .gte("released_at", start)
      .lte("released_at", end)
      .order("released_at", { ascending: false }),
    supabaseAdmin
      .from("system_updates")
      .select("id", { count: "exact", head: true })
      .gte("released_at", sevenDaysAgo)
      .lte("released_at", end),
  ]);

  const updates = (dayRes.data || []) as SystemUpdateRow[];

  const counts = new Map<string, number>();
  updates.forEach((u) => counts.set(u.category, (counts.get(u.category) || 0) + 1));

  const byCategory = Array.from(counts.entries()).map(([key, count]) => ({
    key,
    label: UPDATE_CATEGORIES[key]?.label || key,
    count,
  }));

  return {
    dateStr,
    formattedDate: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(`${dateStr}T12:00:00-03:00`)),
    updates,
    byCategory,
    totalLast7Days: weekRes.count || 0,
  };
}

function updateCard(update: SystemUpdateRow) {
  const meta = UPDATE_CATEGORIES[update.category] || { label: update.category, color: COLORS.orange };
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(update.released_at));

  return `
    <tr>
      <td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-left:4px solid ${meta.color};padding:15px 17px;font-family:${FONT};">
        <div style="color:${meta.color};font-family:${FONT};font-size:11px;line-height:16px;font-weight:bold;text-transform:uppercase;">${escapeHtml(meta.label)} · ${escapeHtml(time)}</div>
        <div style="color:${COLORS.text};font-family:${FONT};font-size:16px;line-height:23px;font-weight:bold;padding-top:5px;">${escapeHtml(update.title)}</div>
        ${
          update.description
            ? `<div style="color:${COLORS.muted};font-family:${FONT};font-size:13px;line-height:20px;padding-top:5px;">${escapeHtml(update.description)}</div>`
            : ""
        }
      </td>
    </tr>
    <tr><td height="10" style="height:10px;line-height:10px;font-size:1px;">&nbsp;</td></tr>`;
}

export function renderUpdatesReportEmail(data: UpdatesReportData) {
  const subject = `Atualizações do sistema · ${new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${data.dateStr}T12:00:00-03:00`))}`;

  const summaryRows =
    data.byCategory.length > 0
      ? data.byCategory
          .map(
            (item, index) => `
        <tr>
          <td style="padding:11px 4px;color:${COLORS.muted};font-family:${FONT};font-size:14px;line-height:20px;${index < data.byCategory.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ""}">${escapeHtml(item.label)}</td>
          <td align="right" style="padding:11px 4px;color:${COLORS.text};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;${index < data.byCategory.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ""}">${item.count}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td style="padding:11px 4px;color:${COLORS.muted};font-family:${FONT};font-size:14px;line-height:20px;">Nenhuma atualização registrada hoje</td></tr>`;

  const cards =
    data.updates.length > 0
      ? data.updates.map(updateCard).join("")
      : `<tr>
          <td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface};border:1px solid ${COLORS.border};padding:16px 18px;color:${COLORS.muted};font-family:${FONT};font-size:14px;line-height:21px;">
            Nenhuma atualização foi registrada nas últimas 24 horas. A plataforma segue operando com a última versão publicada.
          </td>
        </tr>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
</head>
<body bgcolor="${COLORS.page}" style="margin:0;padding:0;background-color:${COLORS.page};">
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${COLORS.page}" style="width:100%;background-color:${COLORS.page};">
    <tr>
      <td align="center" style="padding:18px 10px;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;">
          <tr>
            <td bgcolor="${COLORS.black}" style="background-color:${COLORS.black};border-bottom:3px solid ${COLORS.orange};padding:20px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="150" valign="middle"><img src="${escapeHtml(EMAIL_ASSETS.lockup)}" width="140" alt="${escapeHtml(BRAND.name)}" style="display:block;width:140px;height:auto;border:0;"></td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="color:#FF8A3D;font-family:${FONT};font-size:12px;line-height:18px;font-weight:bold;text-transform:uppercase;">Relatório de atualizações</div>

                    <div style="color:#D4D4D8;font-family:${FONT};font-size:12px;line-height:18px;">Referência: ${escapeHtml(data.formattedDate)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="${COLORS.white}" style="background-color:${COLORS.white};padding:22px 18px 26px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr><td style="color:${COLORS.text};font-family:${FONT};font-size:21px;line-height:27px;font-weight:bold;">O que mudou na plataforma</td></tr>
                <tr><td style="color:${COLORS.muted};font-family:${FONT};font-size:13px;line-height:20px;padding:4px 0 18px;">${data.updates.length} atualização(ões) registrada(s) hoje · ${data.totalLast7Days} nos últimos 7 dias.</td></tr>
                ${cards}
                <tr><td height="14" style="height:14px;line-height:14px;font-size:1px;">&nbsp;</td></tr>
                <tr><td style="color:${COLORS.orange};font-family:${FONT};font-size:13px;line-height:20px;font-weight:bold;text-transform:uppercase;padding-bottom:8px;">Resumo por tipo</td></tr>
                <tr>
                  <td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface};border:1px solid ${COLORS.border};padding:5px 14px;">
                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${summaryRows}</table>
                  </td>
                </tr>
                <tr><td height="20" style="height:20px;line-height:20px;font-size:1px;">&nbsp;</td></tr>
                <tr>
                  <td align="center" bgcolor="${COLORS.orange}" style="background-color:${COLORS.orange};border:1px solid ${COLORS.orange};">
                    <a href="${escapeHtml(`${BRAND.site}/admin/relatorios`)}" style="display:block;padding:13px 16px;color:${COLORS.white};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;">Ver histórico de atualizações</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="${COLORS.black}" style="background-color:${COLORS.black};padding:16px 20px;color:#A1A1AA;font-family:${FONT};font-size:11px;line-height:17px;">
              Relatório automático de atualizações · ${escapeHtml(BRAND.name)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${BRAND.name} — Relatório de atualizações`,
    data.formattedDate,
    "",
    ...(data.updates.length > 0
      ? data.updates.map((u) => `- [${UPDATE_CATEGORIES[u.category]?.label || u.category}] ${u.title}${u.description ? `: ${u.description}` : ""}`)
      : ["Nenhuma atualização registrada nas últimas 24 horas."]),
    "",
    `Últimos 7 dias: ${data.totalLast7Days} atualização(ões).`,
  ].join("\n");

  return { subject, html, text };
}
