import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveRuntimeEmailTemplate } from "@/lib/email-template-resolver.server";
import { validateEmailData } from "@/emails/catalog";



export const EMAIL_SENDING_DISABLED_CODE =
  "EMAIL_SENDING_DISABLED";

export function isEmailSendingDisabledError(error: any) {
  return String(error?.code || "") === EMAIL_SENDING_DISABLED_CODE;
}

export async function isEmailSendingEnabled() {
  const { data, error } = await supabaseAdmin
    .from("email_settings")
    .select("is_enabled")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Não foi possível consultar o estado dos e-mails: ${error.message}`,
    );
  }

  return data?.is_enabled !== false;
}


export async function getResendConfig() {
  const { data: settings, error: settingsError } =
    await supabaseAdmin
      .from("email_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (settingsError) {
    throw new Error(
      `Não foi possível consultar as configurações de e-mail: ${settingsError.message}`,
    );
  }

  if (settings?.is_enabled === false) {
    const disabledError: any = new Error(
      "Envios de e-mail estão desativados nas configurações administrativas.",
    );
    disabledError.code = EMAIL_SENDING_DISABLED_CODE;
    throw disabledError;
  }

  const { data: integration, error } = await supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("category", "resend")
    .eq("status", true)
    .maybeSingle();

  if (error || !integration) {
    const envApiKey = process.env['RESEND_API_KEY'];
    if (envApiKey) {
      return {
        apiKey: envApiKey,
        fromEmail: settings?.from_email || process.env['RESEND_FROM_EMAIL'] || 'onboarding@resend.dev',
        fromName: settings?.from_name || process.env['RESEND_FROM_NAME'] || 'Plataforma'
      };
    }
    throw new Error("Integração com Resend não está configurada ou ativa.");
  }

  const credentials = (integration.credentials || {}) as Record<string, string>;
  const apiKey = credentials.apiKey;

  if (!apiKey) {
    throw new Error("Chave de API do Resend ausente nas configurações.");
  }

  return {
    apiKey,
    fromEmail: settings?.from_email || (integration.settings as any)?.fromEmail || 'onboarding@resend.dev',
    fromName: settings?.from_name || (integration.settings as any)?.fromName || 'Plataforma'
  };
}

export async function validateResendSender(apiKey: string, email: string) {
  try {
    const domain = email.split('@')[1]?.trim().toLowerCase();
    if (!domain) {
      throw new Error('E-mail remetente inválido.');
    }

    const response = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && payload?.name === 'restricted_api_key') {
        return {
          status: 'pending',
          error: 'A chave possui somente permissão de envio. Não foi possível confirmar o domínio; faça um envio de teste.'
        };
      }
      throw new Error(payload?.message || `Erro API Resend: ${response.status}`);
    }

    const domains = Array.isArray(payload?.data) ? payload.data : [];
    const configuredDomain = domains.find((item: { name?: string }) => item?.name?.toLowerCase() === domain);
    if (!configuredDomain || configuredDomain.status !== 'verified') {
      return {
        status: 'error',
        error: `O domínio ${domain} não está verificado no Resend.`
      };
    }

    return {
      status: 'verified',
      message: `Domínio ${domain} validado no Resend.`
    };
  } catch (error: any) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

function sanitizeTag(value: string) {
  const clean = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 250);
  return clean || 'na';
}

/** URL pública absoluta da logo (lockup da identidade) usada nos e-mails. */
export const EMAIL_LOGO_URL =
  (
    process.env['EMAIL_ASSET_BASE_URL'] ||
    'https://ronneinaveia.com.br'
  ).replace(/\/$/, '') + '/email-lockup.png';

/**
 * Adiciona o cabeçalho com o lockup da marca em todo e-mail enviado.
 */
function withBrandHeader(html: string, brandName: string) {
  if (!html || html.includes('email-lockup.png') || html.includes('email-logo.png')) return html;
  const header = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f10;padding:28px 0;">
  <tr>
    <td align="center">
      <img src="${EMAIL_LOGO_URL}" width="260" alt="${brandName}"
        style="display:block;width:260px;max-width:80%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
    </td>
  </tr>
</table>`;
  const block = `<div style="background:#0f0f10;">${header}</div>`;

  // Nunca injetar conteúdo antes de <!DOCTYPE>/<html> — clientes como o Gmail
  // descartam a estrutura do documento e o e-mail chega quebrado.
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const at = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
    return html.slice(0, at) + block + html.slice(at);
  }
  return `${block}${html}`;
}


