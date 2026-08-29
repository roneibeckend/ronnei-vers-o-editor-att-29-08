import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Proibido");
}

/** Configuração da integração Fidelize (sem expor a API Key). */
export const getFidelizeIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret, maskApiKey } = await import("./fidelize-crypto.server");

    const { data } = await supabaseAdmin
      .from("integrations")
      .select("id, name, status, credentials, settings, updated_at")
      .eq("category", "fidelize")
      .maybeSingle();

    if (!data) {
      return {
        id: null,
        status: false,
        baseUrl: "",
        testPath: "",
        hasApiKey: false,
        maskedApiKey: "",
        lastCheck: null as any,
        updatedAt: null,
      };
    }

    const credentials = (data.credentials || {}) as Record<string, string>;
    const settings = (data.settings || {}) as Record<string, any>;
    const apiKey = await decryptSecret(credentials["apiKey"] || "");

    return {
      id: data.id,
      status: data.status ?? false,
      baseUrl: settings["baseUrl"] || "",
      testPath: settings["testPath"] || "",
      hasApiKey: apiKey.trim().length > 3,
      maskedApiKey: maskApiKey(apiKey),
      lastCheck: (settings["lastCheck"] as any) ?? null,
      updatedAt: data.updated_at || null,
    };
  });

export const saveFidelizeIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        baseUrl: z
          .string()
          .trim()
          .url("Informe uma URL válida, ex.: https://afidelize.seudominio.com/api/public/integrations")
          .refine((v) => /^https?:\/\//i.test(v), "A URL deve começar com http:// ou https://"),
        apiKey: z.string().optional().default(""),
        testPath: z.string().optional().default(""),
        status: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logSystemEvent } = await import("./system-log.server");
    const { encryptSecret } = await import("./fidelize-crypto.server");

    const { data: current } = await supabaseAdmin
      .from("integrations")
      .select("id, credentials, settings")
      .eq("category", "fidelize")
      .maybeSingle();

    // Campo em branco = manter a chave atual.
    const credentials = { ...((current?.credentials || {}) as Record<string, string>) };
    if (data.apiKey.trim()) credentials["apiKey"] = await encryptSecret(data.apiKey.trim());

    const payload = {
      name: "Fidelize",
      type: "ia" as const,
      category: "fidelize",
      status: data.status,
      credentials,
      settings: {
        ...((current?.settings || {}) as Record<string, unknown>),
        baseUrl: data.baseUrl.trim().replace(/\/+$/, ""),
        testPath: data.testPath.trim(),
      },
      updated_at: new Date().toISOString(),
    };

    if (current?.id) {
      const { error } = await supabaseAdmin.from("integrations").update(payload).eq("id", current.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("integrations").insert([payload]);
      if (error) throw error;
    }

    await logSystemEvent({
      level: "info",
      source: "fidelize",
      message: "Configuração da integração Fidelize atualizada",
      details: { baseUrl: payload.settings.baseUrl, status: payload.status, apiKeyAlterada: Boolean(data.apiKey.trim()) },
      userId: context.userId,
    });

    return { success: true };
  });

/** Teste real: API Key + endpoints provision-account e customer. */
export const testFidelizeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        baseUrl: z.string().optional(),
        apiKey: z.string().optional(),
        testPath: z.string().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { runFidelizeDiagnostics, getFidelizeConfig } = await import("./fidelize.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const saved = await getFidelizeConfig();
    const baseUrl = (data.baseUrl?.trim() || saved?.baseUrl || "").replace(/\/+$/, "");
    const apiKey = data.apiKey?.trim() || saved?.apiKey || "";

    if (!baseUrl || !apiKey) {
      return {
        overall: "unavailable" as const,
        message: "Informe a URL da API e a API Key do Fidelize antes de testar.",
        checks: [],
        apiVersion: null,
        durationMs: 0,
        lastResponseAt: null,
      };
    }

    const result = await runFidelizeDiagnostics({ baseUrl, apiKey, status: true }, data.testPath);

    // Persiste o último resultado para o selo/dashboard.
    const { data: current } = await supabaseAdmin
      .from("integrations")
      .select("id, settings")
      .eq("category", "fidelize")
      .maybeSingle();

    if (current?.id) {
      await supabaseAdmin
        .from("integrations")
        .update({
          settings: {
            ...((current.settings || {}) as Record<string, unknown>),
            lastCheck: {
              overall: result.overall,
              apiVersion: result.apiVersion,
              at: new Date().toISOString(),
              durationMs: result.durationMs,
            },
          },
        })
        .eq("id", current.id);
    }

    return result;
  });

