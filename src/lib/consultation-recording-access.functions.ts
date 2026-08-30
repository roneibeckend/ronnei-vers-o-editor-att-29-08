import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Registra o aceite dos termos (direitos autorais, confidencialidade e LGPD)
 * antes de liberar a gravação da consultoria — mesmo modelo usado no download
 * de e-books. Sem aceite, a URL da gravação não é devolvida.
 */
export const acceptConsultationRecordingTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        consultationId: z.string().uuid(),
        accepted: z.boolean(),
        userAgent: z.string().max(400).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.accepted) {
      return {
        allowed: false as const,
        reason: "terms_not_accepted",
        message: "É necessário aceitar os termos para acessar a gravação.",
        recordingUrl: null,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("id, user_id, product_title, recording_url, client_email")
      .eq("id", data.consultationId)
      .maybeSingle();

    if (!row || (row as any).user_id !== context.userId) {
      return {
        allowed: false as const,
        reason: "not_found",
        message: "Gravação não encontrada para a sua conta.",
        recordingUrl: null,
      };
    }

    const recordingUrl = (row as any).recording_url as string | null;
    if (!recordingUrl) {
      return {
        allowed: false as const,
        reason: "no_recording",
        message: "Esta consultoria ainda não tem gravação disponível.",
        recordingUrl: null,
      };
    }

    await auditConsultation({
      consultationId: (row as any).id,
      actorId: context.userId,
      actorRole: "student",
      action: "recording_terms_accepted",
      details: {
        acceptedAt: new Date().toISOString(),
        userAgent: data.userAgent ?? null,
        email: (row as any).client_email ?? (context.claims as any)?.email ?? null,
      },
    });

    return { allowed: true as const, recordingUrl, message: null, reason: null };
  });
