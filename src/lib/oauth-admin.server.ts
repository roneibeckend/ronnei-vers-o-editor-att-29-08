// Server-only helpers for managing Supabase Auth OAuth providers
// through the Supabase Management API (https://api.supabase.com).
// Requires the SB_MANAGEMENT_TOKEN secret (Personal Access Token).

export type ProviderKey =
  | 'google'
  | 'facebook'
  | 'apple'
  | 'github'
  | 'azure'
  | 'linkedin_oidc'
  | 'discord'
  | 'twitter';

export const PROVIDER_KEYS: ProviderKey[] = [
  'google',
  'facebook',
  'apple',
  'github',
  'azure',
  'linkedin_oidc',
  'discord',
  'twitter',
];

export interface AuthConfig {
  [key: string]: unknown;
}

function getProjectRef(): string {
  const explicit = process.env['SUPABASE_PROJECT_ID'];
  if (explicit) return explicit;
  const url = process.env['SUPABASE_URL'] ?? '';
  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\./i);
  if (!match?.[1]) throw new Error('Não foi possível determinar o project ref do Supabase.');
  return match[1];
}

function getToken(): string {
  const token = process.env['SB_MANAGEMENT_TOKEN'];
  if (!token) {
    throw new Error(
      'Token de gerenciamento do Supabase ausente. Salve o secret SB_MANAGEMENT_TOKEN para habilitar o controle automático dos provedores.',
    );
  }
  return token;
}

export function managementTokenConfigured(): boolean {
  return Boolean(process.env['SB_MANAGEMENT_TOKEN']);
}

export function callbackUrl(): string {
  const url = (process.env['SUPABASE_URL'] ?? '').replace(/\/$/, '');
  return `${url}/auth/v1/callback`;
}

async function managementRequest(method: 'GET' | 'PATCH', body?: unknown): Promise<AuthConfig> {
  const ref = getProjectRef();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      detail = parsed.message ?? text;
    } catch {
      /* keep raw text */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Token de gerenciamento sem permissão para ${method === 'PATCH' ? 'alterar' : 'ler'} a configuração de Auth (${res.status}). ${detail}`.slice(0, 500),
      );
    }
    throw new Error(`Supabase Management API respondeu ${res.status}: ${detail.slice(0, 300)}`);
  }

  return text ? (JSON.parse(text) as AuthConfig) : {};
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  return managementRequest('GET');
}

export async function patchAuthConfig(patch: Record<string, unknown>): Promise<AuthConfig> {
  return managementRequest('PATCH', patch);
}

// ---------- Apple client secret (JWT ES256) ----------

function base64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export interface AppleSecretInput {
  teamId: string;
  keyId: string;
  serviceId: string;
  privateKey: string;
}

/** Generates the Apple client secret JWT (valid for ~6 months, Apple's maximum). */
export async function generateAppleClientSecret(input: AppleSecretInput): Promise<{ secret: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 180; // 180 days

  const header = { alg: 'ES256', kid: input.keyId, typ: 'JWT' };
  const payload = {
    iss: input.teamId,
    iat: now,
    exp,
    aud: 'https://appleid.apple.com',
    sub: input.serviceId,
  };

  const encoder = new TextEncoder();
  const signingInput = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(
    encoder.encode(JSON.stringify(payload)),
  )}`;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(input.privateKey) as unknown as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new Error('Private Key da Apple inválida. Envie o conteúdo completo do arquivo .p8 (formato PKCS#8).');
  }

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput) as unknown as ArrayBuffer,
  );

  return {
    secret: `${signingInput}.${base64url(new Uint8Array(signature))}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

// ---------- Live connection tests ----------

export async function testFacebookCredentials(appId: string, appSecret: string) {
  const res = await fetch(
    `https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(
      appSecret,
    )}&grant_type=client_credentials`,
  );
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    return { success: false, httpCode: res.status, message: body?.error?.message ?? 'Credenciais recusadas pelo Facebook.' };
  }
  return { success: true, httpCode: res.status, message: 'App ID e App Secret válidos no Facebook Graph API.' };
}

export async function testAppleKey(input: AppleSecretInput) {
  const { secret, expiresAt } = await generateAppleClientSecret(input);
  // Apple validates the client secret on the token endpoint. An invalid_client
  // response means Team/Key/Service ID or the key itself are wrong.
  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.serviceId,
      client_secret: secret,
      grant_type: 'authorization_code',
      code: 'invalid-probe-code',
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };

  if (body?.error === 'invalid_client') {
    return {
      success: false,
      httpCode: res.status,
      message: 'Apple recusou as credenciais (invalid_client). Confira Team ID, Key ID, Service ID e a Private Key.',
      expiresAt,
    };
  }
  // invalid_grant = credentials accepted, only the probe code was rejected.
  return {
    success: true,
    httpCode: res.status,
    message: 'Credenciais aceitas pela Apple (client secret assinado com sucesso).',
    expiresAt,
  };
}

export async function testGenericProvider(clientId: string, secret: string) {
  if (!clientId || !secret) {
    return { success: false, httpCode: 0, message: 'Client ID e Secret são obrigatórios.' };
  }
  return {
    success: true,
    httpCode: 0,
    message: 'Credenciais salvas. Este provedor não possui verificação automática de credenciais.',
  };
}
