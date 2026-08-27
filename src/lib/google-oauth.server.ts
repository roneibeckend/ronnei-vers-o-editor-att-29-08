// Integração oficial com o Google (OAuth próprio da plataforma).
// Guarda o refresh token da conta principal criptografado e renova o access
// token sob demanda. Server-only: nunca importar em código de cliente.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
] as const;

export const GOOGLE_CALLBACK_PATH = "/api/public/google/oauth/callback";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/** Cache do access token em memória do worker (curto, revalidado sempre). */
let accessTokenCache: { token: string; expiresAt: number } | null = null;

/** Cache do client OAuth (id/secret) guardado no banco pelo painel admin. */
let clientCache: { clientId: string; clientSecret: string } | null = null;

/** Lê o client OAuth do banco (cadastro no admin) com fallback para os secrets. */
async function loadClient(): Promise<{ clientId: string; clientSecret: string } | null> {
  if (clientCache) return clientCache;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("google_oauth_client")
      .select("client_id, client_secret_ciphertext")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.client_id && data?.client_secret_ciphertext) {
      clientCache = {
        clientId: data.client_id,
        clientSecret: decryptToken(data.client_secret_ciphertext),
      };
      return clientCache;
    }
  } catch (err) {
    console.warn("[google] falha ao carregar client OAuth do banco:", err);
  }

  const envId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const envSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  if (envId && envSecret) {
    clientCache = { clientId: envId, clientSecret: envSecret };
    return clientCache;
  }

  return null;
}

export function invalidateGoogleClientCache() {
  clientCache = null;
  accessTokenCache = null;
}

export async function googleClientConfigured(): Promise<boolean> {
  return Boolean(await loadClient());
}

/** Client ID/Secret ou erro legível quando ainda não foram cadastrados. */
async function requireClient() {
  const client = await loadClient();
  if (!client) {
    throw new Error(
      "Credenciais OAuth do Google não cadastradas. Informe o Client ID e o Client Secret em Admin → Integrações → Google.",
    );
  }
  return client;
}

/** Cadastra/atualiza o client OAuth (Client Secret guardado criptografado). */
export async function saveGoogleClient(input: { clientId: string; clientSecret: string; userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const ciphertext = encryptToken(input.clientSecret.trim());
  const { data: existing } = await supabaseAdmin
    .from("google_oauth_client")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    client_id: input.clientId.trim(),
    client_secret_ciphertext: ciphertext,
    updated_by: input.userId,
  };

  const { error } = existing?.id
    ? await supabaseAdmin.from("google_oauth_client").update(payload).eq("id", existing.id)
    : await supabaseAdmin.from("google_oauth_client").insert(payload);

  if (error) throw new Error(`Falha ao salvar as credenciais: ${error.message}`);

  invalidateGoogleClientCache();
  await logGoogleCall({ action: "oauth.client_saved", status: "success" });
  return { saved: true };
}

/** Client ID mascarado para exibir no painel (nunca expõe o secret). */
export async function getGoogleClientSummary() {
  const client = await loadClient();
  if (!client) return { configured: false as const, clientIdMasked: null as string | null };
  const id = client.clientId;
  return {
    configured: true as const,
    clientIdMasked: id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-14)}` : id,
  };
}


function encKey(): Buffer {
  const raw = process.env["GOOGLE_TOKEN_ENC_KEY"];
  if (!raw) throw new Error("GOOGLE_TOKEN_ENC_KEY não configurado.");
  // Deriva 32 bytes estáveis a partir do secret (aceita qualquer formato).
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Registra a chamada ao Google para auditoria/diagnóstico. */
export async function logGoogleCall(entry: {
  action: string;
  status: "success" | "error";
  httpStatus?: number | null;
  durationMs?: number | null;
  error?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("google_api_logs").insert({
      action: entry.action.slice(0, 80),
      status: entry.status,
      http_status: entry.httpStatus ?? null,
      duration_ms: entry.durationMs ?? null,
      error: entry.error ? String(entry.error).slice(0, 1000) : null,
      details: (entry.details ?? {}) as never,
    });
  } catch (err) {
    console.warn("[google] falha ao gravar log:", err);
  }
}

export function buildRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}${GOOGLE_CALLBACK_PATH}`;
}

