import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function writeIntegrationLog(input: {
  integrationName: string;
  status: "success" | "error" | "info";
  message: string;
  latency?: string | null;
  httpCode?: number | null;
  endpoint?: string | null;
  environment?: string | null;
  responseBody?: Record<string, any> | null;
  details?: Record<string, any> | null;
  userId?: string | null;
}) {
  try {
    await supabaseAdmin.from("integration_logs").insert({
      integration_name: input.integrationName,
      status: input.status,
      message: input.message,
      latency: input.latency ?? null,
      http_code: input.httpCode ?? null,
      endpoint: input.endpoint ?? null,
      environment: input.environment ?? null,
      response_body: input.responseBody ?? null,
      details: input.details ?? null,
      user_id: input.userId ?? null,
    });
  } catch (error) {
    console.warn("[Integrações] Falha ao registrar histórico:", error);
  }
}

export const getResendIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'admin' 
    });
    if (!isAdmin) throw new Error("Proibido");

    const { data, error } = await supabaseAdmin
      .from('integrations')
      .select('id, name, category, status, settings, type, updated_at, credentials')
      .eq('category', 'resend')
      .maybeSingle();

    if (error) throw error;
    
    if (!data) return undefined;

    return {
      id: data.id,
      name: data.name,
      category: data.category,
      status: data.status ?? false,
      // Segurança: nunca devolve o segredo salvo ao navegador.
      // O backend preserva a credencial existente quando o campo é enviado vazio.
      credentials: {} as Record<string, string>,
      settings: {
        ...((data.settings || {}) as Record<string, string>),
        hasApiKey: Boolean(
          typeof (data.credentials as any)?.apiKey === 'string' &&
          (data.credentials as any).apiKey.trim().length > 3
        ) as any
      },
      type: data.type as 'ia' | 'payment',
      updated_at: data.updated_at || undefined
    };
  });

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    id: z.string().optional().nullable(),
    name: z.string(),
    type: z.enum(['ia', 'payment', 'feature']),
    category: z.string(),
    status: z.boolean(),
    credentials: z.record(z.any()),
    settings: z.record(z.any())
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'admin' 
    });
    if (!isAdmin) throw new Error("Proibido");

    // O navegador nunca recebe as credenciais salvas, então campos deixados em
    // branco significam "manter o valor atual" — nunca apagar o que já existe.
    let mergedCredentials: Record<string, any> = {};
    if (data.id && data.id !== '') {
      const { data: current } = await supabaseAdmin
        .from('integrations')
        .select('credentials')
        .eq('id', data.id)
        .maybeSingle();
      mergedCredentials = { ...((current?.credentials || {}) as Record<string, any>) };
    }
    for (const [key, value] of Object.entries(data.credentials || {})) {
      if (typeof value === 'string' && value.trim() === '') continue;
      mergedCredentials[key] = value;
    }

    const payload = {
      name: data.name,
      type: data.type === 'feature' ? 'ia' : data.type as 'ia' | 'payment',
      category: data.category,
      status: data.status,
      credentials: mergedCredentials,
      settings: data.settings,
      updated_at: new Date().toISOString()
    };

    if (data.id && data.id !== '') {
      const { error } = await supabaseAdmin
        .from('integrations')
        .update(payload)
        .eq('id', data.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('integrations')
        .insert([payload]);
      if (error) throw error;
    }

    await writeIntegrationLog({
      integrationName: data.category,
      status: "info",
      message: "Configurações da integração salvas pelo administrador.",
      environment:
        String(data.settings?.environment || "") === "sandbox" ||
        String(data.settings?.testMode) === "true"
          ? "sandbox"
          : "production",
      details: { action: "save", enabled: data.status },
      userId: context.userId,
    });

    return { success: true };
  });

/**
 * Retorna apenas QUAIS chaves de credencial já estão preenchidas por categoria
 * (nunca os valores), para o painel poder renderizar os campos corretos.
 */
export const getCredentialStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin'
    });
    if (!isAdmin) throw new Error("Proibido");

    const { data, error } = await supabaseAdmin
      .from('integrations')
      .select('category, credentials');
    if (error) throw error;

    const result: Record<string, Record<string, boolean>> = {};
    for (const row of data || []) {
      const creds = (row.credentials || {}) as Record<string, unknown>;
      const filled: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(creds)) {
        filled[key] = typeof value === 'string' ? value.trim().length > 3 : Boolean(value);
      }
      result[row.category] = filled;
    }
    return result;
  });

