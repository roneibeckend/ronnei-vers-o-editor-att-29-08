// Webhook de ciclo de vida da Fidelize → Ronnei.
// A Fidelize chama este endpoint quando uma conta com origem "ronnei" faz
// upgrade, downgrade ou cancelamento diretamente na plataforma dela.
//
// PADRÃO OFICIAL DE AUTENTICAÇÃO (acordado com a Fidelize):
//   Header: x-fidelize-signature: sha256=<HMAC_SHA256(corpo_bruto, FIDELIZE_WEBHOOK_SECRET)>
//   (aceitamos também o hex/base64 puro, sem o prefixo "sha256=")
//
// COMPATIBILIDADE (legado, mantida temporariamente para não quebrar produção):
//   x-api-key / x-webhook-secret / Authorization: Bearer <FIDELIZE_WEBHOOK_SECRET | apiKey>

import { createFileRoute } from "@tanstack/react-router";

function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function hmacSha256(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
}

/** Valida a assinatura HMAC enviada pela Fidelize (padrão oficial). */
async function isValidSignature(rawBody: string, header: string, secrets: string[]) {
  const provided = header.trim().replace(/^sha256=/i, "").trim();
  if (!provided) return false;

  for (const secret of secrets) {
    if (!secret) continue;
    const digest = await hmacSha256(secret, rawBody);
    if (
      timingSafeEqualStr(provided.toLowerCase(), toHex(digest)) ||
      timingSafeEqualStr(provided, toBase64(digest))
    ) {
      return true;
    }
  }
  return false;
}

/** Autenticação legada por chave compartilhada em header. */
function legacyToken(request: Request) {
  const auth = request.headers.get("Authorization");
  return (
    request.headers.get("x-api-key") ||
    request.headers.get("x-webhook-secret") ||
    (auth?.startsWith("Bearer ") ? auth.slice(7) : null)
  );
}

async function authorize(request: Request, rawBody: string) {
  const webhookSecret = process.env["FIDELIZE_WEBHOOK_SECRET"] || "";

  let apiKey = "";
  try {
    const { getFidelizeConfig } = await import("@/lib/fidelize.server");
    apiKey = (await getFidelizeConfig())?.apiKey || "";
  } catch {
    /* config indisponível — segue apenas com o secret de ambiente */
  }

  const secrets = [webhookSecret, apiKey].filter(Boolean);
  if (!secrets.length) {
    return { ok: false as const, reason: "Webhook não configurado (segredo ausente)." };
  }

  const signature =
    request.headers.get("x-fidelize-signature") ||
    request.headers.get("x-signature") ||
    request.headers.get("x-hub-signature-256");

  if (signature) {
    const valid = await isValidSignature(rawBody, signature, secrets);
    return valid
      ? { ok: true as const, method: "hmac" as const }
      : { ok: false as const, reason: "Assinatura HMAC inválida." };
  }

  const token = legacyToken(request);
  if (token && secrets.some((s) => timingSafeEqualStr(token, s))) {
    return { ok: true as const, method: "shared-key" as const };
  }

  return { ok: false as const, reason: "Credenciais do webhook ausentes ou inválidas." };
}

export const Route = createFileRoute("/api/public/webhooks/fidelize")({
  server: {
    handlers: {
      // Permite à Fidelize validar a URL/o método antes de ativar em produção.
      GET: async () =>
        Response.json({
          ok: true,
          endpoint: "fidelize-lifecycle-webhook",
          method: "POST",
          auth: {
            standard: "x-fidelize-signature: sha256=<HMAC_SHA256(raw_body, shared_secret)>",
            encodings: ["hex", "base64"],
            legacy: ["x-api-key", "Authorization: Bearer <secret>"],
          },
          events: ["upgrade", "downgrade", "cancellation"],
        }),

      POST: async ({ request }) => {
        // O corpo bruto é obrigatório para conferir a assinatura HMAC.
        const rawBody = await request.text();

        const auth = await authorize(request, rawBody);
        if (!auth.ok) {
          try {
            const { logSystemEvent } = await import("@/lib/system-log.server");
            await logSystemEvent({
              level: "warning",
              source: "fidelize",
              message: `Webhook Fidelize rejeitado: ${auth.reason}`,
              details: {
                hasSignature: Boolean(request.headers.get("x-fidelize-signature")),
                hasApiKey: Boolean(request.headers.get("x-api-key")),
              },
            });
          } catch {
            /* log é best-effort */
          }
          return Response.json({ ok: false, error: auth.reason }, { status: 401 });
        }

        let body: Record<string, unknown>;
        try {
          body = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, error: "JSON inválido." }, { status: 400 });
        }

        const { parseLifecyclePayload, handleFidelizeLifecycleEvent } = await import(
          "@/lib/fidelize-lifecycle.server"
        );
        const payload = parseLifecyclePayload(body);

        try {
          const result = await handleFidelizeLifecycleEvent(payload);
          return Response.json({ ...result, auth: auth.method }, { status: result.status ?? 200 });
        } catch (err) {
          const { logSystemEvent } = await import("@/lib/system-log.server");
          await logSystemEvent({
            level: "error",
            source: "fidelize",
            message: `Falha ao processar webhook de ciclo de vida da Fidelize: ${(err as Error)?.message}`,
            details: { payload: payload.raw as never },
          });
          return Response.json({ ok: false, error: "Falha ao processar o evento." }, { status: 500 });
        }
      },
    },
  },
});
