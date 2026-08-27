import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  origin: z.string().url().optional(),
});

/**
 * Envia o e-mail de redefinição de senha usando o template próprio da marca
 * (Resend), em vez do e-mail padrão do Supabase.
 *
 * Nunca revela se o e-mail existe (proteção contra enumeração de contas).
 */
export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { BRAND } = await import("@/emails/layout");
      const { triggerEmailEvent } = await import("@/lib/resend.server");

      const base = (data.origin || BRAND.site).replace(/\/$/, "");
      const redirectTo = `${base}/redefinir-senha`;

      const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      // Conta inexistente: silenciosamente tratamos como sucesso.
      if (error || !link) return { ok: true };

      const resetUrl = (link as any)?.properties?.action_link as string | undefined;
      if (!resetUrl) return { ok: true };

      let name = "";
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("email", email)
          .maybeSingle();
        name = profile?.name || "";
      } catch {
        /* nome é opcional */
      }

      await triggerEmailEvent({
        event: "password_reset",
        to: email,
        data: { name: name || email.split("@")[0], reset_url: resetUrl, link: resetUrl },
      });

      return { ok: true };
    } catch (err: any) {
      console.error("[auth-recovery] falha ao enviar reset:", err?.message);
      // Não expõe detalhes internos nem existência da conta.
      return { ok: true };
    }
  });