export const testIntegrationConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    id: z.string().optional().nullable(),
    category: z.string(),
    credentials: z.record(z.any()),
    settings: z.record(z.any()),
    environment: z.string().optional()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin'
    });
    if (!isAdmin) throw new Error("Proibido");

    const start = Date.now();
    const environment = data.environment || 'production';

    const finalize = async (result: any) => {
      await writeIntegrationLog({
        integrationName: data.category,
        status:
          result.supported === false
            ? "info"
            : result.success
              ? "success"
              : "error",
        message: result.message,
        latency: result.latency ?? `${Date.now() - start}ms`,
        httpCode: result.httpCode ?? null,
        endpoint: result.endpoint ?? null,
        environment: result.environment ?? environment,
        responseBody:
          result.responseBody && typeof result.responseBody === "object"
            ? result.responseBody
            : null,
        details: {
          action: "connection_test",
          supported: result.supported !== false,
        },
        userId: context.userId,
      });
      return result;
    };

    if (data.category === 'resend') {
      let apiKey =
        typeof data.credentials?.apiKey === 'string' &&
        data.credentials.apiKey.trim()
          ? data.credentials.apiKey.trim()
          : '';

      if (!apiKey) {
        let query = supabaseAdmin
          .from('integrations')
          .select('credentials')
          .eq('category', 'resend');

        if (data.id) query = query.eq('id', data.id);

        const { data: savedIntegration } = await query.maybeSingle();
        const savedCredentials =
          (savedIntegration?.credentials || {}) as Record<string, unknown>;

        if (
          typeof savedCredentials.apiKey === 'string' &&
          savedCredentials.apiKey.trim()
        ) {
          apiKey = savedCredentials.apiKey.trim();
        }
      }

      if (!apiKey) apiKey = process.env['RESEND_API_KEY'] || '';

      if (!apiKey || !apiKey.startsWith('re_')) {
        return await finalize({
          success: false,
          supported: true,
          message: "API Key do Resend não encontrada ou inválida.",
          latency: `${Date.now() - start}ms`,
          httpCode: 400,
          environment,
          timestamp: new Date().toISOString(),
          endpoint: 'https://api.resend.com/emails',
          responseBody: null
        });
      }

      try {
        const { data: emailSettings } = await supabaseAdmin
          .from('email_settings')
          .select('from_email, from_name')
          .maybeSingle();

        const fromEmail =
          typeof emailSettings?.from_email === 'string' &&
          emailSettings.from_email.trim()
            ? emailSettings.from_email.trim()
            : 'onboarding@resend.dev';

        const fromName =
          typeof emailSettings?.from_name === 'string' &&
          emailSettings.from_name.trim()
            ? emailSettings.from_name.trim()
            : 'Ronnei na Veia';

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'RonneiNaVeia-Integration-Test/1.0'
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: ['delivered+ronnei-integration-test@resend.dev'],
            subject: 'Teste de integração Resend — Ronnei na Veia',
            html: '<p>Teste técnico de integração concluído.</p>',
            tags: [{ name: 'event', value: 'integration_test' }]
          })
        });

        const body = await response.json().catch(() => ({}));
        const latency = `${Date.now() - start}ms`;

        if (!response.ok) {
          return await finalize({
            success: false,
            supported: true,
            message: body?.message || `Erro na API Resend: ${response.status}`,
            latency,
            httpCode: response.status,
            environment,
            timestamp: new Date().toISOString(),
            endpoint: 'https://api.resend.com/emails',
            responseBody: {
              name: body?.name || null,
              message: body?.message || null
            }
          });
        }

        return await finalize({
          success: true,
          supported: true,
          message: "Conexão com Resend validada com sucesso!",
          latency,
          httpCode: response.status,
          environment,
          timestamp: new Date().toISOString(),
          endpoint: 'https://api.resend.com/emails',
          responseBody: { accepted: true, id: body?.id || null }
        });
      } catch (error: any) {
        return await finalize({
          success: false,
          supported: true,
          message: error?.message || "Erro inesperado ao testar Resend.",
          latency: `${Date.now() - start}ms`,
          httpCode: 500,
          environment,
          timestamp: new Date().toISOString(),
          endpoint: 'https://api.resend.com/emails',
          responseBody: null
        });
      }
    }

    if (data.category === 'asaas') {
      try {
        const {
          getAsaasConfig,
          asaasFetchJson,
          asaasHeaders,
          asaasErrorMessage,
        } = await import("@/lib/asaas.server");

        const config = await getAsaasConfig();
        const endpoint = `${config.baseUrl}/customers?limit=1&offset=0`;
        const response = await asaasFetchJson(
          endpoint,
          { method: "GET", headers: asaasHeaders(config.apiKey) },
          1,
        );
        const latency = `${Date.now() - start}ms`;
        const resolvedEnvironment = config.isTestMode ? "sandbox" : "production";

        if (!response.ok) {
          return await finalize({
            success: false,
            supported: true,
            message: asaasErrorMessage(response),
            latency,
            httpCode: response.status,
            environment: resolvedEnvironment,
            timestamp: new Date().toISOString(),
            endpoint,
            responseBody: { authenticated: false, provider: "asaas" }
          });
        }

        return await finalize({
          success: true,
          supported: true,
          message: "Conexão com Asaas validada diretamente na API.",
          latency,
          httpCode: response.status,
          environment: resolvedEnvironment,
          timestamp: new Date().toISOString(),
          endpoint,
          responseBody: { authenticated: true, provider: "asaas" }
        });
      } catch (error: any) {
        return await finalize({
          success: false,
          supported: true,
          message: error?.message || "Falha ao testar a integração Asaas.",
          latency: `${Date.now() - start}ms`,
          httpCode: 500,
          environment,
          timestamp: new Date().toISOString(),
          endpoint: "Asaas API",
          responseBody: null
        });
      }
    }

    return await finalize({
      success: false,
      supported: false,
      message:
        `Teste real ainda não implementado para "${data.category}". ` +
        "Nenhuma conexão externa foi simulada.",
      latency: `${Date.now() - start}ms`,
      httpCode: 501,
      environment,
      timestamp: new Date().toISOString(),
      endpoint: "Não executado",
      responseBody: { status: "not_implemented", simulated: false }
    });
  });