/** Cria o state de uso único e devolve a URL de consentimento do Google. */
export async function createConsentUrl(origin: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const state = randomBytes(24).toString("hex");
  const redirectUri = buildRedirectUri(origin);

  const { error } = await supabaseAdmin.from("google_oauth_states").insert({
    state,
    created_by: userId,
    redirect_uri: redirectUri,
  });
  if (error) throw new Error(`Falha ao preparar a conexão: ${error.message}`);

  const client = await requireClient();
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state,
  });

  return { url: `${AUTH_URL}?${params.toString()}`, redirectUri };
}

/** Valida e consome o state recebido no callback. */
export async function consumeState(state: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("google_oauth_states")
    .select("state, redirect_uri, used_at, expires_at, created_by")
    .eq("state", state)
    .maybeSingle();

  if (!data) throw new Error("Solicitação de conexão inválida.");
  if (data.used_at) throw new Error("Esta solicitação de conexão já foi utilizada.");
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("A solicitação de conexão expirou. Tente novamente.");
  }

  await supabaseAdmin
    .from("google_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state);

  return data;
}

/** Troca o código de autorização pelo refresh token e salva as credenciais. */
export async function exchangeCodeAndStore(code: string, redirectUri: string, userId: string | null) {
  const started = Date.now();
  const client = await requireClient();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    await logGoogleCall({
      action: "oauth.exchange",
      status: "error",
      httpStatus: res.status,
      durationMs: Date.now() - started,
      error: payload?.error_description || payload?.error || "Falha na troca do código",
    });
    throw new Error(payload?.error_description || payload?.error || "Falha na autorização do Google.");
  }

  if (!payload.refresh_token) {
    throw new Error(
      "O Google não devolveu refresh token. Remova o acesso do app na conta Google e conecte novamente.",
    );
  }

  // Identifica a conta conectada
  let email: string | null = null;
  let name: string | null = null;
  try {
    const infoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${payload.access_token}` },
    });
    if (infoRes.ok) {
      const info: any = await infoRes.json();
      email = info?.email ?? null;
      name = info?.name ?? null;
    }
  } catch {
    // identificação é opcional
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("google_credentials").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const { error } = await supabaseAdmin.from("google_credentials").insert({
    account_email: email,
    account_name: name,
    refresh_token_ciphertext: encryptToken(payload.refresh_token),
    scopes: String(payload.scope ?? "").split(" ").filter(Boolean),
    status: "connected",
    last_refresh_at: new Date().toISOString(),
    connected_by: userId,
  });
  if (error) throw new Error(`Falha ao salvar as credenciais: ${error.message}`);

  accessTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(0, (Number(payload.expires_in) || 3600) - 300) * 1000,
  };

  await logGoogleCall({
    action: "oauth.exchange",
    status: "success",
    httpStatus: res.status,
    durationMs: Date.now() - started,
    details: { email },
  });

  return { email, name };
}

async function loadCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("google_credentials")
    .select("id, account_email, account_name, refresh_token_ciphertext, scopes, status, last_refresh_at, last_error, updated_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function markCredentialError(id: string, message: string, revoked: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("google_credentials")
    .update({ last_error: message.slice(0, 1000), status: revoked ? "revoked" : "error" })
    .eq("id", id);

  if (revoked) {
    try {
      const { raiseOpsAlert } = await import("@/lib/ops-alerts.server");
      await raiseOpsAlert({
        type: "google_oauth",
        dedupKey: "google:refresh_revoked",
        title: "Integração Google desconectada",
        message:
          "O acesso da conta Google foi revogado ou expirou. Reconecte em Admin → Integrações → Google para voltar a criar eventos e links do Meet.",
        severity: "critical",
        details: { error: message },
      });
    } catch (err) {
      console.warn("[google] falha ao emitir alerta:", err);
    }
  }
}

/** Access token válido da conta conectada (renovado automaticamente). */
export async function getGoogleAccessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token;

  const creds = await loadCredentials();
  if (!creds) throw new Error("Nenhuma conta Google conectada.");

  const started = Date.now();
  const client = await requireClient();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: decryptToken(creds.refresh_token_ciphertext),
      grant_type: "refresh_token",
    }),
  });

  const payload: any = await res.json().catch(() => ({}));

  if (!res.ok || !payload.access_token) {
    const message = payload?.error_description || payload?.error || `HTTP ${res.status}`;
    const revoked = payload?.error === "invalid_grant";
    await markCredentialError(creds.id, message, revoked);
    await logGoogleCall({
      action: "oauth.refresh",
      status: "error",
      httpStatus: res.status,
      durationMs: Date.now() - started,
      error: message,
    });
    throw new Error(
      revoked
        ? "O acesso da conta Google foi revogado. Reconecte a conta em Integrações → Google."
        : `Falha ao renovar o acesso do Google: ${message}`,
    );
  }

  accessTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(0, (Number(payload.expires_in) || 3600) - 300) * 1000,
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("google_credentials")
    .update({ last_refresh_at: new Date().toISOString(), status: "connected", last_error: null })
    .eq("id", creds.id);

  await logGoogleCall({
    action: "oauth.refresh",
    status: "success",
    httpStatus: res.status,
    durationMs: Date.now() - started,
  });

  return payload.access_token;
}

/** Chamada autenticada a qualquer API do Google, com log e erro legível. */
export async function googleFetch<T = any>(
  action: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getGoogleAccessToken();
  const started = Date.now();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const duration = Date.now() - started;

  if (!res.ok) {
    let message = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || message;
    } catch {
      // resposta não-JSON
    }
    await logGoogleCall({
      action,
      status: "error",
      httpStatus: res.status,
      durationMs: duration,
      error: message,
      details: { url: url.split("?")[0] },
    });
    throw new Error(`Google (${res.status}): ${message}`);
  }

  await logGoogleCall({
    action,
    status: "success",
    httpStatus: res.status,
    durationMs: duration,
    details: { url: url.split("?")[0] },
  });

  return (text ? JSON.parse(text) : {}) as T;
}

export type GoogleConnectionStatus = {
  clientConfigured: boolean;
  connected: boolean;
  accountEmail: string | null;
  accountName: string | null;
  scopes: string[];
  status: string | null;
  lastRefreshAt: string | null;
  lastError: string | null;
  hasCalendarScope: boolean;
  hasDriveScope: boolean;
};

export async function getConnectionStatus(): Promise<GoogleConnectionStatus> {
  const creds = await loadCredentials();
  const scopes = (creds?.scopes ?? []) as string[];
  return {
    clientConfigured: await googleClientConfigured(),
    connected: Boolean(creds),
    accountEmail: creds?.account_email ?? null,
    accountName: creds?.account_name ?? null,
    scopes,
    status: creds?.status ?? null,
    lastRefreshAt: creds?.last_refresh_at ?? null,
    lastError: creds?.last_error ?? null,
    hasCalendarScope: scopes.some((s) => s.includes("/auth/calendar")),
    hasDriveScope: scopes.some((s) => s.includes("/auth/drive")),
  };
}

export async function disconnectGoogle() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const creds = await loadCredentials();

  if (creds) {
    try {
      const refresh = decryptToken(creds.refresh_token_ciphertext);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, {
        method: "POST",
      });
    } catch (err) {
      console.warn("[google] falha ao revogar token no Google:", err);
    }
    await supabaseAdmin.from("google_credentials").delete().eq("id", creds.id);
  }

  accessTokenCache = null;
  await logGoogleCall({ action: "oauth.disconnect", status: "success" });
  return { disconnected: true };
}
