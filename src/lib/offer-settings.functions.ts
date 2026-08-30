import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Configuração do popup de ofertas (upsell).
 *
 * A tabela `integrations` só é legível por administradores, então o aluno
 * comum nunca conseguia ler `offer_settings` e o upsell era ignorado. Aqui
 * devolvemos APENAS essa configuração (status + textos/desconto), nada mais.
 */
export const getOfferSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integrations")
      .select("status, settings")
      .eq("category", "offer_settings")
      .maybeSingle();

    return {
      status: Boolean((data as any)?.status ?? false),
      settings:
        (data as any)?.settings && typeof (data as any).settings === "object"
          ? ((data as any).settings as Record<string, any>)
          : {},
    };
  });