/**
 * Dispara um evento de teste contra o nosso próprio endpoint de webhook Asaas,
 * usando o webhookToken salvo nas credenciais — reproduz exatamente a chamada
 * que o Asaas faria, validando URL + token + processamento de ponta a ponta.
 */
export const testAsaasWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    origin: z.string().url()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin'
    });
    if (!isAdmin) throw new Error("Proibido");

    const { data: row } = await supabaseAdmin
      .from('integrations')
      .select('credentials')
      .eq('category', 'asaas')
      .maybeSingle();
    const token = (row?.credentials as Record<string, string> | null)?.webhookToken;

    if (!token || token.trim().length < 8) {
      return {
        success: false,
        message: "Webhook Token não configurado. Salve um token forte no campo 'webhookToken' antes de testar.",
        httpCode: 400
      };
    }

    const url = `${data.origin}/api/public/webhooks/asaas`;
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'asaas-access-token': token
        },
        body: JSON.stringify({
          id: 'evt_test_' + Date.now(),
          event: 'WEBHOOK_TEST',
          payment: {
            id: 'pay_test_' + Date.now(),
            status: 'CONFIRMED',
            value: 0,
            externalReference: 'webhook_test'
          }
        })
      });

      const latency = `${Date.now() - start}ms`;
      const body = await response.text().catch(() => '');

      if (response.ok) {
        return {
          success: true,
          message: "Webhook respondeu com sucesso! URL e token estão corretos.",
          httpCode: response.status,
          latency,
          responseBody: body.slice(0, 500)
        };
      }

      return {
        success: false,
        message: `Webhook rejeitou a chamada (${response.status}). ${
          response.status === 403
            ? 'O token salvo aqui não bate com o configurado no endpoint.'
            : 'Verifique os logs do servidor.'
        }`,
        httpCode: response.status,
        latency,
        responseBody: body.slice(0, 500)
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Falha ao chamar o endpoint de webhook.",
        httpCode: 500,
        latency: `${Date.now() - start}ms`
      };
    }
  });

export const getIntegrationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    category: z.string(),
    limit: z.number().int().min(1).max(100).optional()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin'
    });
    if (!isAdmin) throw new Error("Proibido");

    const { data: logs, error } = await supabaseAdmin
      .from("integration_logs")
      .select("id,integration_name,status,message,latency,http_code,endpoint,environment,response_body,details,created_at")
      .eq("integration_name", data.category)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);

    if (error) throw new Error(error.message);
    return logs ?? [];
  });
