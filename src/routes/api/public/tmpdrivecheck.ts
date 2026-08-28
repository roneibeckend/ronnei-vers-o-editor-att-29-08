import { createFileRoute } from "@tanstack/react-router";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — remover após validação.
export const Route = createFileRoute("/api/public/tmpdrivecheck")({
  server: {
    handlers: {
      GET: async () => {
        const out: Record<string, unknown> = {};
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("google_oauth_client")
            .select("client_id, client_secret_ciphertext")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          out.row = data ? { hasId: !!data.client_id, hasCipher: !!data.client_secret_ciphertext } : null;
          out.encKeySet = !!process.env["GOOGLE_TOKEN_ENC_KEY"];
          if (data?.client_secret_ciphertext) {
            const { decryptToken } = await import("@/lib/google-oauth.server");
            try {
              const dec = decryptToken(data.client_secret_ciphertext);
              out.decrypt = { ok: true, prefix: dec.slice(0, 4) };
            } catch (e: any) {
              out.decrypt = { ok: false, error: String(e?.message ?? e) };
            }
          }
          const { checkRecordingsFolder } = await import("@/lib/google-drive.server");
          out.folder = await checkRecordingsFolder(null, 5).catch((e: any) => ({ error: String(e?.message ?? e) }));
        } catch (err: any) {
          out.error = String(err?.message ?? err);
        }
        return Response.json(out);
      },
    },
  },
});