export async function sendResendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  reply_to?: string;
  tags?: { name: string; value: string }[];
  /** Anexos (ex.: relatório em PDF). `content` em base64. */
  attachments?: { filename: string; content: string }[];
}) {
  try {
    const config = await getResendConfig();
    const from = params.from || `${config.fromName} <${config.fromEmail}>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: withBrandHeader(params.html, config.fromName),

        text: params.text,
        reply_to: params.reply_to,
        // Resend só aceita letras ASCII, números, "_" e "-" em nome/valor de tag
        tags: params.tags?.map((t) => ({
          name: sanitizeTag(t.name),
          value: sanitizeTag(t.value)
        })),
        attachments: params.attachments?.length ? params.attachments : undefined
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Resend] Erro na API:', data);
      const raw: string = data?.message || `Erro ${response.status} ao enviar email via Resend`;
      // Domínio não verificado: o remetente de teste (onboarding@resend.dev) só entrega
      // para o e-mail do dono da conta. Mensagem clara para o admin resolver.
      const isUnverifiedDomain =
        response.status === 403 || /testing emails|verify a domain/i.test(raw);
      const friendlyMessage =
        isUnverifiedDomain
          ? 'Envio bloqueado: o domínio do remetente não está verificado no Resend. Verifique um domínio em resend.com/domains e configure o e-mail remetente com esse domínio nas Integrações.'
          : raw;
      if (isUnverifiedDomain) {
        await supabaseAdmin.from('email_settings').update({
          validation_status: 'error',
          validation_error: friendlyMessage,
          last_validation_at: new Date().toISOString()
        }).eq('from_email', config.fromEmail);
      }
      const providerError: any = new Error(friendlyMessage);
      providerError.status = response.status;
      providerError.code = String(
        data?.name ||
        data?.code ||
        "",
      );
      throw providerError;
    }


    try {
      await supabaseAdmin.from('email_logs').insert({
        recipient_email: Array.isArray(params.to) ? params.to.join(', ') : params.to,
        template_name: params.subject,
        status: 'sent',
        provider_message_id: data.id,
        payload: { tags: params.tags } as any
      });
    } catch (logError) {
      console.warn('[Resend] Falha ao logar envio de email:', logError);
    }

    return { success: true, id: data.id };
  } catch (error: any) {
    if (isEmailSendingDisabledError(error)) {
      throw error;
    }

    console.error('[Resend] Erro ao enviar email:', error);
    try {
      await supabaseAdmin.from('email_logs').insert({
        recipient_email: Array.isArray(params.to) ? params.to.join(', ') : params.to,
        template_name: params.subject,
        status: 'error',
        error_message: error.message
      });
    } catch (logError) {}
    throw error;
  }
}

/**
 * Replace variables in a template string.
 * Example: "Hello {{name}}" + {name: "John"} -> "Hello John"
 */
export function renderTemplate(content: string, variables: Record<string, any>) {
  return content.replace(/\{\{(.+?)\}\}/g, (match, key) => {
    const cleanKey = key.trim();
    return variables[cleanKey] !== undefined ? variables[cleanKey] : match;
  });
}

/**
 * Identifica indisponibilidade temporária de capacidade
 * do provedor de e-mail.
 *
 * Esses erros NÃO devem consumir tentativas definitivas
 * da fila de recuperação.
 */
export function isEmailCapacityError(
  error: any,
) {
  const status = Number(
    error?.status || 0,
  );

  const message = String(
    error?.message ||
    error ||
    "",
  );

  const code = String(
    error?.code || "",
  );

  return (
    status === 429 ||
    /daily email sending quota/i.test(message) ||
    /sending quota/i.test(message) ||
    /quota exceeded/i.test(message) ||
    /rate.?limit/i.test(message) ||
    /too many requests/i.test(message) ||
    /rate.?limit/i.test(code)
  );
}

/**
 * Triggers an automated email based on a template name.
 */
export async function triggerEmailEvent(params: {
  event: string;
  to: string;
  data: Record<string, any>;
  idempotencyKey?: string;
  /** Interno: quando true, a falha não é re-enfileirada (já vem da fila de reenvio). */
  _retry?: boolean;
}) {

  console.log(`[Email] Disparando evento: ${params.event} para ${params.to}`);

  // Bloqueio de e-mails incompletos: valida os campos obrigatórios do evento
  // (nome, valores, datas, URLs) antes de qualquer chamada ao provedor.
  const validation = validateEmailData(params.event, params.data || {});
  if (!validation.valid) {
    const message = validation.message ?? 'Campos obrigatórios ausentes no evento de e-mail.';
    console.error(`[Email] ${message}`);
    try {
      await supabaseAdmin.from('email_logs').insert({
        recipient_email: params.to,
        template_name: params.event,
        status: 'error',
        error_message: message,
        payload: { missing: validation.missing } as any
      });
    } catch (logError) {}
    throw new Error(message);
  }

  try {
    const resolved =
      await resolveRuntimeEmailTemplate(
        params.event,
        params.data,
      );

    console.log(
      `[Email] Template ${params.event} resolvido por ${resolved.source}.`,
    );

    return await sendResendEmail({
      to: params.to,
      subject:
        params.data?.subject ||
        resolved.subject,
      html: resolved.html,
      text: resolved.text,
      tags: [
        {
          name: "event",
          value: params.event,
        },
        {
          name: "template_source",
          value: resolved.source,
        },
        ...(params.idempotencyKey
          ? [
              {
                name: "idempotency_key",
                value: params.idempotencyKey,
              },
            ]
          : []),
      ],
    });
  } catch (err: any) {
    const sendingDisabled =
      isEmailSendingDisabledError(err);

    if (!sendingDisabled) {
      console.error(
        `[Email] Falha ao disparar evento ${params.event}:`,
        err,
      );
    }

    const capacityLimited =
      isEmailCapacityError(err);

    /*
     * Desativação administrativa:
     * preserva o evento para o próximo ops_recovery após reativação,
     * sem consumir tentativa.
     *
     * Quota/rate-limit:
     * espera 12h e não consome tentativa definitiva.
     *
     * Erro comum:
     * mantém retry inicial de 5 minutos.
     */
    const retryDelayMs =
      sendingDisabled
        ? 0
        : capacityLimited
          ? 12 * 60 * 60_000
          : 5 * 60_000;

    if (!params._retry) {
      try {
        let alreadyQueued = false;

        if (params.idempotencyKey) {
          const { data: queued } =
            await supabaseAdmin
              .from('email_logs')
              .select('id')
              .eq(
                'idempotency_key',
                params.idempotencyKey,
              )
              .in(
                'status',
                ['failed', 'error'],
              )
              .is(
                'resolved_at',
                null,
              )
              .limit(1)
              .maybeSingle();

          alreadyQueued =
            Boolean(queued?.id);
        }

        if (!alreadyQueued) {
          await supabaseAdmin
            .from('email_logs')
            .insert({
              recipient_email:
                params.to,
              template_name:
                params.event,
              status: 'failed',
              attempts: 0,
              error_message:
                err?.message ||
                'Falha desconhecida no envio.',
              next_retry_at:
                sendingDisabled
                  ? null
                  : new Date(
                      Date.now() +
                      retryDelayMs,
                    ).toISOString(),
              retry_payload: {
                event:
                  params.event,
                to:
                  params.to,
                data:
                  params.data || {},
                idempotency_key:
                  params.idempotencyKey ||
                  null,
              } as any,
              idempotency_key:
                params.idempotencyKey ||
                null,
            });
        } else {
          console.log(
            `[Email] Evento ${params.event} já está na fila: ${params.idempotencyKey}`,
          );
        }
      } catch (queueError) {
        console.error(
          '[Email] Falha ao enfileirar reenvio:',
          queueError,
        );
      }
    }

    throw err;
  }
}


/**
 * Dispara um evento de e-mail no máximo uma vez por chave de idempotência.
 * A chave é registrada em `email_logs.idempotency_key`, então reenvios
 * (webhooks repetidos, cliques duplicados) não geram e-mails duplicados.
 */
export async function triggerEmailOnce(params: {
  event: string;
  to: string;
  data: Record<string, any>;
  idempotencyKey: string;
}) {
  try {
    const { data: existing } =
      await supabaseAdmin
        .from('email_logs')
        .select(
          'id,status,resolved_at',
        )
        .eq(
          'idempotency_key',
          params.idempotencyKey,
        )
        .in(
          'status',
          ['sent', 'failed', 'error'],
        )
        .order(
          'created_at',
          { ascending: false },
        )
        .limit(1)
        .maybeSingle();

    if (existing?.status === 'sent') {
      console.log(
        `[Email] Evento ${params.event} ignorado (já enviado): ${params.idempotencyKey}`,
      );

      return {
        success: true,
        skipped: true as const,
      };
    }

    if (
      existing &&
      (
        existing.status === 'failed' ||
        existing.status === 'error'
      ) &&
      !existing.resolved_at
    ) {
      console.log(
        `[Email] Evento ${params.event} já está na fila: ${params.idempotencyKey}`,
      );

      return {
        success: false,
        queued: true as const,
        skipped: true as const,
      };
    }
  } catch (checkError) {
    console.warn(
      '[Email] Falha ao checar idempotência:',
      checkError,
    );
  }

  const result =
    await triggerEmailEvent(params);

  /*
   * sendResendEmail já registrou o envio aceito.
   * Apenas anexamos a chave de idempotência
   * ao mesmo registro do provider.
   */
  try {
    const providerId =
      (result as any)?.id || null;

    let providerLogId:
      string | null = null;

    if (providerId) {
      const { data: providerLog } =
        await supabaseAdmin
          .from('email_logs')
          .select('id')
          .eq(
            'provider_message_id',
            providerId,
          )
          .order(
            'created_at',
            { ascending: false },
          )
          .limit(1)
          .maybeSingle();

      providerLogId =
        providerLog?.id || null;
    }

    if (providerLogId) {
      await supabaseAdmin
        .from('email_logs')
        .update({
          template_name:
            params.event,
          idempotency_key:
            params.idempotencyKey,
          payload: {
            event: params.event,
          } as any,
        })
        .eq(
          'id',
          providerLogId,
        );
    } else {
      /*
       * Fallback somente se o log original
       * do provider não tiver sido persistido.
       */
      await supabaseAdmin
        .from('email_logs')
        .insert({
          recipient_email:
            params.to,
          template_name:
            params.event,
          status: 'sent',
          idempotency_key:
            params.idempotencyKey,
          provider_message_id:
            providerId,
          payload: {
            event: params.event,
          } as any,
        });
    }
  } catch (logError) {
    console.warn(
      '[Email] Falha ao registrar idempotência:',
      logError,
    );
  }

  return {
    success: true,
    skipped: false as const,
    ...(result as any),
  };
}
