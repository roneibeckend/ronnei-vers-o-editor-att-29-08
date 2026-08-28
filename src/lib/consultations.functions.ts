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

/** Horários livres para uma duração específica (sessão de até 1h). */
export const getConsultationSlots = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ durationMinutes: z.number().int().min(15).max(480) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { computeAvailableSlots } = await import("@/lib/consultations.server");
    return computeAvailableSlots(data.durationMinutes);
  });

/** Quantos encontros de 1h a consultoria contratada exige. */
export const getConsultationSessionPlan = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ durationMinutes: z.number().int().min(15).max(480) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { sessionMinutes, sessionCount, MAX_MINUTES_PER_DAY } = await import(
      "@/lib/consultations.server"
    );
    return {
      sessionMinutes: sessionMinutes(data.durationMinutes),
      sessions: sessionCount(data.durationMinutes),
      maxPerDay: MAX_MINUTES_PER_DAY,
    };
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
        startIso: z.string().min(10).optional(),
        startIsos: z.array(z.string().min(10)).min(1).max(8).optional(),
        briefingData: briefingSchema.optional(),
        phone: z.string().trim().max(30).optional(),
      })
      .refine((v) => v.startIso || v.startIsos?.length, { message: "Selecione os horários." })
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
      sessionCount,
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

    // Cada encontro dura no máximo 1 hora por dia; consultorias maiores viram
    // vários encontros marcados de uma vez, em dias diferentes.
    const meetingMinutes = sessionMinutes(product.duration_minutes);
    const totalSessions = sessionCount(product.duration_minutes);

    const rawStarts = data.startIsos?.length ? data.startIsos : [data.startIso!];
    const starts = rawStarts
      .map((iso) => new Date(iso))
      .sort((a, b) => +a - +b);

    if (starts.some((s) => Number.isNaN(+s))) throw new Error("Horário inválido.");
    if (starts.length !== totalSessions) {
      throw new Error(`Selecione ${totalSessions} encontro(s) de ${meetingMinutes} minutos, um por dia.`);
    }

    const dayKey = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: CONSULTATION_TZ }).format(d);
    if (new Set(starts.map(dayKey)).size !== starts.length) {
      throw new Error(`Cada encontro precisa ser em um dia diferente (limite de ${MAX_MINUTES_PER_DAY} min por dia).`);
    }

    const sessionsPlan = starts.map((start) => ({
      start,
      end: new Date(+start + meetingMinutes * 60_000),
    }));

    for (const { start, end } of sessionsPlan) {
      if (+start < Date.now() + MIN_LEAD_MINUTES * 60_000) {
        throw new Error("Escolha horários com pelo menos 2 horas de antecedência.");
      }
      const alreadyToday = await studentMinutesOnDay(context.userId, start.toISOString());
      if (alreadyToday + meetingMinutes > MAX_MINUTES_PER_DAY) {
        throw new Error(
          `Você já tem consultoria marcada em um dos dias escolhidos. O limite é de ${MAX_MINUTES_PER_DAY} minutos por dia.`,
        );
      }
      if (!(await isSlotFree(start.toISOString(), end.toISOString()))) {
        throw new Error("Um dos horários acabou de ser reservado. Escolha outro.");
      }
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
    const bookingGroup = crypto.randomUUID();

    const { data: rows, error } = await supabaseAdmin
      .from("consultations")
      .insert(
        sessionsPlan.map(({ start, end }, index) => ({
          user_id: context.userId,
          product_id: product.id,
          product_title:
            totalSessions > 1 ? `${product.title} — Encontro ${index + 1}/${totalSessions}` : product.title,
          client_name: profile?.name ?? null,
          client_email: profile?.email ?? (context.claims as any)?.email ?? null,
          client_phone: data.phone || (profile as any)?.phone || null,
          scheduled_at: start.toISOString(),
          ends_at: end.toISOString(),
          duration_minutes: meetingMinutes,
          timezone: CONSULTATION_TZ,
          status: "awaiting_payment",
          hold_expires_at: holdExpiresAt,
          briefing: briefing || null,
          briefing_data: (data.briefingData ?? null) as never,
          briefing_submitted_at: briefing ? new Date().toISOString() : null,
          // O valor total fica no primeiro encontro (é a compra); os demais são R$ 0.
          amount: index === 0 ? product.price : 0,
          booking_group: bookingGroup,
          session_index: index + 1,
          sessions_total: totalSessions,
        })) as never,
      )
      .select("*")
      .order("scheduled_at", { ascending: true });

    if (error || !rows?.length) throw new Error(`Falha ao reservar: ${error?.message ?? "erro desconhecido"}`);

    const created = rows[0];
    const start = new Date(created.scheduled_at);

    await auditConsultation({
      consultationId: created.id,
      actorId: context.userId,
      actorRole: "student",
      action: "reserved",
      details: {
        productId: product.id,
        bookingGroup,
        sessions: rows.map((r) => r.scheduled_at),
        holdExpiresAt,
      },
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
        .eq("booking_group", bookingGroup);

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
      // Libera os horários na hora: sem checkout não há como pagar.
      await supabaseAdmin
        .from("consultations")
        .update({ status: "cancelled", cancel_reason: "Falha ao gerar checkout", hold_expires_at: null } as never)
        .eq("booking_group", bookingGroup);
      throw new Error(message);
    }

    return {
      id: created.id,
      status: "awaiting_payment" as const,
      holdExpiresAt,
      paymentUrl,
      amount: Number(product.price),
      scheduledAt: created.scheduled_at,
      durationMinutes: meetingMinutes,
      sessions: rows.map((r) => ({ id: r.id, scheduledAt: r.scheduled_at })),
      sessionsTotal: totalSessions,
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
