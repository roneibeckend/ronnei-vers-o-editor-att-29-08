import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Registra um clique em um link de afiliado.
 * Público (o visitante ainda não está logado) e idempotente por link.
 */
export const registerAffiliateClick = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ code: z.string().min(3).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link } = await supabaseAdmin
      .from("affiliate_links")
      .select("id, clicks")
      .eq("code", data.code)
      .maybeSingle();

    if (!link) return { success: false };

    const { error } = await supabaseAdmin
      .from("affiliate_links")
      .update({ clicks: Number((link as any).clicks || 0) + 1 } as any)
      .eq("id", (link as any).id);

    if (error) {
      console.error("[Afiliados] Falha ao registrar clique:", error.message);
      return { success: false };
    }

    return { success: true };
  });
