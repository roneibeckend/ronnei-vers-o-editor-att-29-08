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

/**
 * Cria a RESERVA da consultoria (status `awaiting_payment`) e gera o checkout.
 * Nada de Google Calendar/Meet, e-mail ou receita antes do pagamento aprovado.
 * O horário fica bloqueado por 30 minutos.
 */
export const reserveConsultation = createServerFn({ method: "POST" })
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
      auditConsultation,
      expireConsultationHolds,
      CONSULTATION_TZ,
      MIN_LEAD_MINUTES,
      HOLD_MINUTES,
      MAX_MINUTES_PER_DAY,
      sessionMinutes,
      studentMinutesOnDay,
    } = await import("@/lib/consultations.server");

    await expireConsultationHolds();

    const { data: product } = await supabaseAdmin
      .from("consultation_products")
      .select("*")
      .eq("id", data.productId)
      .maybeSingle();

    if (!product) throw new Error("Consultoria não encontrada.");
    if (product.status !== "active") throw new Error("Esta consultoria ainda não está disponível para agendamento.");

    const briefing = data.briefingData ? formatBriefingText(data.briefingData) : "";
    if (product.briefing_required && !data.briefingData) {
      throw new Error("Preencha o briefing antes de reservar.");
    }

    const start = new Date(data.startIso);
    if (Number.isNaN(+start)) throw new Error("Horário inválido.");
    if (+start < Date.now() + MIN_LEAD_MINUTES * 60_000) {
      throw new Error("Escolha um horário com pelo menos 2 horas de antecedência.");
    }
    // Cada encontro dura no máximo 1 hora por dia.
    const meetingMinutes = sessionMinutes(product.duration_minutes);
    const end = new Date(+start + meetingMinutes * 60_000);

    const alreadyToday = await studentMinutesOnDay(context.userId, start.toISOString());
    if (alreadyToday + meetingMinutes > MAX_MINUTES_PER_DAY) {
      throw new Error(
        `Você já tem consultoria marcada neste dia. O limite é de ${MAX_MINUTES_PER_DAY} minutos por dia — escolha outra data.`,
      );
    }

    if (!(await isSlotFree(start.toISOString(), end.toISOString()))) {
      throw new Error("Este horário acabou de ser reservado. Escolha outro.");
    }

    // Uma reserva ativa por vez: descarta reservas anteriores não pagas do aluno.
    await supabaseAdmin
      .from("consultations")
      .update({
        status: "cancelled",
        cancel_reason: "Substituída por nova reserva",
        hold_expires_at: null,
      } as never)
      .eq("user_id", context.userId)
      .eq("status", "awaiting_payment");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, phone")
      .eq("id", context.userId)
      .maybeSingle();

    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();

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
        status: "awaiting_payment",
        hold_expires_at: holdExpiresAt,
        briefing: briefing || null,
        briefing_data: (data.briefingData ?? null) as never,
        briefing_submitted_at: briefing ? new Date().toISOString() : null,
        amount: product.price,
      } as never)
      .select("*")
      .single();

    if (error) throw new Error(`Falha ao reservar: ${error.message}`);

    await auditConsultation({
      consultationId: created.id,
      actorId: context.userId,
      actorRole: "student",
      action: "reserved",
      details: { productId: product.id, startIso: start.toISOString(), holdExpiresAt },
    });

    // Checkout no Asaas vinculado à reserva
    let paymentUrl: string | null = null;
    let paymentLinkId: string | null = null;
    try {
      const { asaasFetchJson, asaasHeaders, asaasErrorMessage, getAsaasConfig, buildExternalReference } =
        await import("@/lib/asaas.server");
      const { apiKey, baseUrl } = await getAsaasConfig();

      const name = `Consultoria ${product.duration_minutes} min`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, "")
        .trim();

      const response = await asaasFetchJson(`${baseUrl}/paymentLinks`, {
        method: "POST",
        headers: asaasHeaders(apiKey),
        body: JSON.stringify({
          name: name || `Consultoria ${product.id}`,
          description: `${product.title} — reserva para ${start.toISOString()}`.slice(0, 450),
          value: Number(product.price),
          billingType: "UNDEFINED",
          chargeType: "DETACHED",
          dueDateLimitDays: 1,
          notificationEnabled: true,
          externalReference: buildExternalReference({
            productType: "consultation",
            productId: product.id,
            userId: context.userId,
            consultationId: created.id,
          }),
        }),
      });

      if (!response.ok || !response.json) throw new Error(asaasErrorMessage(response));
      paymentUrl = response.json.url as string;
      paymentLinkId = response.json.id as string;

      await supabaseAdmin
        .from("consultations")
        .update({ payment_url: paymentUrl, payment_link_id: paymentLinkId } as never)
        .eq("id", created.id);

      await auditConsultation({
        consultationId: created.id,
        actorId: context.userId,
        actorRole: "student",
        action: "checkout_created",
        details: { paymentLinkId },
      });
    } catch (err) {
      const message = (err as Error)?.message ?? "Falha ao gerar o checkout.";
      await auditConsultation({
        consultationId: created.id,
        actorId: context.userId,
        actorRole: "student",
        action: "checkout_created",
        status: "error",
        details: { error: message },
      });
      // Libera o horário na hora: sem checkout não há como pagar.
      await supabaseAdmin
        .from("consultations")
        .update({ status: "cancelled", cancel_reason: "Falha ao gerar checkout", hold_expires_at: null } as never)
        .eq("id", created.id);
      throw new Error(message);
    }

    return {
      id: created.id,
      status: "awaiting_payment" as const,
      holdExpiresAt,
      paymentUrl,
      amount: Number(product.price),
      scheduledAt: created.scheduled_at,
      durationMinutes: product.duration_minutes,
      productTitle: product.title,
    };
  });

/** Estado da reserva (usado para o contador e o polling pós-checkout). */
export const getConsultationReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { expireConsultationHolds } = await import("@/lib/consultations.server");
    await expireConsultationHolds();

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("id, user_id, status, hold_expires_at, payment_url, meet_link, scheduled_at, amount, cancel_reason")
      .eq("id", data.id)
      .maybeSingle();

    if (!row || row.user_id !== context.userId) throw new Error("Reserva não encontrada.");

    return {
      id: row.id,
      status: row.status,
      holdExpiresAt: (row as any).hold_expires_at ?? null,
      paymentUrl: (row as any).payment_url ?? null,
      meetLink: row.meet_link,
      scheduledAt: row.scheduled_at,
      amount: Number(row.amount ?? 0),
      cancelReason: (row as any).cancel_reason ?? null,
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
        "id, product_id, product_title, scheduled_at, ends_at, duration_minutes, status, hold_expires_at, payment_url, paid_at, briefing, briefing_data, meet_link, calendar_html_link, recording_url, recording_file_id, student_notes, action_plan, materials, materials_released_at, cancel_reason, completed_at, amount, created_at",
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
    if (!["scheduled", "pending_payment", "awaiting_payment"].includes(row.status)) {
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

    // Reserva não paga: pode ser descartada a qualquer momento, liberando o horário.
    if (row.status === "awaiting_payment") {
      await supabaseAdmin
        .from("consultations")
        .update({
          status: "cancelled",
          cancel_reason: data.reason || "Reserva cancelada pelo aluno",
          hold_expires_at: null,
        } as never)
        .eq("id", data.id);

      await auditConsultation({
        consultationId: data.id,
        actorId: context.userId,
        actorRole: "student",
        action: "reservation_cancelled",
      });
      return { cancelled: true };
    }

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
