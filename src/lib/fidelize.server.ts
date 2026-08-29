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
  /** Versão da API informada pelo Fidelize (header ou corpo), quando disponível. */
  apiVersion?: string | null;
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
  const clean = url.trim().replace(/\/+$/, "");
  // http:// gera 301 para https e o redirect converte POST em GET (causa de 405
  // em /provision-account). Forçamos https, exceto em hosts locais.
  if (/^http:\/\//i.test(clean) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(clean)) {
    return clean.replace(/^http:\/\//i, "https://");
  }
  return clean;
}


/** Lê a configuração salva da integração Fidelize (descriptografando a API Key). */
export async function getFidelizeConfig(): Promise<FidelizeConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptSecret } = await import("./fidelize-crypto.server");
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("status, credentials, settings")
    .eq("category", "fidelize")
    .maybeSingle();

  if (!data) return null;

  const credentials = (data.credentials || {}) as Record<string, string>;
  const settings = (data.settings || {}) as Record<string, string>;
  const baseUrl = settings["baseUrl"] || "";
  const apiKey = await decryptSecret(credentials["apiKey"] || "");
  if (!baseUrl || !apiKey) return null;

  return { baseUrl: normalizeBaseUrl(baseUrl), apiKey, status: data.status ?? false };
}

/**
 * Resolve o caminho de um endpoint respeitando a base informada pelo admin.
 * A base pode ou não já conter `/api/public/integrations`.
 */
export function resolveFidelizePath(baseUrl: string, name: string): string {
  const clean = normalizeBaseUrl(baseUrl);
  const suffix = name.startsWith("/") ? name : `/${name}`;
  return /\/api\/public\/integrations$/i.test(clean) ? suffix : `/api/public/integrations${suffix}`;
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
        // Autenticação exclusivamente via x-api-key (sem Authorization Bearer).
        "x-api-key": config.apiKey,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      // "manual" evita que um 301/302 transforme POST em GET silenciosamente.
      redirect: "manual",
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
      apiVersion:
        response.headers.get("x-api-version") ||
        response.headers.get("api-version") ||
        (parsed && typeof parsed === "object" ? ((parsed as any).version ?? (parsed as any).api_version ?? null) : null),
      error: response.ok
        ? null
        : response.status >= 300 && response.status < 400
          ? `A URL da API redirecionou (HTTP ${response.status} → ${response.headers.get("location") ?? "destino desconhecido"}). Configure a URL final (https, sem redirect).`
          : `HTTP ${response.status} ${response.statusText}`,

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
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": `${config.apiKey.slice(0, 8)}****${config.apiKey.slice(-4)}`,
          },
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

/* ===================== Diagnóstico completo da integração ===================== */

/** Telefone fictício usado apenas para sondar o endpoint de consulta de cliente. */
const FIDELIZE_DIAGNOSTIC_PHONE = "00000000000";

export type FidelizeCheckState = "ok" | "auth_error" | "unavailable" | "error";

export type FidelizeCheck = {
  key: "health" | "auth" | "provision-account" | "customer";
  label: string;
  state: FidelizeCheckState;
  httpCode: number;
  durationMs: number;
  endpoint: string;
  message: string;
};

export type FidelizeDiagnostics = {
  overall: "connected" | "auth_error" | "unavailable";
  message: string;
  checks: FidelizeCheck[];
  apiVersion: string | null;
  durationMs: number;
  lastResponseAt: string | null;
};

function classify(httpCode: number, success: boolean, strict = false): FidelizeCheckState {
  if (success) return "ok";
  if (httpCode === 401 || httpCode === 403) return "auth_error";
  if (httpCode === 0) return "unavailable";
  // 400/404/405/422 indicam que a API respondeu, mas rejeitou o payload/rota de sondagem.
  // Isso é erro do teste, não indisponibilidade da integração (exceto no /health).
  if (httpCode === 400 || httpCode === 404 || httpCode === 405 || httpCode === 422) {
    return strict && httpCode === 404 ? "unavailable" : "ok";
  }
  return "error";
}

