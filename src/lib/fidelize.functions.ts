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

    const { data } = await supabaseAdmin
      .from("integrations")
      .select("id, name, status, credentials, settings, updated_at")
      .eq("category", "fidelize")
      .maybeSingle();

    if (!data) {
      return { id: null, status: false, baseUrl: "", testPath: "", hasApiKey: false, updatedAt: null };
    }

    const credentials = (data.credentials || {}) as Record<string, string>;
    const settings = (data.settings || {}) as Record<string, string>;

    return {
      id: data.id,
      status: data.status ?? false,
      baseUrl: settings["baseUrl"] || "",
      testPath: settings["testPath"] || "",
      hasApiKey: typeof credentials["apiKey"] === "string" && credentials["apiKey"].trim().length > 3,
      updatedAt: data.updated_at || null,
    };
  });

export const saveFidelizeIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        baseUrl: z.string().url("URL da API inválida."),
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

    const { data: current } = await supabaseAdmin
      .from("integrations")
      .select("id, credentials")
      .eq("category", "fidelize")
      .maybeSingle();

    // Campo em branco = manter a chave atual.
    const credentials = { ...((current?.credentials || {}) as Record<string, string>) };
    if (data.apiKey.trim()) credentials["apiKey"] = data.apiKey.trim();

    const payload = {
      name: "Fidelize",
      type: "ia" as const,
      category: "fidelize",
      status: data.status,
      credentials,
      settings: { baseUrl: data.baseUrl.trim().replace(/\/+$/, ""), testPath: data.testPath.trim() },
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
    const { fidelizePing, getFidelizeConfig } = await import("./fidelize.server");

    const saved = await getFidelizeConfig();
    const baseUrl = (data.baseUrl?.trim() || saved?.baseUrl || "").replace(/\/+$/, "");
    const apiKey = data.apiKey?.trim() || saved?.apiKey || "";

    if (!baseUrl || !apiKey) {
      return {
        success: false,
        message: "Informe a URL da API e a API Key do Fidelize antes de testar.",
        httpCode: 0,
        durationMs: 0,
        endpoint: baseUrl || "—",
        timestamp: new Date().toISOString(),
        responseBody: null,
      };
    }

    const result = await fidelizePing({ baseUrl, apiKey, status: true }, data.testPath);

    return {
      success: result.success,
      message: result.success
        ? `Conexão com o Fidelize estabelecida (${result.httpCode}) em ${result.durationMs}ms.`
        : result.httpCode === 401 || result.httpCode === 403
          ? `API Key rejeitada pelo Fidelize (${result.httpCode}).`
          : result.error || "Não foi possível conectar ao Fidelize.",
      httpCode: result.httpCode,
      durationMs: result.durationMs,
      endpoint: `${baseUrl}${result.endpoint}`,
      timestamp: result.timestamp,
      responseBody: result.rawBody,
    };
  });

/** Últimos logs de requisição/resposta/erro da integração. */
export const getFidelizeLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ limit: z.number().min(1).max(100).optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("system_logs")
      .select("id, created_at, level, message, details")
      .eq("source", "fidelize")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 25);

    if (error) throw error;

    return (rows || []).map((row) => {
      const details = (row.details || {}) as Record<string, any>;
      return {
        id: row.id,
        createdAt: row.created_at,
        level: row.level,
        message: row.message,
        durationMs: details["durationMs"] ?? null,
        request: details["request"] ?? null,
        response: details["response"] ?? null,
        error: details["error"] ?? null,
      };
    });
  });
