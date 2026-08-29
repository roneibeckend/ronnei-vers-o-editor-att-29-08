// Webhook de ciclo de vida da Fidelize → Ronnei.
// A Fidelize chama este endpoint quando uma conta com origem "ronnei" faz
// upgrade, downgrade ou cancelamento diretamente na plataforma dela.
//
// Autenticação: header `x-api-key` (mesma chave da integração) ou
// `Authorization: Bearer <FIDELIZE_WEBHOOK_SECRET>`.

import { createFileRoute } from "@tanstack/react-router";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isAuthorized(request: Request) {
  const provided =
    request.headers.get("x-api-key") ||
    request.headers.get("x-webhook-secret") ||
    (request.headers.get("Authorization")?.startsWith("Bearer ")
      ? request.headers.get("Authorization")!.slice(7)
      : null);

  if (!provided) return false;

  const secret = process.env["FIDELIZE_WEBHOOK_SECRET"];
  if (secret && timingSafeEqual(provided, secret)) return true;

  const { getFidelizeConfig } = await import("@/lib/fidelize.server");
  const config = await getFidelizeConfig();
  return Boolean(config?.apiKey && timingSafeEqual(provided, config.apiKey));
}

export const Route = createFileRoute("/api/public/webhooks/fidelize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) {
          return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, error: "JSON inválido." }, { status: 400 });
        }

        const { parseLifecyclePayload, handleFidelizeLifecycleEvent } = await import(
          "@/lib/fidelize-lifecycle.server"
        );
        const payload = parseLifecyclePayload(body);

        try {
          const result = await handleFidelizeLifecycleEvent(payload);
          return Response.json(result, { status: result.status ?? 200 });
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
