import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { briefingSchema, formatBriefingText } from "@/lib/consultation-briefing";

/** Catálogo público de consultorias (publicadas e "em breve"). */
export const listConsultationProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("consultation_products")
    .select(
      "id, title, subtitle, description, cover_url, duration_minutes, price, status, briefing_required, sort_order",
    )
    .in("status", ["active", "coming_soon"])
    .order("sort_order", { ascending: true });
  return data ?? [];
});

/** Horários livres para uma duração específica. */
export const getConsultationSlots = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ durationMinutes: z.number().int().min(15).max(480) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { computeAvailableSlots } = await import("@/lib/consultations.server");
    return computeAvailableSlots(data.durationMinutes);
  });

/** Agenda uma consultoria, cria o evento no Calendar com Meet e envia a confirmação. */
export const bookConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        productId: z.string().min(1),
        startIso: z.string().min(10),
        briefingData: briefingSchema.optional(),
        phone: z.string().trim().max(30).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      isSlotFree,
      attachGoogleMeeting,
      sendConsultationConfirmation,
      auditConsultation,
      CONSULTATION_TZ,
      MIN_LEAD_MINUTES,
    } = await import("@/lib/consultations.server");

    const { data: product } = await supabaseAdmin
      .from("consultation_products")
      .select("*")
      .eq("id", data.productId)
      .maybeSingle();

    if (!product) throw new Error("Consultoria não encontrada.");
    if (product.status !== "active") throw new Error("Esta consultoria ainda não está disponível para agendamento.");

    const briefing = data.briefingData ? formatBriefingText(data.briefingData) : "";
    if (product.briefing_required && !data.briefingData) {
      throw new Error("Preencha o briefing antes de agendar.");
    }

    const start = new Date(data.startIso);
    if (Number.isNaN(+start)) throw new Error("Horário inválido.");
    if (+start < Date.now() + MIN_LEAD_MINUTES * 60_000) {
      throw new Error("Escolha um horário com pelo menos 2 horas de antecedência.");
    }
    const end = new Date(+start + product.duration_minutes * 60_000);

    if (!(await isSlotFree(start.toISOString(), end.toISOString()))) {
      throw new Error("Este horário acabou de ser reservado. Escolha outro.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, phone")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: created, error } = await supabaseAdmin
      .from("consultations")
      .insert({
        user_id: context.userId,
        product_id: product.id,
        product_title: product.title,
        client_name: profile?.name ?? null,
        client_email: profile?.email ?? (context.claims as any)?.email ?? null,
        client_phone: data.phone || (profile as any)?.phone || null,
        scheduled_at: start.toISOString(),
        ends_at: end.toISOString(),
        duration_minutes: product.duration_minutes,
        timezone: CONSULTATION_TZ,
        status: "scheduled",
        briefing: briefing || null,
        briefing_data: (data.briefingData ?? null) as never,
        briefing_submitted_at: briefing ? new Date().toISOString() : null,
        amount: product.price,
      })
      .select("*")
      .single();

    if (error) throw new Error(`Falha ao agendar: ${error.message}`);

    await auditConsultation({
      consultationId: created.id,
      actorId: context.userId,
      actorRole: "student",
      action: "booked",
      details: { productId: product.id, startIso: start.toISOString() },
    });

    const google = await attachGoogleMeeting(created as never);
    const withMeet = { ...created, meet_link: google.ok ? google.meetLink : null };
    await sendConsultationConfirmation(withMeet as never);

    return {
      id: created.id,
      meetLink: google.ok ? google.meetLink : null,
      googleError: google.ok ? null : google.error,
      scheduledAt: created.scheduled_at,
    };
  });

/** Histórico de reuniões do aluno. */
export const listMyConsultations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("consultations")
      .select(
        "id, product_title, scheduled_at, ends_at, duration_minutes, status, briefing, briefing_data, meet_link, calendar_html_link, recording_url, amount",
      )
      .eq("user_id", context.userId)
      .order("scheduled_at", { ascending: false });
    return data ?? [];
  });

/** Envia/atualiza o briefing obrigatório antes da reunião. */
export const submitConsultationBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), briefingData: briefingSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("id, user_id, status")
      .eq("id", data.id)
      .maybeSingle();

    if (!row || row.user_id !== context.userId) throw new Error("Consultoria não encontrada.");
    if (!["scheduled", "pending_payment"].includes(row.status)) {
      throw new Error("Esta consultoria já foi realizada ou cancelada.");
    }

    const { error } = await supabaseAdmin
      .from("consultations")
      .update({
        briefing: formatBriefingText(data.briefingData),
        briefing_data: data.briefingData as never,
        briefing_submitted_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(`Falha ao salvar briefing: ${error.message}`);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "student",
      action: "briefing_submitted",
      details: { structured: true },
    });

    return { saved: true };
  });

/** Aluno cancela a própria reunião (respeitando 12h de antecedência). */
export const cancelMyConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, cancelGoogleMeeting } = await import("@/lib/consultations.server");

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (!row || row.user_id !== context.userId) throw new Error("Consultoria não encontrada.");
    if (row.status !== "scheduled") throw new Error("Esta consultoria não pode ser cancelada.");
    if (+new Date(row.scheduled_at) - Date.now() < 12 * 3600_000) {
      throw new Error("Cancelamentos só podem ser feitos com 12 horas de antecedência. Fale com o suporte.");
    }

    await cancelGoogleMeeting(row as never);
    await supabaseAdmin
      .from("consultations")
      .update({ status: "cancelled", cancel_reason: data.reason || "Cancelado pelo aluno" })
      .eq("id", data.id);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "student",
      action: "cancelled",
      details: { reason: data.reason ?? null },
    });

    return { cancelled: true };
  });
