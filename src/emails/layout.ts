/**
 * Layout base dos e-mails da Ronnei na Veia.
 *
 * HTML 100% inline, tabelas (compatível com Gmail, Outlook, Apple Mail),
 * largura máxima de 650px, mobile-first e dark-mode friendly.
 * Não usa CSS externo nem dependências de runtime.
 */

/** Domínio oficial da marca — usado em TODOS os links dos e-mails (mesmo antes do DNS ativar). */
const BRAND_SITE = "https://ronneinaveia.com.br";

/** Host publicado e ativo — usado apenas para as IMAGENS dos e-mails (precisa responder 200). */
const ACTIVE_ASSET_HOST = "https://skewer-success-engine.lovable.app";

function resolveSite(): string {
  const raw = process.env["SITE_URL"] || process.env["PUBLIC_SITE_URL"] || BRAND_SITE;
  return String(raw).replace(/\/$/, "");
}

/**
 * Host das imagens dos e-mails. Fica separado dos links porque o domínio da marca
 * pode ainda não estar publicado/propagado — e isso quebraria a logo e o banner.
 */
function resolveAssetBase(): string {
  const raw = process.env["EMAIL_ASSET_BASE_URL"] || ACTIVE_ASSET_HOST;
  return String(raw).replace(/\/$/, "");
}


export const ASSET_BASE = resolveAssetBase();

export const BRAND = {
  name: "Ronnei na Veia",
  black: "#0B0B0B",
  orange: "#FF6B00",
  white: "#FFFFFF",
  gray: "#F5F5F5",
  site: resolveSite(),
};

export const EMAIL_ASSETS = {
  logo: `${ASSET_BASE}/email-logo.png`,
  lockup: `${ASSET_BASE}/email-lockup.png`,
  banner: `${ASSET_BASE}/email-banner.jpg`,
};


export const LINKS = {
  dashboard: `${BRAND.site}/app`,
  privacy: `${BRAND.site}/privacidade`,
  terms: `${BRAND.site}/termos`,
  support: `${BRAND.site}/app/suporte`,
  instagram: "https://instagram.com/ronneinaveia",
  youtube: "https://youtube.com/@ronneinaveia",
  facebook: "https://facebook.com/ronneinaveia",
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EmailBlock =
  | { type: "text"; text: string; highlight?: boolean }
  | { type: "checklist"; title?: string; items: string[] }
  | { type: "details"; title?: string; rows: { label: string; value: string }[] }
  | { type: "highlight"; title: string; value: string; hint?: string }
  | { type: "quote"; text: string }
  | { type: "note"; text: string }
  | { type: "raw"; html: string };

export interface EmailOptions {
  /** Texto de pré-visualização (inbox preview). */
  preview: string;
  /** Título dinâmico exibido sobre o banner. */
  heading: string;
  /** Subtítulo curto opcional. */
  subheading?: string;
  /** Saudação, ex.: "Olá, João" */
  greeting?: string;
  blocks: EmailBlock[];
  cta?: { label: string; url: string };
  /** Observação final discreta (ex.: expiração de link). */
  footnote?: string;
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "text":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${
        block.highlight ? BRAND.orange : "#33333a"
      };${block.highlight ? "font-weight:600;" : ""}">${block.text}</p>`;

    case "checklist":
      return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.black};border-radius:14px;margin:0 0 22px;">
  <tr><td style="padding:20px 22px;">
    ${
      block.title
        ? `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;font-weight:700;color:${BRAND.orange};">${block.title}</p>`
        : ""
    }
    ${block.items
      .map(
        (item) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="26" valign="top" style="font-family:${FONT};font-size:15px;line-height:24px;color:${BRAND.orange};">&#10003;</td>
        <td style="font-family:${FONT};font-size:15px;line-height:24px;color:#f1f1f1;padding-bottom:8px;">${item}</td>
      </tr></table>`,
      )
      .join("")}
  </td></tr>
</table>`;

    case "details":
      return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.gray};border-radius:14px;margin:0 0 22px;">
  <tr><td style="padding:18px 22px;">
    ${
      block.title
        ? `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6b6b73;">${block.title}</p>`
        : ""
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${block.rows
        .map(
          (row) => `<tr>
        <td style="font-family:${FONT};font-size:14px;line-height:22px;color:#6b6b73;padding:6px 0;">${row.label}</td>
        <td align="right" style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${BRAND.black};padding:6px 0;">${row.value}</td>
      </tr>`,
        )
        .join("")}
    </table>
  </td></tr>
</table>`;

    case "highlight":
      return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${BRAND.orange};border-radius:14px;margin:0 0 22px;">
  <tr><td align="center" style="padding:20px;">
    <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6b6b73;">${block.title}</p>
    <p style="margin:0;font-family:${FONT};font-size:30px;line-height:38px;font-weight:800;color:${BRAND.orange};">${block.value}</p>
    ${block.hint ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;color:#6b6b73;">${block.hint}</p>` : ""}
  </td></tr>
</table>`;

    case "quote":
      return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.gray};border-left:4px solid ${BRAND.orange};border-radius:8px;margin:0 0 22px;">
  <tr><td style="padding:16px 18px;font-family:${FONT};font-size:15px;line-height:24px;color:#3a3a42;font-style:italic;">${block.text}</td></tr>
</table>`;

    case "note":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:20px;color:#82828c;">${block.text}</p>`;

    case "raw":
      return `<div style="font-family:${FONT};font-size:16px;line-height:26px;color:#33333a;">${block.html}</div>`;
  }
}

