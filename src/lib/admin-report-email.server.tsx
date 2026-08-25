import { BRAND, EMAIL_ASSETS } from "@/emails/layout";
import type { AdminReportData } from "@/lib/admin-report.server";

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
  red: "#B91C1C",
  yellow: "#92400E",
} as const;

const FONT = "Arial,Helvetica,sans-serif";

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const num = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function metricCard(label: string, value: string, delta?: number | null) {
  const deltaText =
    delta === null || delta === undefined || !Number.isFinite(delta)
      ? "Sem base anterior"
      : `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)}% vs. dia anterior`;
  const deltaColor = delta === null || delta === undefined ? COLORS.muted : delta >= 0 ? COLORS.green : COLORS.red;

  return `
    <tr>
      <td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-left:4px solid ${COLORS.orange};padding:16px 18px;font-family:${FONT};">
        <div style="color:${COLORS.muted};font-family:${FONT};font-size:11px;line-height:16px;text-transform:uppercase;">${escapeHtml(label)}</div>
        <div style="color:${COLORS.text};font-family:${FONT};font-size:26px;line-height:32px;font-weight:bold;padding-top:6px;">${escapeHtml(value)}</div>
        <div style="color:${deltaColor};font-family:${FONT};font-size:12px;line-height:18px;font-weight:bold;padding-top:4px;">${escapeHtml(deltaText)}</div>
      </td>
    </tr>
    <tr><td height="12" style="height:12px;line-height:12px;font-size:1px;">&nbsp;</td></tr>`;
}