/** Indicadores do dashboard da integração. */
export const getFidelizeDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: integration }, { data: provisions }, { data: logs }, { data: job }] = await Promise.all([
      supabaseAdmin.from("integrations").select("status, settings").eq("category", "fidelize").maybeSingle(),
      supabaseAdmin
        .from("fidelize_provisioning_logs")
        .select("status, created_at, duration_ms, is_test")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("system_logs")
        .select("created_at, level, details")
        .eq("source", "fidelize")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("ops_job_runs").select("last_run_at, last_status, last_error").eq("job", "fidelize_health").maybeSingle(),
    ]);

    const rows = provisions || [];
    const durations = (logs || [])
      .map((l) => Number((l.details as any)?.["durationMs"]))
      .filter((n) => Number.isFinite(n) && n > 0);

    const settings = (integration?.settings || {}) as Record<string, any>;

    return {
      active: Boolean(integration?.status),
      lastSyncAt: rows[0]?.created_at ?? null,
      totalAccounts: rows.filter((r) => r.status === "success" && !r.is_test).length,
      testAccounts: rows.filter((r) => r.is_test).length,
      failures: rows.filter((r) => r.status === "failed").length,
      avgResponseMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      lastCheck: settings["lastCheck"] ?? null,
      health: {
        lastRunAt: job?.last_run_at ?? null,
        status: job?.last_status ?? null,
        error: job?.last_error ?? null,
      },
    };
  });

/** Logs avançados com filtros. */
export const getFidelizeLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(200).optional(),
        result: z.enum(["all", "success", "error"]).optional(),
        period: z.enum(["all", "24h", "7d"]).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("system_logs")
      .select("id, created_at, level, message, details")
      .eq("source", "fidelize")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);

    if (data.result === "error") query = query.eq("level", "ERROR");
    if (data.result === "success") query = query.eq("level", "INFO");

    if (data.period === "24h" || data.period === "7d") {
      const hours = data.period === "24h" ? 24 : 24 * 7;
      query = query.gte("created_at", new Date(Date.now() - hours * 3600_000).toISOString());
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    return (rows || []).map((row) => {
      const details = (row.details || {}) as Record<string, any>;
      return {
        id: row.id,
        createdAt: row.created_at,
        level: row.level,
        message: row.message,
        endpoint: details["request"]?.url ?? details["endpoint"] ?? null,
        durationMs: details["durationMs"] ?? null,
        httpCode: details["response"]?.httpCode ?? details["httpCode"] ?? null,
        request: details["request"] ?? null,
        response: details["response"] ?? null,
        error: details["error"] ?? null,
      };
    });
  });

/** Cria uma conta de teste na Fidelize. */
export const provisionFidelizeTestUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().email("E-mail inválido.").optional(),
        plan: z.enum(["starter", "pro", "premium"]).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { provisionFidelizeAccount } = await import("./fidelize-provisioning.server");

    const stamp = Date.now();
    const email = data.email?.trim() || `teste+${stamp}@ronneinaveia.com.br`;

    const result = await provisionFidelizeAccount({
      orderId: `test_${stamp}`,
      userId: context.userId,
      plan: data.plan ?? "starter",
      name: "Conta de Teste Ronnei",
      email,
      phone: "",
      isTest: true,
    });

    return { ...result, email };
  });

/** Lista as contas de teste criadas pelo painel. */
export const listFidelizeTestAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data } = await supabaseAdmin
      .from("fidelize_provisioning_logs")
      .select("id, created_at, plan, status, tenant_id, login_url, request_payload, response_payload, error_message")
      .eq("is_test", true)
      .order("created_at", { ascending: false })
      .limit(20);

    return (data || []).map((row) => {
      const req = (row.request_payload || {}) as any;
      const res = (row.response_payload || {}) as any;
      return {
        id: row.id,
        createdAt: row.created_at,
        plan: row.plan,
        status: row.status,
        email: req?.email ?? null,
        login: res?.login ?? req?.email ?? null,
        temporaryPassword: res?.temporary_password ?? null,
        loginUrl: row.login_url,
        error: row.error_message,
      };
    });
  });

export const deleteFidelizeTestUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { deleteFidelizeTestAccount } = await import("./fidelize-provisioning.server");
    return deleteFidelizeTestAccount(data.id);
  });

/** Executa o health check manualmente. */
export const runFidelizeHealthNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { runFidelizeHealthCheck } = await import("./fidelize.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await runFidelizeHealthCheck();

    await supabaseAdmin.from("ops_job_runs").upsert(
      {
        job: "fidelize_health",
        last_run_at: new Date().toISOString(),
        last_status: result.skipped ? "skipped" : result.success ? "success" : "error",
        last_error: result.skipped ? null : result.success ? null : `HTTP ${result.httpCode}`,
      },
      { onConflict: "job" },
    );

    return result;
  });
