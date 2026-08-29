// Criptografia da API Key da Fidelize em repouso (AES-256-GCM via WebCrypto).
// A chave mestra vem do secret FIDELIZE_ENCRYPTION_KEY (server-only).

const PREFIX = "enc:v1:";

async function getKey(): Promise<CryptoKey | null> {
  const secret = process.env["FIDELIZE_ENCRYPTION_KEY"];
  if (!secret) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Criptografa um valor. Se a chave mestra não existir, devolve o texto puro. */
export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  if (!key || !plain) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  return `${PREFIX}${toBase64(iv)}:${toBase64(cipher)}`;
}

/** Descriptografa. Valores legados (texto puro) são devolvidos como estão. */
export async function decryptSecret(value: string | null | undefined): Promise<string> {
  if (!value) return "";
  if (!isEncrypted(value)) return value;
  const key = await getKey();
  if (!key) return "";
  try {
    const [, , ivB64, dataB64] = value.split(":");
    if (!ivB64 || !dataB64) return "";
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivB64) },
      key,
      fromBase64(dataB64),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return "";
  }
}

/** fk_live_xxxxxxxx1234 */
export function maskApiKey(apiKey: string | null | undefined): string {
  if (!apiKey) return "";
  const clean = apiKey.trim();
  const underscore = clean.lastIndexOf("_");
  const prefix = underscore > 0 && underscore <= 12 ? clean.slice(0, underscore + 1) : "";
  const tail = clean.slice(-4);
  return `${prefix}${"x".repeat(8)}${tail}`;
}