const STATE_LABEL: Record<FidelizeCheckState, string> = {
  ok: "Disponível",
  auth_error: "Falha de autenticação",
  unavailable: "Endpoint indisponível",
  error: "Erro inesperado",
};

/**
 * Testa a conexão real: API Key, endpoint /provision-account e endpoint /customer.
 */
export async function runFidelizeDiagnostics(
  config: FidelizeConfig,
  testPath?: string,
): Promise<FidelizeDiagnostics> {
  const started = Date.now();
  const checks: FidelizeCheck[] = [];
  let apiVersion: string | null = null;
  let lastResponseAt: string | null = null;

  const probe = async (
    key: FidelizeCheck["key"],
    label: string,
    path: string,
    method: "GET" | "POST" = "GET",
    strict = false,
  ) => {
    const result = await fidelizeRequest(path, {
      method,
      config,
      context: { operation: "diagnostics", check: key },
      ...(method === "POST" ? { body: { probe: true, source: "ronnei" } } : {}),
    });
    apiVersion = apiVersion || result.apiVersion || null;
    if (result.httpCode > 0) lastResponseAt = result.timestamp;
    const state = classify(result.httpCode, result.success, strict);
    checks.push({
      key,
      label,
      state,
      httpCode: result.httpCode,
      durationMs: result.durationMs,
      endpoint: path,
      message: state === "ok" ? STATE_LABEL[state] : result.error || STATE_LABEL[state],
    });
    return state;
  };

  const healthPath = testPath?.trim() || resolveFidelizePath(config.baseUrl, "/health");
  await probe("health", "API online (/health)", healthPath, "GET", true);
  await probe("provision-account", "Provisionamento (/provision-account)", resolveFidelizePath(config.baseUrl, "/provision-account"), "POST");
  await probe(
    "customer",
    "Clientes (/customer-by-phone)",
    resolveFidelizePath(config.baseUrl, `/customer-by-phone/${FIDELIZE_DIAGNOSTIC_PHONE}`),
  );

  const authFailed = checks.some((c) => c.state === "auth_error");
  const anyOk = checks.some((c) => c.state === "ok");
  const overall: FidelizeDiagnostics["overall"] = authFailed ? "auth_error" : anyOk && checks.every((c) => c.state === "ok") ? "connected" : anyOk ? "unavailable" : "unavailable";

  return {
    overall,
    message:
      overall === "connected"
        ? "Fidelize conectada e operacional."
        : overall === "auth_error"
          ? "API Key rejeitada pelo Fidelize."
          : "Um ou mais endpoints da Fidelize estão indisponíveis.",
    checks,
    apiVersion,
    durationMs: Date.now() - started,
    lastResponseAt,
  };
}

/** Health check automático (cron a cada 30 min). */
export async function runFidelizeHealthCheck() {
  const config = await getFidelizeConfig();
  if (!config || !config.status) {
    return { skipped: true, reason: "Integração Fidelize inativa ou não configurada." };
  }

  const path = resolveFidelizePath(config.baseUrl, "/health");
  const result = await fidelizeRequest(path, { config, context: { operation: "health_check" } });

  if (!result.success) {
    const { notifyAdmin } = await import("./admin-notify.server");
    await notifyAdmin({
      type: "system",
      severity: "critical",
      title: "Fidelize fora do ar",
      body: `O health check da Fidelize falhou (HTTP ${result.httpCode || "sem resposta"}): ${result.error ?? "erro desconhecido"}`,
      link: "/admin/integracoes",
      dedupKey: "fidelize_health_fail",
      metadata: { httpCode: result.httpCode, durationMs: result.durationMs, endpoint: result.endpoint },
    });
  }

  return {
    skipped: false,
    success: result.success,
    httpCode: result.httpCode,
    durationMs: result.durationMs,
    checkedAt: result.timestamp,
  };
}