function dataSection(title: string, rows: Array<{ label: string; value: string }>) {
  const body = rows
    .map(
      (row, index) => `
        <tr>
          <td style="padding:11px 4px;color:${COLORS.muted};font-family:${FONT};font-size:14px;line-height:20px;${index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ""}">${escapeHtml(row.label)}</td>
          <td align="right" style="padding:11px 4px;color:${COLORS.text};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;${index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ""}">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <tr><td height="20" style="height:20px;line-height:20px;font-size:1px;">&nbsp;</td></tr>
    <tr>
      <td style="color:${COLORS.orange};font-family:${FONT};font-size:13px;line-height:20px;font-weight:bold;text-transform:uppercase;padding-bottom:8px;">${escapeHtml(title)}</td>
    </tr>
    <tr>
      <td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface};border:1px solid ${COLORS.border};padding:5px 14px;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${body}</table>
      </td>
    </tr>`;
}

function buildAlerts(data: AdminReportData) {
  const alerts: Array<{ level: "critical" | "warning" | "ok"; title: string; detail: string }> = [];

  if (data.errors.count > 0) alerts.push({ level: data.errors.count >= 10 ? "critical" : "warning", title: `${data.errors.count} erro(s) de sistema registrados`, detail: data.errors.samples.map((item) => `${item.source}: ${item.message}`).slice(0, 3).join(" | ") });
  if (data.emails.failed > 0) alerts.push({ level: data.emails.failed >= 5 ? "critical" : "warning", title: `${data.emails.failed} e-mail(s) com falha`, detail: `${data.emails.sent} enviado(s) com sucesso` });
  if (data.refunds.count > 0) alerts.push({ level: "critical", title: `${data.refunds.count} reembolso(s) ou contestação(ões)`, detail: `Valor envolvido: ${brl(data.refunds.value)}` });
  if (data.payoutsPending.count > 0) alerts.push({ level: "warning", title: `${data.payoutsPending.count} saque(s) aguardando aprovação`, detail: `Total solicitado: ${brl(data.payoutsPending.value)}` });
  if (data.tickets.open > 0) alerts.push({ level: data.tickets.open >= 10 ? "critical" : "warning", title: `${data.tickets.open} ticket(s) de suporte em aberto`, detail: `${data.tickets.created} criado(s) e ${data.tickets.closed} encerrado(s) no período` });
  if (data.abandonedCheckouts > 0) alerts.push({ level: "warning", title: `${data.abandonedCheckouts} checkout(s) abandonado(s)`, detail: "Oportunidade de recuperação de vendas" });
  if (!alerts.length) alerts.push({ level: "ok", title: "Nenhuma ocorrência crítica", detail: "Pagamentos, e-mails, suporte e sistema operando normalmente" });
  return alerts;
}

function alertSection(data: AdminReportData) {
  const rows = buildAlerts(data)
    .map((alert) => {
      const color = alert.level === "critical" ? COLORS.red : alert.level === "warning" ? COLORS.yellow : COLORS.green;
      const label = alert.level === "critical" ? "CRÍTICO" : alert.level === "warning" ? "ATENÇÃO" : "NORMAL";
      return `
        <tr>
          <td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface};border:1px solid ${color};border-left:5px solid ${color};padding:13px 15px;">
            <div style="color:${color};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;">${label} - ${escapeHtml(alert.title)}</div>
            <div style="color:${COLORS.muted};font-family:${FONT};font-size:13px;line-height:19px;padding-top:4px;">${escapeHtml(alert.detail)}</div>
          </td>
        </tr>
        <tr><td height="10" style="height:10px;line-height:10px;font-size:1px;">&nbsp;</td></tr>`;
    })
    .join("");

  return `
    <tr><td height="20" style="height:20px;line-height:20px;font-size:1px;">&nbsp;</td></tr>
    <tr><td style="color:${COLORS.orange};font-family:${FONT};font-size:13px;line-height:20px;font-weight:bold;text-transform:uppercase;padding-bottom:8px;">Alertas</td></tr>
    ${rows}`;
}

function actionButton(label: string, href: string, primary = false) {
  const background = primary ? COLORS.orange : COLORS.white;
  const foreground = primary ? COLORS.white : COLORS.text;
  return `
    <tr>
      <td align="center" bgcolor="${background}" style="background-color:${background};border:1px solid ${primary ? COLORS.orange : COLORS.border};">
        <a href="${escapeHtml(href)}" style="display:block;padding:13px 16px;color:${foreground};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;text-decoration:none;">${escapeHtml(label)}</a>
      </td>
    </tr>
    <tr><td height="10" style="height:10px;line-height:10px;font-size:1px;">&nbsp;</td></tr>`;
}

function buildHtml(data: AdminReportData) {
  const site = BRAND.site;
  const financial = [
    { label: "Receita líquida", value: brl(data.totalRevenue) },
    { label: "Receita bruta", value: brl(data.grossRevenue) },
    { label: "Taxas do gateway", value: brl(data.totalFees) },
    { label: "Faturas geradas", value: `${data.invoicesCreated.count} - ${brl(data.invoicesCreated.value)}` },
    { label: "Pagamentos confirmados", value: `${data.paymentsConfirmed.count} - ${brl(data.paymentsConfirmed.value)}` },
    { label: "Pagamentos pendentes", value: `${data.pendingPayments.count} - ${brl(data.pendingPayments.value)}` },
    { label: "Reembolsos", value: `${data.refunds.count} - ${brl(data.refunds.value)}` },
    { label: "Ticket médio", value: brl(data.avgTicket) },
    { label: "Lucro estimado", value: `${brl(data.netProfit)} (${data.margin.toFixed(0)}%)` },
  ];
  const fmtDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso))
      : "Nenhuma venda registrada";
  const accumulated = [
    { label: "Vendas nos últimos 30 dias", value: `${data.last30Sales.count} - ${brl(data.last30Sales.value)}` },
    { label: "Vendas acumuladas (histórico)", value: `${data.lifetimeSales.count} - ${brl(data.lifetimeSales.value)}` },
    { label: "Última venda registrada", value: `${fmtDate(data.lifetimeSales.lastAt)} - ${brl(data.lifetimeSales.lastValue)}` },
  ];
  const users = [
    { label: "Novos usuários", value: num(data.newStudents) },
    { label: "Usuários ativos (30 dias)", value: num(data.usersActive) },
    { label: "Cancelamentos ou inativos", value: num(data.usersCanceled) },
    { label: "Leads capturados", value: num(data.leads) },
    { label: "Matrículas em cursos", value: num(data.courseEnrollments) },
    { label: "Afiliados ativos", value: num(data.affiliatesActive) },
    { label: "Saques de afiliados pendentes", value: `${data.payoutsPending.count} - ${brl(data.payoutsPending.value)}` },
    { label: "Saques pagos no período", value: `${data.payoutsPaid.count} - ${brl(data.payoutsPaid.value)}` },
  ];
  const content = [
    { label: "Curso mais acessado", value: data.topCourse ? `${data.topCourse.title} (${data.topCourse.views})` : "Sem atividade" },
    { label: "eBook mais baixado", value: data.topEbook ? `${data.topEbook.title} (${data.topEbook.downloads})` : "Sem atividade" },
    { label: "Total de visualizações", value: num(data.totalViews) },
    { label: "Acessos a eBooks", value: num(data.ebookEnrollments) },
  ];

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(data.reportType)}</title>
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
                    <div style="color:#FF8A3D;font-family:${FONT};font-size:12px;line-height:18px;font-weight:bold;text-transform:uppercase;">${escapeHtml(data.reportType)}</div>

                    <div style="color:#D4D4D8;font-family:${FONT};font-size:12px;line-height:18px;">Referência: ${escapeHtml(data.formattedDate)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="${COLORS.white}" style="background-color:${COLORS.white};padding:22px 18px 26px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr><td style="color:${COLORS.text};font-family:${FONT};font-size:21px;line-height:27px;font-weight:bold;">Resumo executivo</td></tr>
                <tr><td style="color:${COLORS.muted};font-family:${FONT};font-size:13px;line-height:20px;padding:4px 0 18px;">Visão consolidada de vendas, usuários, conteúdo e saúde operacional da plataforma.</td></tr>
                ${metricCard("Receita total", brl(data.totalRevenue), data.delta.revenue)}
                ${metricCard("Novas vendas", num(data.salesCount), data.delta.sales)}
                ${metricCard("Novos usuários", num(data.newStudents), data.delta.users)}
                ${metricCard("Vendas de afiliados", num(data.affiliateSales.count), data.delta.affiliateSales)}
                ${metricCard("Comissões", brl(data.affiliateSales.commission), data.delta.commission)}
                ${dataSection("Financeiro", financial)}
                ${dataSection("Acumulado", accumulated)}
                ${dataSection("Usuários", users)}
                ${dataSection("Conteúdo", content)}
                ${alertSection(data)}
                <tr><td height="16" style="height:16px;line-height:16px;font-size:1px;">&nbsp;</td></tr>
                ${actionButton("Abrir Dashboard", `${site}/admin`, true)}
                ${actionButton("Abrir Financeiro", `${site}/admin/financeiro`)}
                ${actionButton("Abrir Usuários", `${site}/admin/alunos`)}
                ${actionButton("Abrir Afiliados", `${site}/admin/afiliados`)}
                <tr><td style="border-top:1px solid ${COLORS.border};padding-top:16px;color:${COLORS.muted};font-family:${FONT};font-size:11px;line-height:18px;text-align:center;">
                  Relatório gerado automaticamente pela plataforma ${escapeHtml(BRAND.name)}.<br>
                  Data/Hora: ${escapeHtml(data.generatedAt)} (Brasília) - Ambiente: ${escapeHtml(data.environment)}<br>
                  Documento interno - não encaminhe para clientes.
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(data: AdminReportData) {
  return [
    `${BRAND.name} - ${data.reportType}`,
    `Referência: ${data.formattedDate}`,
    "",
    `Receita total: ${brl(data.totalRevenue)}`,
    `Novas vendas: ${num(data.salesCount)}`,
    `Vendas 30 dias: ${num(data.last30Sales.count)} - ${brl(data.last30Sales.value)}`,
    `Acumulado histórico: ${num(data.lifetimeSales.count)} - ${brl(data.lifetimeSales.value)}`,
    `Novos usuários: ${num(data.newStudents)}`,
    `Saques de afiliados pendentes: ${num(data.payoutsPending.count)} - ${brl(data.payoutsPending.value)}`,
    `Vendas de afiliados: ${num(data.affiliateSales.count)}`,
    `Comissões: ${brl(data.affiliateSales.commission)}`,
    "",
    `Data/Hora: ${data.generatedAt} (Brasília) - Ambiente: ${data.environment}`,
  ].join("\n");
}

export async function renderAdminReportEmail(data: AdminReportData) {
  return {
    html: buildHtml(data),
    text: buildText(data),
    subject: `[${data.environment}] ${data.reportType} — ${data.formattedDate}`,
  };
}