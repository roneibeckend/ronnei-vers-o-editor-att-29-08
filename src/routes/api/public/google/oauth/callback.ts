import { createFileRoute } from "@tanstack/react-router";

/**
 * Retorno do consentimento OAuth do Google.
 * Rota pública apenas porque o Google precisa alcançá-la; a segurança vem do
 * parâmetro `state` de uso único gerado pelo painel administrativo.
 */
export const Route = createFileRoute("/api/public/google/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        const redirectTo = (params: Record<string, string>) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: `/admin/integracoes?tab=google&${new URLSearchParams(params).toString()}`,
              "Cache-Control": "no-store",
            },
          });

        if (oauthError) {
          return redirectTo({ google: "error", message: oauthError.slice(0, 200) });
        }
        if (!code || !state) {
          return redirectTo({ google: "error", message: "Retorno inválido do Google." });
        }

        try {
          const { consumeState, exchangeCodeAndStore } = await import("@/lib/google-oauth.server");
          const stateRow = await consumeState(state);
          const result = await exchangeCodeAndStore(code, stateRow.redirect_uri, stateRow.created_by ?? null);
          return redirectTo({ google: "connected", email: result.email ?? "" });
        } catch (err: any) {
          return redirectTo({
            google: "error",
            message: String(err?.message ?? "Falha ao conectar a conta Google.").slice(0, 300),
          });
        }
      },
    },
  },
});
