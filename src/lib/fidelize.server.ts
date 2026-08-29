// Serviço de integração com a API do Fidelize (server-only).
// Toda chamada é registrada em public.system_logs (source: "fidelize") com
// requisição, resposta, erro e tempo de processamento.

import { logSystemEvent } from "./system-log.server";

export type FidelizeConfig = {
  baseUrl: string;
  apiKey: string;
  status: boolean;
};

export type FidelizeCallResult<T = unknown> = {
  success: boolean;
  httpCode: number;
  durationMs: number;
  endpoint: string;
  method: string;
  data: T | null;
  rawBody: string | null;
  error: string | null;
  timestamp: string;
};

const MAX_BODY_LOG = 2000;

function redact(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (/(api[-_]?key|authorization|token|secret|password)/i.test(key)) {
      clone[key] = "***redacted***";
    }
  }
  return clone;
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

/** Lê a configuração salva da integração Fidelize. */
export async function getFidelizeConfig(): Promise<FidelizeConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("status, credentials, settings")
    .eq("category", "fidelize")
    .maybeSingle();

  if (!data) return null;

  const credentials = (data.credentials || {}) as Record<string, string>;
  const settings = (data.settings || {}) as Record<string, string>;
  const baseUrl = settings["baseUrl"] || "";
  const apiKey = credentials["apiKey"] || "";
  if (!baseUrl || !apiKey) return null;

  return { baseUrl: normalizeBaseUrl(baseUrl), apiKey, status: data.status ?? false };
}

/**
 * Executa uma chamada autenticada na API do Fidelize com logging completo.
 */
export async function fidelizeRequest<T = unknown>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    config?: FidelizeConfig;
    timeoutMs?: number;
    context?: Record<string, unknown>;
  } = {},
): Promise<FidelizeCallResult<T>> {
  const method = options.method ?? "GET";
  const started = Date.now();
  const timestamp = new Date().toISOString();

  const config = options.config ?? (await getFidelizeConfig());
  if (!config) {
    const result: FidelizeCallResult<T> = {
      success: false,
      httpCode: 0,
      durationMs: Date.now() - started,
      endpoint: path,
      method,
      data: null,
      rawBody: null,
      error: "Integração Fidelize não configurada (URL da API e/ou API Key ausentes).",
      timestamp,
    };
    await logSystemEvent({
      level: "error",
      source: "fidelize",
      message: `Fidelize ${method} ${path} — não configurado`,
      details: { ...result, ...(options.context ?? {}) },
    });
    return result;
  }

  const url = new URL(
    `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });

    const rawBody = await response.text().catch(() => "");
    let parsed: T | null = null;
    try {
      parsed = rawBody ? (JSON.parse(rawBody) as T) : null;
    } catch {
      parsed = null;
    }

    const result: FidelizeCallResult<T> = {
      success: response.ok,
      httpCode: response.status,
      durationMs: Date.now() - started,
      endpoint: url.pathname + url.search,
      method,
      data: parsed,
      rawBody: rawBody.slice(0, MAX_BODY_LOG),
      error: response.ok ? null : `HTTP ${response.status} ${response.statusText}`,
      timestamp,
    };

    await logSystemEvent({
      level: response.ok ? "info" : "error",
      source: "fidelize",
      message: `Fidelize ${method} ${result.endpoint} → ${response.status} (${result.durationMs}ms)`,
      details: {
        request: {
          url: url.toString(),
          method,
          body: redact(options.body),
          query: options.query ?? null,
        },
        response: {
          httpCode: response.status,
          body: result.rawBody,
        },
        error: result.error,
        durationMs: result.durationMs,
        ...(options.context ?? {}),
      },
    });

    return result;
  } catch (err) {
    const error = err as Error;
    const aborted = error?.name === "AbortError";
    const result: FidelizeCallResult<T> = {
      success: false,
      httpCode: 0,
      durationMs: Date.now() - started,
      endpoint: url.pathname,
      method,
      data: null,
      rawBody: null,
      error: aborted ? "Tempo limite excedido ao contatar a API do Fidelize." : error?.message || "Erro desconhecido.",
      timestamp,
    };

    await logSystemEvent({
      level: "error",
      source: "fidelize",
      message: `Fidelize ${method} ${result.endpoint} falhou (${result.durationMs}ms)`,
      details: {
        request: { url: url.toString(), method, body: redact(options.body) },
        response: null,
        error: result.error,
        stack: error?.stack?.slice(0, 1000) ?? null,
        durationMs: result.durationMs,
        ...(options.context ?? {}),
      },
    });

    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** Ping de conexão: tenta os endpoints mais comuns até um responder. */
export async function fidelizePing(config?: FidelizeConfig, testPath?: string) {
  const candidates = testPath && testPath.trim() ? [testPath.trim()] : ["/health", "/ping", "/me", "/"];
  let last: FidelizeCallResult | null = null;

  for (const path of candidates) {
    const result = await fidelizeRequest(path, { config, context: { operation: "test_connection" } });
    last = result;
    if (result.success) return result;
    // 401/403 indicam servidor acessível porém credencial inválida — não adianta tentar outros paths.
    if (result.httpCode === 401 || result.httpCode === 403) return result;
  }

  return last!;
}
