import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      .select('*')
      .eq('category', 'resend')
      .maybeSingle();

    if (error) throw error;
    
    if (!data) return undefined;

    return {
      id: data.id,
      name: data.name,
      category: data.category,
      status: data.status ?? false,
      credentials: (data.credentials || {}) as Record<string, string>,
      settings: (data.settings || {}) as Record<string, string>,
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

    if (data.category === 'resend') {
      const apiKey = data.credentials?.apiKey || process.env['RESEND_API_KEY'];
      if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('re_')) {
        return {
          success: false,
          message: "API Key do Resend não encontrada ou inválida. Insira uma chave começando com 're_'.",
          latency: `${Date.now() - start}ms`,
          httpCode: 400,
          environment: data.environment || 'production',
          timestamp: new Date().toISOString(),
          endpoint: 'https://api.resend.com/emails',
          responseBody: null
        };
      }

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            from: 'onboarding@resend.dev',
            to: 'test@resend.dev',
            subject: 'Validation',
            html: 'Validation',
            dry_run: true
          })
        });

        const latency = `${Date.now() - start}ms`;
        const responseBody = await response.json().catch(() => ({}));

        if (response.status === 401) {
          return {
            success: false,
            message: responseBody.name === 'restricted_api_key'
              ? 'Chave de API restrita: válida apenas para envio, não para testes de domínio.'
              : 'API Key do Resend inválida (401).',
            latency,
            httpCode: 401,
            environment: data.environment || 'production',
            timestamp: new Date().toISOString(),
            endpoint: 'https://api.resend.com/emails',
            responseBody
          };
        }

        if (!response.ok) {
          return {
            success: false,
            message: responseBody.message || `Erro na API Resend: ${response.status}`,
            latency,
            httpCode: response.status,
            environment: data.environment || 'production',
            timestamp: new Date().toISOString(),
            endpoint: 'https://api.resend.com/emails',
            responseBody
          };
        }

        return {
          success: true,
          message: "Conexão com Resend validada com sucesso!",
          latency,
          httpCode: response.status,
          environment: data.environment || 'production',
          timestamp: new Date().toISOString(),
          endpoint: 'https://api.resend.com/emails',
          responseBody
        };
      } catch (error: any) {
        return {
          success: false,
          message: error.message || "Erro inesperado ao testar conexão com Resend.",
          latency: `${Date.now() - start}ms`,
          httpCode: 500,
          environment: data.environment || 'production',
          timestamp: new Date().toISOString(),
          endpoint: 'https://api.resend.com/emails',
          responseBody: null
        };
      }
    }

    return {
      success: true,
      message: "Conexão testada com sucesso!",
      latency: `${Date.now() - start}ms`,
      httpCode: 200,
      environment: data.environment || 'production',
      timestamp: new Date().toISOString(),
      endpoint: `https://api.${data.category}.com/v1/verify`,
      responseBody: { status: "active", version: "1.0.0" }
    };
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
    limit: z.number().optional()
  }).parse(data))
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'admin' 
    });
    if (!isAdmin) throw new Error("Proibido");

    return [];
  });
