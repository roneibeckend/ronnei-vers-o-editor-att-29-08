/**
 * Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) implementado apenas com WebCrypto,
 * compatível com o runtime serverless (Cloudflare Workers). Não usa a lib `web-push`,
 * que depende de APIs exclusivas do Node.
 */

const encoder = new TextEncoder();

function b64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToB64url(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

function vapidJwk(privateKeyB64: string, publicKeyB64: string): JsonWebKey {
  const pub = b64urlToBytes(publicKeyB64);
  return {
    kty: "EC",
    crv: "P-256",
    d: privateKeyB64,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
}

/** Monta o header `Authorization: vapid t=<jwt>, k=<publicKey>`. */
async function vapidAuthHeader(audience: string): Promise<string> {
  const publicKey = process.env["VAPID_PUBLIC_KEY"]!;
  const privateKey = process.env["VAPID_PRIVATE_KEY"]!;
  const subject = process.env["VAPID_SUBJECT"] || "mailto:contato@ronneinaveia.com.br";

  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );

  const key = await crypto.subtle.importKey(
    "jwk",
    vapidJwk(privateKey, publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      encoder.encode(`${header}.${payload}`) as BufferSource,
    ),
  );

  return `vapid t=${header}.${payload}.${bytesToB64url(signature)}, k=${publicKey}`;
}

/** Criptografa o payload no formato aes128gcm (registro único). */
async function encryptPayload(
  payload: string,
  clientPublicKeyB64: string,
  authSecretB64: string,
): Promise<Uint8Array> {
  const clientPublicKey = b64urlToBytes(clientPublicKeyB64);
  const authSecret = b64urlToBytes(authSecretB64);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const localKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const localPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", localKeys.publicKey));

  const importedClientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: importedClientKey }, localKeys.privateKey, 256),
  );

  const prk = await hkdf(
    authSecret,
    sharedSecret,
    concat(encoder.encode("WebPush: info\0"), clientPublicKey, localPublicKey),
    32,
  );

  const cek = await hkdf(salt, prk, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  );

  const recordSize = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, recordSize, new Uint8Array([localPublicKey.length]), localPublicKey, ciphertext);
}

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushResult = { ok: true } | { ok: false; status?: number; error: string; expired?: boolean };

/** Envia um push para um dispositivo. Nunca lança: sempre retorna o resultado. */
export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  payload: Record<string, unknown>,
  ttlSeconds = 60 * 60 * 12,
): Promise<PushResult> {
  if (!process.env["VAPID_PUBLIC_KEY"] || !process.env["VAPID_PRIVATE_KEY"]) {
    return { ok: false, error: "Chaves VAPID não configuradas" };
  }

  try {
    const url = new URL(subscription.endpoint);
    const body = await encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth);
    const authorization = await vapidAuthHeader(url.origin);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "high",
      },
      body: body as BodyInit,
    });

    if (response.ok) return { ok: true };

    const text = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      error: text || `HTTP ${response.status}`,
      expired: response.status === 404 || response.status === 410,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Falha desconhecida no envio do push" };
  }
}

export function getVapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] || null;
}
