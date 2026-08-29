// Login único (SSO) Ronnei → Fidelize.
// Prioridade:
//   1. autologin_url devolvido no provisionamento (enquanto o token for válido)
//   2. POST /magic-link (gera um novo token de autologin para o e-mail do aluno)
//   3. login_url tradicional (último recurso)
// Todo acesso automático é auditado (system_logs + admin_audit_log).

import { logSystemEvent } from "./system-log.server";
import { fidelizeRequest, resolveFidelizePath, getFidelizeConfig } from "./fidelize.server";

export type FidelizeAccessTarget = {
  success: boolean;
  url: string | null;
  method: "autologin" | "magic-link" | "login" | "none";
  expiresAt: string | null;
  message: string | null;
};

const SAFETY_WINDOW_MS = 30_000;

/**
 * A API da Fidelize pode devolver a URL com o placeholder de configuração
 * (`PLACEHOLDER_VALUE_TO_BE_REPLACED/auth/autologin?...`) ou apenas o caminho.
 * Nesses casos reconstruímos o link usando o domínio da própria API.
 */
function sanitizeUrl(value: unknown, origin: string | null): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (/^https?:\/\//i.test(raw) && !/PLACEHOLDER/i.test(raw)) return raw;
  const path = raw.replace(/^.*?(?=\/(?:auth|acesso|app|login)\b)/i, "");
  if (!origin || !path.startsWith("/")) return null;
  return `${origin}${path}`;
}

function pickUrl(
  payload: Record<string, any> | null | undefined,
  origin: string | null,
): string | null {
  if (!payload) return null;
  const candidates = [
    payload["autologin_url"],
    payload["auto_login_url"],
    payload["autoLoginUrl"],
    payload["sso_url"],
    payload["magic_link"],
    payload["magic_link_url"],
    payload["url"],
    payload["link"],
  ];
  for (const value of candidates) {
    const url = sanitizeUrl(value, origin);
    if (url) return url;
  }
  return null;
}


function pickToken(payload: Record<string, any> | null | undefined): string | null {
  if (!payload) return null;
  const value =
    payload["autologin_token"] ?? payload["auto_login_token"] ?? payload["token"] ?? null;
  return typeof value === "string" && value ? value : null;
}

function pickExpiry(payload: Record<string, any> | null | undefined): string | null {
  if (!payload) return null;
  const explicit = payload["autologin_expires_at"] ?? payload["auto_login_expires_at"] ?? null;
  if (typeof explicit === "string" && explicit) return explicit;
  const seconds = Number(payload["autologin_expires_in"] ?? payload["expires_in"] ?? 0);
  if (seconds > 0) return new Date(Date.now() + seconds * 1000).toISOString();
  return null;
}

function isFresh(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return false;
  return ts - SAFETY_WINDOW_MS > Date.now();
}

/** Constrói a URL de autologin a partir de um token quando a API só devolve o token. */
function buildFromToken(baseLoginUrl: string | null, token: string | null): string | null {
  if (!token) return null;
  const base = baseLoginUrl && /^https?:\/\//i.test(baseLoginUrl) ? baseLoginUrl : null;
  if (!base) return null;
  try {
    const origin = new URL(base).origin;
    return `${origin}/auth/autologin?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

/**
 * Devolve o melhor destino de acesso à Fidelize para um aluno, com auditoria.
 */
export async function getFidelizeAccessTarget(userId: string): Promise<FidelizeAccessTarget> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data } = await supabaseAdmin
    .from("fidelize_provisioning_logs")
    .select("id, plan, login_url, request_payload, response_payload, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = (data || null) as Record<string, any> | null;
  if (!row) {
    return {
      success: false,
      url: null,
      method: "none",
      expiresAt: null,
      message: "Nenhuma conta Fidelize encontrada para o seu cadastro.",
    };
  }

  const response = (row["response_payload"] || {}) as Record<string, any>;
  const request = (row["request_payload"] || {}) as Record<string, any>;
  const loginUrl = (row["login_url"] as string) || (response["login_url"] as string) || null;
  const email = (request["email"] as string) || (response["login"] as string) || null;

  // 1. Autologin devolvido no provisionamento (só vale enquanto o token não expirar).
  const provisionedExpiry = pickExpiry(response);
  const provisionedUrl = pickUrl(response) ?? buildFromToken(loginUrl, pickToken(response));
  if (provisionedUrl && isFresh(provisionedExpiry)) {
    await auditAccess(userId, row, "autologin", provisionedExpiry);
    return {
      success: true,
      url: provisionedUrl,
      method: "autologin",
      expiresAt: provisionedExpiry,
      message: null,
    };
  }

  // 2. Magic link — gera um novo token de acesso automático.
  if (email) {
    const config = await getFidelizeConfig();
    if (config) {
      const path = resolveFidelizePath(config.baseUrl, "/magic-link");
      const call = await fidelizeRequest<any>(path, {
        method: "POST",
        body: { email, source: "ronnei" },
        config,
        context: { operation: "magic_link", userId },
      });

      const payload = (call.data || {}) as Record<string, any>;
      const magicUrl = pickUrl(payload) ?? buildFromToken(loginUrl, pickToken(payload));
      if (call.success && magicUrl) {
        const expiresAt = pickExpiry(payload);
        await auditAccess(userId, row, "magic-link", expiresAt);
        return { success: true, url: magicUrl, method: "magic-link", expiresAt, message: null };
      }

      await logSystemEvent({
        level: "warning",
        source: "fidelize",
        message: "Magic link da Fidelize indisponível — usando login tradicional.",
        details: { httpCode: call.httpCode, error: call.error, endpoint: path },
        userId,
      });
    }
  }

  // 3. Login tradicional.
  if (loginUrl) {
    await auditAccess(userId, row, "login", null);
    return {
      success: true,
      url: loginUrl,
      method: "login",
      expiresAt: null,
      message: "Abrimos a tela de login da Fidelize — o acesso automático não está disponível agora.",
    };
  }

  return {
    success: false,
    url: null,
    method: "none",
    expiresAt: null,
    message: "Ainda não temos um link de acesso à Fidelize para a sua conta.",
  };
}

async function auditAccess(
  userId: string,
  row: Record<string, any>,
  method: FidelizeAccessTarget["method"],
  expiresAt: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await supabaseAdmin.from("admin_audit_log").insert({
      action: `fidelize_access_${method.replace("-", "_")}`,
      target_user_id: userId,
      actor_id: userId,
      product_type: "fidelize",
      product_id: (row["plan"] as string) ?? null,
      product_name: "Fidelize",
      reason: "Acesso à Fidelize a partir da área de membros (login único).",
      details: { method, provisioning_log_id: row["id"], expires_at: expiresAt } as never,
    } as never);
  } catch {
    /* auditoria é best-effort */
  }

  await logSystemEvent({
    level: "info",
    source: "fidelize",
    message: `Acesso à Fidelize via ${method}.`,
    details: { method, provisioningLogId: row["id"], expiresAt },
    userId,
  });
}