function socialIcon(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin:0 6px;font-family:${FONT};font-size:12px;font-weight:700;color:#c9c9cf;text-decoration:none;border:1px solid #3a3a40;border-radius:999px;padding:8px 12px;">${label}</a>`;
}

/** Monta o HTML completo do e-mail. */
export function renderEmailLayout(options: EmailOptions): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${esc(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#0B0B0B;">
<div style="display:none;font-size:1px;color:#0B0B0B;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(options.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B0B;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="650" cellpadding="0" cellspacing="0" style="width:100%;max-width:650px;background:${BRAND.black};border-radius:18px;overflow:hidden;">

    <!-- HEADER -->
    <tr><td align="center" style="padding:26px 20px 18px;background:${BRAND.black};">
      <img src="${EMAIL_ASSETS.lockup}" width="260" alt="${BRAND.name}" style="display:block;width:260px;max-width:80%;height:auto;border:0;outline:none;text-decoration:none;" />
      <div style="margin-top:8px;font-family:${FONT};font-size:11px;letter-spacing:2px;color:${BRAND.orange};text-transform:uppercase;">Cursos &middot; eBooks &middot; Receitas</div>

    </td></tr>
    <!-- CARD PRINCIPAL (banner + título + conteúdo em uma única superfície branca) -->
    <tr><td style="padding:6px 14px 8px;background:${BRAND.black};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.white}" style="background:${BRAND.white};border-radius:18px;overflow:hidden;">

        <!-- BANNER integrado ao topo do card branco -->
        <tr><td style="padding:10px 10px 0;background:${BRAND.white};" bgcolor="${BRAND.white}">
          <img src="${EMAIL_ASSETS.banner}" width="630" alt="Churrasco Ronnei na Veia" style="display:block;width:100%;max-width:630px;height:auto;border:0;outline:none;text-decoration:none;border-radius:14px;background:${BRAND.gray};" />
        </td></tr>

        <!-- TÍTULO -->
        <tr><td align="center" style="padding:22px 26px 2px;background:${BRAND.white};" bgcolor="${BRAND.white}">
          <h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:32px;font-weight:800;color:${BRAND.black};">${options.heading}</h1>
          ${options.subheading ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:#6b6b74;">${options.subheading}</p>` : ""}
        </td></tr>

        <!-- CONTEÚDO -->
        <tr><td style="padding:22px 24px 28px;background:${BRAND.white};" bgcolor="${BRAND.white}">
          ${options.greeting ? `<p style="margin:0 0 14px;font-family:${FONT};font-size:20px;line-height:28px;font-weight:800;color:${BRAND.black};">${options.greeting}</p>` : ""}
          ${options.blocks.map(renderBlock).join("\n")}
          ${
            options.cta
              ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
            <tr><td align="center" bgcolor="${BRAND.orange}" style="border-radius:12px;">
              <a href="${options.cta.url}" target="_blank" style="display:block;padding:16px 24px;font-family:${FONT};font-size:16px;font-weight:800;letter-spacing:.6px;color:#ffffff;text-decoration:none;text-transform:uppercase;border-radius:12px;">${options.cta.label} &rarr;</a>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:#9a9aa2;text-align:center;">Se o botão não funcionar, copie e cole este link no navegador:<br /><a href="${options.cta.url}" style="color:${BRAND.orange};text-decoration:underline;word-break:break-all;">${options.cta.url}</a></p>`
              : ""
          }
          ${options.footnote ? `<p style="margin:18px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:#82828c;">${options.footnote}</p>` : ""}
        </td></tr>
      </table>
    </td></tr>


    <!-- SUPORTE -->
    <tr><td style="padding:10px 14px 18px;background:${BRAND.black};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141416;border-radius:14px;">
        <tr><td align="center" style="padding:18px 20px;">
          <p style="margin:0 0 10px;font-family:${FONT};font-size:15px;font-weight:700;color:${BRAND.white};">Precisa de ajuda?</p>
          <a href="${LINKS.support}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:13px;font-weight:700;color:${BRAND.orange};text-decoration:none;border:1px solid ${BRAND.orange};border-radius:999px;">Falar com o suporte</a>
        </td></tr>
      </table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td align="center" style="padding:6px 20px 28px;background:${BRAND.black};">
      <div style="margin:0 0 14px;">
        ${socialIcon(LINKS.instagram, "Instagram")}${socialIcon(LINKS.youtube, "YouTube")}${socialIcon(LINKS.facebook, "Facebook")}
      </div>
      <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:20px;color:#8b8b93;">
        <a href="${LINKS.privacy}" style="color:#c9c9cf;text-decoration:underline;">Política de Privacidade</a> &nbsp;&middot;&nbsp;
        <a href="${LINKS.terms}" style="color:#c9c9cf;text-decoration:underline;">Termos de Uso</a> &nbsp;&middot;&nbsp;
        <a href="${LINKS.support}" style="color:#c9c9cf;text-decoration:underline;">Central de Ajuda</a>
      </p>
      <p style="margin:0;font-family:${FONT};font-size:11px;line-height:18px;color:#6d6d75;">
        Ronnei Da Silva &middot; Senador Canedo &ndash; Goiás &ndash; Brasil<br />
        &copy; ${year} ${BRAND.name}. Todos os direitos reservados.<br />
        Você recebeu este e-mail porque faz parte da família ${BRAND.name}.
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Versão texto puro (fallback) a partir das mesmas informações. */
export function renderEmailText(options: EmailOptions): string {
  const lines: string[] = [BRAND.name.toUpperCase(), "", options.heading];
  if (options.subheading) lines.push(options.subheading);
  lines.push("");
  if (options.greeting) lines.push(options.greeting, "");
  for (const block of options.blocks) {
    if (block.type === "text" || block.type === "note" || block.type === "quote") lines.push(strip(block.text), "");
    if (block.type === "checklist") {
      if (block.title) lines.push(strip(block.title));
      block.items.forEach((i) => lines.push(`- ${strip(i)}`));
      lines.push("");
    }
    if (block.type === "details") {
      if (block.title) lines.push(strip(block.title));
      block.rows.forEach((r) => lines.push(`${strip(r.label)}: ${strip(r.value)}`));
      lines.push("");
    }
    if (block.type === "highlight") {
      lines.push(`${strip(block.title)}: ${strip(block.value)}`, "");
    }
  }
  if (options.cta) lines.push(`${options.cta.label}: ${options.cta.url}`, "");
  if (options.footnote) lines.push(strip(options.footnote), "");
  lines.push(`Suporte: ${LINKS.support}`);
  return lines.join("\n");
}

function strip(html: string): string {
  return String(html ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}


/** Embrulha HTML customizado (modelos editáveis do admin) no layout premium da marca. */
export function wrapCustomHtml(options: { heading: string; bodyHtml: string; cta?: { label: string; url: string } }): string {
  return renderEmailLayout({
    preview: options.heading,
    heading: options.heading,
    blocks: [{ type: "raw", html: options.bodyHtml }],
    cta: options.cta ?? { label: "Acessar minha área", url: LINKS.dashboard },
  });
}
