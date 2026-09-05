import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  hasEmailTemplate,
  renderEmailTemplate,
  type EmailData,
  type RenderedEmail,
} from "@/emails/templates";
import {
  LINKS,
  renderEmailLayout,
  renderEmailText,
} from "@/emails/layout";

export type EmailTemplateSource =
  | "database_override"
  | "code"
  | "database_fallback"
  | "generic_fallback";

export type ResolvedEmailTemplate = RenderedEmail & {
  source: EmailTemplateSource;
  templateId: string | null;
  overrideEnabled: boolean;
  hasCodeTemplate: boolean;
};

function renderString(
  content: string,
  variables: Record<string, any>,
) {
  return String(content || "").replace(
    /\{\{(.+?)\}\}/g,
    (match, key) => {
      const cleanKey = String(key).trim();
      const value = variables?.[cleanKey];
      return value !== undefined && value !== null
        ? String(value)
        : match;
    },
  );
}

function renderDatabaseTemplate(
  template: any,
  data: Record<string, any>,
): RenderedEmail {
  return {
    subject: renderString(template.subject, data),
    html: renderString(template.content_html, data),
    text: template.content_text
      ? renderString(template.content_text, data)
      : "",
  };
}

function renderGenericFallback(
  event: string,
  data: Record<string, any>,
): RenderedEmail {
  const options = {
    preview: String(data?.subject || `Notificação ${event}`),
    heading: String(data?.heading || data?.subject || "Notificação"),
    greeting: data?.name ? `Olá, ${data.name}` : undefined,
    blocks: [
      {
        type: "text" as const,
        text: String(
          data?.message ||
            data?.mensagem ||
            data?.html ||
            "Você tem uma nova notificação na sua área de membros.",
        ),
      },
    ],
    cta: {
      label: "Acessar minha área",
      url: String(data?.link || LINKS.dashboard),
    },
  };

  return {
    subject: String(data?.subject || `Notificação: ${event}`),
    html: renderEmailLayout(options),
    text: renderEmailText(options),
  };
}

/**
 * ÚNICA regra de resolução usada por produção e pela prévia administrativa.
 *
 * Ordem:
 * 1. Banco, SOMENTE quando override foi explicitamente ativado.
 * 2. Template premium em código.
 * 3. Banco como fallback quando não existe template em código.
 * 4. Layout genérico seguro da marca.
 */
export async function resolveRuntimeEmailTemplate(
  event: string,
  data: EmailData = {},
): Promise<ResolvedEmailTemplate> {
  const db = supabaseAdmin as any;

  const { data: databaseTemplate, error } =
    await db
      .from("email_templates")
      .select("*")
      .eq("name", event)
      .maybeSingle();

  if (error) {
    console.warn(
      `[Email] Falha ao consultar template de banco "${event}":`,
      error.message,
    );
  }

  const coded = renderEmailTemplate(event, data);
  const hasCode = hasEmailTemplate(event);
  const overrideEnabled = Boolean(databaseTemplate?.is_production_override);

  if (databaseTemplate && overrideEnabled) {
    const rendered = renderDatabaseTemplate(databaseTemplate, data);

    return {
      ...rendered,
      source: "database_override",
      templateId: databaseTemplate.id || null,
      overrideEnabled: true,
      hasCodeTemplate: hasCode,
    };
  }

  if (coded) {
    return {
      ...coded,
      source: "code",
      templateId: databaseTemplate?.id || null,
      overrideEnabled: false,
      hasCodeTemplate: true,
    };
  }

  if (databaseTemplate) {
    const rendered = renderDatabaseTemplate(databaseTemplate, data);

    return {
      ...rendered,
      source: "database_fallback",
      templateId: databaseTemplate.id || null,
      overrideEnabled: false,
      hasCodeTemplate: false,
    };
  }

  const fallback = renderGenericFallback(event, data);

  return {
    ...fallback,
    source: "generic_fallback",
    templateId: null,
    overrideEnabled: false,
    hasCodeTemplate: false,
  };
}
