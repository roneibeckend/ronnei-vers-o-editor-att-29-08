// Acompanhamento pós-consultoria: reunião de feedback 30 dias após a consultoria.
// Helpers server-only: horários livres, agendamento com Google Calendar/Meet,
// avisos (e-mail, push, notificação interna), lembretes e auditoria.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CONSULTATION_TZ, computeAvailableSlots, isSlotFree } from "@/lib/consultations.server";

/** Duração fixa da reunião de feedback. */
export const FOLLOWUP_MINUTES = 30;

export type FollowupRow = {
  id: string;
  consultation_id: string;
  user_id: string;
  followup_date: string;
  meeting_date: string | null;
  ends_at: string | null;
  status: string;
  google_event_id: string | null;
  meet_link: string | null;
  notified_at: string | null;
  reminder_24h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  attended: boolean | null;
  method_implemented: boolean | null;
};

export function formatBR(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CONSULTATION_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/* ------------------------------ Auditoria ------------------------------ */

export async function auditFollowup(entry: {
  action: string;
  followupId?: string | null;
  consultationId?: string | null;
  actorId?: string | null;
  targetUserId?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("admin_audit_log").insert({
      action: `followup_${entry.action}`,
      actor_id: entry.actorId ?? null,
      target_user_id: entry.targetUserId ?? null,
      product_type: "consultation_followup",
      product_id: entry.followupId ?? null,
      product_name: "Acompanhamento pós-consultoria",
      reason: entry.reason ?? null,
      details: {
        followup_id: entry.followupId ?? null,
        consultation_id: entry.consultationId ?? null,
        ...(entry.details ?? {}),
      } as never,
    });
  } catch (err) {
    console.warn("[followups] Falha ao registrar auditoria:", (err as Error)?.message);
  }
}

/* ------------------------------ Agenda ------------------------------ */

/** Horários livres de 30 min, já descontando as reuniões de feedback marcadas. */
export async function followupSlots() {
  const slots = await computeAvailableSlots(FOLLOWUP_MINUTES);
  const { data: booked } = await supabaseAdmin
    .from("consultation_followups")
    .select("meeting_date, ends_at")
    .eq("status", "scheduled")
    .not("meeting_date", "is", null)
    .gte("meeting_date", new Date().toISOString());

  const busy = (booked ?? []).map((b: any) => ({
    start: +new Date(b.meeting_date),
    end: +new Date(b.ends_at ?? +new Date(b.meeting_date) + FOLLOWUP_MINUTES * 60_000),
  }));

  return slots.filter((s) => {
    const start = +new Date(s.startIso);
    const end = +new Date(s.endIso);
    return !busy.some((b) => start < b.end && end > b.start);
  });
}

/** Conflito com consultorias, bloqueios e outros feedbacks. */
export async function isFollowupSlotFree(startIso: string, endIso: string, ignoreId?: string) {
  if (!(await isSlotFree(startIso, endIso))) return false;
  const { data: conflicts } = await supabaseAdmin
    .from("consultation_followups")
    .select("id, meeting_date, ends_at")
    .eq("status", "scheduled")
    .lt("meeting_date", endIso)
    .gt("ends_at", startIso);
  return !(conflicts ?? []).some((c: any) => c.id !== ignoreId);
}

/* --------------------------- Comunicação --------------------------- */

async function studentContact(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  return { name: (data as any)?.name || "Churrasqueiro", email: (data as any)?.email || null };
}

/** Notificação interna na área do aluno. */
async function notifyStudent(userId: string, title: string, message: string, metadata: Record<string, any>) {
  try {
    const { data: notification } = await supabaseAdmin
      .from("notifications")
      .insert({
        title,
        message,
        type: "consultoria",
        target_type: "segmented",
        metadata: metadata as never,
      } as never)
      .select("id")
      .maybeSingle();
    if (!notification) return;
    await supabaseAdmin
      .from("user_notifications")
      .insert({ user_id: userId, notification_id: (notification as any).id } as never);
  } catch (err) {
    console.warn("[followups] Falha na notificação interna:", (err as Error)?.message);
  }
}

/** Push web para os dispositivos registrados do aluno. */
async function pushStudent(userId: string, title: string, body: string, url: string) {
  try {
    const { sendWebPush } = await import("@/lib/web-push.server");
    const { data: subs } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .eq("active", true);

    for (const sub of subs ?? []) {
      const result = await sendWebPush(sub as any, { title, body, url } as any);
      if (!result.ok && (result as any).expired) {
        await supabaseAdmin
          .from("admin_push_subscriptions")
          .update({ active: false } as never)
          .eq("id", (sub as any).id);
      }
    }
  } catch (err) {
    console.warn("[followups] Falha no push:", (err as Error)?.message);
  }
}

async function sendFollowupEmail(
  event: string,
  to: string,
  data: Record<string, unknown>,
  idempotencyKey: string,
) {
  const { triggerEmailOnce } = await import("@/lib/resend.server");
  return triggerEmailOnce({ event, to, data, idempotencyKey } as never);
}

const APP_URL = "/app/feedback";

/* --------------------------- Agendamento --------------------------- */

export async function scheduleFollowupMeeting(input: {
  followupId: string;
  userId: string;
  startIso: string;
  actorId?: string | null;
}) {
  const start = new Date(input.startIso);
  if (Number.isNaN(+start)) throw new Error("Horário inválido.");
  const endIso = new Date(+start + FOLLOWUP_MINUTES * 60_000).toISOString();

  const { data: followup } = await supabaseAdmin
    .from("consultation_followups")
    .select("*")
    .eq("id", input.followupId)
    .maybeSingle();

  if (!followup || (followup as any).user_id !== input.userId) {
    throw new Error("Acompanhamento não encontrado.");
  }
  if (["completed", "cancelled"].includes((followup as any).status)) {
    throw new Error("Este acompanhamento não está mais disponível para agendamento.");
  }
  if (!(await isFollowupSlotFree(start.toISOString(), endIso, input.followupId))) {
    throw new Error("Esse horário acabou de ser ocupado. Escolha outro.");
  }

  const contact = await studentContact(input.userId);
  const { data: consultation } = await supabaseAdmin
    .from("consultations")
    .select("product_title, scheduled_at")
    .eq("id", (followup as any).consultation_id)
    .maybeSingle();

  let googleEventId: string | null = null;
  let meetLink: string | null = null;
  try {
    const { createCalendarEvent } = await import("@/lib/google-calendar.server");
    const event = await createCalendarEvent({
      summary: `Feedback pós-consultoria — ${contact.name}`,
      description: `Reunião de acompanhamento (30 min) referente a: ${(consultation as any)?.product_title ?? "Consultoria"}.`,
      startIso: start.toISOString(),
      endIso,
      attendees: contact.email ? [contact.email] : [],
      withMeet: true,
      requestId: `followup-${input.followupId}`,
    });
    googleEventId = event.eventId;
    meetLink = event.meetLink;
  } catch (err) {
    // Sem Google configurado o agendamento continua válido (sem link automático).
    console.warn("[followups] Google Calendar indisponível:", (err as Error)?.message);
    await auditFollowup({
      action: "calendar_error",
      followupId: input.followupId,
      consultationId: (followup as any).consultation_id,
      targetUserId: input.userId,
      reason: (err as Error)?.message,
    });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("consultation_followups")
    .update({
      status: "scheduled",
      meeting_date: start.toISOString(),
      ends_at: endIso,
      google_event_id: googleEventId,
      meet_link: meetLink,
      cancel_reason: null,
    } as never)
    .eq("id", input.followupId)
    .eq("user_id", input.userId)
    .select("*")
    .maybeSingle();

  if (error || !updated) throw new Error("Não foi possível salvar o agendamento.");

  if (contact.email) {
    await sendFollowupEmail(
      "consultoria_feedback_agendado",
      contact.email,
      {
        name: contact.name,
        title: "Reunião de feedback",
        date: formatBR(start.toISOString()),
        duration: `${FOLLOWUP_MINUTES} minutos`,
        meet_link: meetLink || APP_URL,
        link: meetLink || APP_URL,
      },
      `followup-scheduled-${input.followupId}`,
    );
  }

  await notifyStudent(
    input.userId,
    "Feedback agendado",
    `Sua reunião de feedback está marcada para ${formatBR(start.toISOString())}.`,
    { followup_id: input.followupId, link: APP_URL },
  );

  await auditFollowup({
    action: "scheduled",
    followupId: input.followupId,
    consultationId: (followup as any).consultation_id,
    actorId: input.actorId ?? input.userId,
    targetUserId: input.userId,
    details: { meeting_date: start.toISOString(), google_event_id: googleEventId },
  });

  return updated as any;
}

export async function cancelFollowupMeeting(input: {
  followupId: string;
  userId: string;
  reason?: string | null;
  actorId?: string | null;
}) {
  const { data: followup } = await supabaseAdmin
    .from("consultation_followups")
    .select("*")
    .eq("id", input.followupId)
    .maybeSingle();
  if (!followup || (followup as any).user_id !== input.userId) {
    throw new Error("Acompanhamento não encontrado.");
  }

  if ((followup as any).google_event_id) {
    try {
      const { deleteCalendarEvent } = await import("@/lib/google-calendar.server");
      await deleteCalendarEvent((followup as any).google_event_id);
    } catch (err) {
      console.warn("[followups] Falha ao remover evento:", (err as Error)?.message);
    }
  }

  await supabaseAdmin
    .from("consultation_followups")
    .update({
      status: "pending",
      meeting_date: null,
      ends_at: null,
      google_event_id: null,
      meet_link: null,
      reminder_24h_sent_at: null,
      reminder_1h_sent_at: null,
      cancel_reason: input.reason ?? "Cancelado pelo aluno",
    } as never)
    .eq("id", input.followupId);

  await auditFollowup({
    action: "meeting_cancelled",
    followupId: input.followupId,
    consultationId: (followup as any).consultation_id,
    actorId: input.actorId ?? input.userId,
    targetUserId: input.userId,
    reason: input.reason ?? null,
  });

  return { ok: true };
}

/* --------------------------- Rotina diária --------------------------- */

/**
 * Avisa os acompanhamentos vencidos (30 dias completos) e dispara os
 * lembretes de 24h e 1h das reuniões já marcadas.
 */
export async function runConsultationFollowups() {
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);

  let notified = 0;
  let reminded24h = 0;
  let reminded1h = 0;
  let failed = 0;

  /* 1. Vencidos: avisar que o feedback está liberado */
  const { data: due } = await supabaseAdmin
    .from("consultation_followups")
    .select("*")
    .eq("status", "pending")
    .is("notified_at", null)
    .lte("followup_date", todayIso);

  for (const row of (due ?? []) as any[]) {
    try {
      const contact = await studentContact(row.user_id);
      if (contact.email) {
        await sendFollowupEmail(
          "consultoria_feedback_disponivel",
          contact.email,
          {
            name: contact.name,
            title: "Reunião de feedback liberada",
            link: APP_URL,
            date: formatBR(new Date().toISOString()),
          },
          `followup-due-${row.id}`,
        );
      }
      await notifyStudent(
        row.user_id,
        "Hora do seu feedback",
        "Já se passaram 30 dias da sua consultoria. Agende a reunião de feedback de 30 minutos.",
        { followup_id: row.id, link: APP_URL },
      );
      await pushStudent(
        row.user_id,
        "Hora do seu feedback",
        "Agende sua reunião de acompanhamento de 30 minutos.",
        APP_URL,
      );
      await supabaseAdmin
        .from("consultation_followups")
        .update({ notified_at: new Date().toISOString() } as never)
        .eq("id", row.id);
      await auditFollowup({
        action: "due_notified",
        followupId: row.id,
        consultationId: row.consultation_id,
        targetUserId: row.user_id,
      });
      notified++;
    } catch (err) {
      failed++;
      await auditFollowup({
        action: "due_notify_failed",
        followupId: row.id,
        consultationId: row.consultation_id,
        targetUserId: row.user_id,
        reason: (err as Error)?.message,
      });
    }
  }

  /* 2. Lembretes das reuniões marcadas (24h e 1h antes) */
  const { data: upcoming } = await supabaseAdmin
    .from("consultation_followups")
    .select("*")
    .eq("status", "scheduled")
    .gte("meeting_date", new Date(now).toISOString())
    .lte("meeting_date", new Date(now + 26 * 3600_000).toISOString());

  for (const row of (upcoming ?? []) as any[]) {
    const minutesAhead = (+new Date(row.meeting_date) - now) / 60_000;
    const windows: ("24h" | "1h")[] = [];
    if (!row.reminder_24h_sent_at && minutesAhead <= 24 * 60 && minutesAhead > 12 * 60) windows.push("24h");
    if (!row.reminder_1h_sent_at && minutesAhead <= 60 && minutesAhead > 0) windows.push("1h");

    for (const window of windows) {
      try {
        const contact = await studentContact(row.user_id);
        if (contact.email) {
          await sendFollowupEmail(
            window === "24h" ? "consultoria_feedback_lembrete_24h" : "consultoria_feedback_lembrete_1h",
            contact.email,
            {
              name: contact.name,
              title: "Reunião de feedback",
              date: formatBR(row.meeting_date),
              duration: `${FOLLOWUP_MINUTES} minutos`,
              meet_link: row.meet_link || APP_URL,
              link: row.meet_link || APP_URL,
            },
            `followup-${window}-${row.id}`,
          );
        }
        await pushStudent(
          row.user_id,
          window === "24h" ? "Feedback amanhã" : "Feedback em 1 hora",
          `Sua reunião de acompanhamento é em ${formatBR(row.meeting_date)}.`,
          row.meet_link || APP_URL,
        );
        await notifyStudent(
          row.user_id,
          window === "24h" ? "Feedback amanhã" : "Feedback em 1 hora",
          `Reunião de acompanhamento em ${formatBR(row.meeting_date)}.`,
          { followup_id: row.id, link: row.meet_link || APP_URL },
        );
        await supabaseAdmin
          .from("consultation_followups")
          .update(
            (window === "24h"
              ? { reminder_24h_sent_at: new Date().toISOString() }
              : { reminder_1h_sent_at: new Date().toISOString() }) as never,
          )
          .eq("id", row.id);
        if (window === "24h") reminded24h++;
        else reminded1h++;
        await auditFollowup({
          action: `reminder_${window}_sent`,
          followupId: row.id,
          consultationId: row.consultation_id,
          targetUserId: row.user_id,
        });
      } catch (err) {
        failed++;
        await auditFollowup({
          action: `reminder_${window}_failed`,
          followupId: row.id,
          consultationId: row.consultation_id,
          targetUserId: row.user_id,
          reason: (err as Error)?.message,
        });
      }
    }
  }

  /* 3. Reuniões que já passaram viram "concluídas" (presença confirmada pelo admin) */
  const { data: past } = await supabaseAdmin
    .from("consultation_followups")
    .select("id, consultation_id, user_id")
    .eq("status", "scheduled")
    .lt("ends_at", new Date(now - 30 * 60_000).toISOString());

  for (const row of (past ?? []) as any[]) {
    await supabaseAdmin
      .from("consultation_followups")
      .update({ status: "completed", completed_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    await auditFollowup({
      action: "auto_completed",
      followupId: row.id,
      consultationId: row.consultation_id,
      targetUserId: row.user_id,
    });
  }

  return {
    notified,
    reminded24h,
    reminded1h,
    completed: (past ?? []).length,
    failed,
  };
}
