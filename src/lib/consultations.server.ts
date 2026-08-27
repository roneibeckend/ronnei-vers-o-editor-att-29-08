// Módulo de Consultorias — helpers server-only.
// Agenda de disponibilidade, criação de evento no Google Calendar + Meet,
// e-mails de confirmação/lembrete/gravação e auditoria completa.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CONSULTATION_TZ = "America/Sao_Paulo";
/** São Paulo não usa horário de verão desde 2019. */
const TZ_OFFSET = "-03:00";
/** Antecedência mínima para o aluno agendar. */
export const MIN_LEAD_MINUTES = 120;

export type ConsultationRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  product_title: string;
  client_name: string | null;
  client_email: string | null;
  scheduled_at: string;
  ends_at: string;
  duration_minutes: number;
  status: string;
  briefing: string | null;
  meet_link: string | null;
  google_event_id: string | null;
  recording_url: string | null;
  confirmation_sent_at: string | null;
  reminder_8h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
};

/* ------------------------------ Auditoria ------------------------------ */

export async function auditConsultation(entry: {
  consultationId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  status?: "ok" | "error" | "warn";
  details?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("consultation_audit_log").insert({
      consultation_id: entry.consultationId ?? null,
      actor_id: entry.actorId ?? null,
      actor_role: entry.actorRole ?? "system",
      action: entry.action,
      status: entry.status ?? "ok",
      details: (entry.details ?? {}) as never,
    });
  } catch (err) {
    console.warn("[consultorias] Falha ao registrar auditoria:", (err as Error)?.message);
  }
}

/* ------------------------------ Datas ------------------------------ */

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

function spDateParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONSULTATION_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // YYYY-MM-DD
}

function slotDate(dateStr: string, time: string) {
  const hhmm = time.slice(0, 5);
  return new Date(`${dateStr}T${hhmm}:00${TZ_OFFSET}`);
}

/* --------------------------- Disponibilidade --------------------------- */

export type Slot = { startIso: string; endIso: string; label: string; date: string; time: string };

export async function computeAvailableSlots(durationMinutes: number, days = 30): Promise<Slot[]> {
  const [{ data: availability }, { data: blocks }, { data: booked }] = await Promise.all([
    supabaseAdmin.from("consultation_availability").select("*").eq("active", true),
    supabaseAdmin
      .from("consultation_blocks")
      .select("starts_at, ends_at")
      .gte("ends_at", new Date().toISOString()),
    supabaseAdmin
      .from("consultations")
      .select("scheduled_at, ends_at, status")
      .in("status", ["scheduled", "pending_payment"])
      .gte("ends_at", new Date().toISOString()),
  ]);

  if (!availability?.length) return [];

  const busy: { start: number; end: number }[] = [
    ...(blocks ?? []).map((b) => ({ start: +new Date(b.starts_at), end: +new Date(b.ends_at) })),
    ...(booked ?? []).map((b) => ({ start: +new Date(b.scheduled_at), end: +new Date(b.ends_at) })),
  ];

  const minStart = Date.now() + MIN_LEAD_MINUTES * 60_000;
  const slots: Slot[] = [];

  for (let d = 0; d < days; d++) {
    const cursor = new Date(Date.now() + d * 86_400_000);
    const dateStr = spDateParts(cursor);
    // Dia da semana no fuso de São Paulo
    const weekday = new Date(`${dateStr}T12:00:00${TZ_OFFSET}`).getUTCDay();

    for (const rule of availability.filter((a) => a.weekday === weekday)) {
      const windowStart = slotDate(dateStr, rule.start_time as string);
      const windowEnd = slotDate(dateStr, rule.end_time as string);
      const step = Math.max(15, rule.slot_interval_minutes || 30) * 60_000;

      for (let t = +windowStart; t + durationMinutes * 60_000 <= +windowEnd; t += step) {
        const start = t;
        const end = t + durationMinutes * 60_000;
        if (start < minStart) continue;
        if (busy.some((b) => start < b.end && end > b.start)) continue;

        const startDate = new Date(start);
        slots.push({
          startIso: startDate.toISOString(),
          endIso: new Date(end).toISOString(),
          date: dateStr,
          time: new Intl.DateTimeFormat("pt-BR", {
            timeZone: CONSULTATION_TZ,
            hour: "2-digit",
            minute: "2-digit",
          }).format(startDate),
          label: formatBR(startDate.toISOString()),
        });
      }
    }
  }

  return slots.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

/** Reconfirma que o horário continua livre (evita corrida entre dois alunos). */
export async function isSlotFree(startIso: string, endIso: string) {
  const [{ data: conflicts }, { data: blocked }] = await Promise.all([
    supabaseAdmin
      .from("consultations")
      .select("id")
      .in("status", ["scheduled", "pending_payment"])
      .lt("scheduled_at", endIso)
      .gt("ends_at", startIso)
      .limit(1),
    supabaseAdmin
      .from("consultation_blocks")
      .select("id")
      .lt("starts_at", endIso)
      .gt("ends_at", startIso)
      .limit(1),
  ]);
  return !conflicts?.length && !blocked?.length;
}

/* --------------------------- Google Calendar --------------------------- */

export async function attachGoogleMeeting(consultation: ConsultationRow) {
  try {
    const { createCalendarEvent } = await import("@/lib/google-calendar.server");
    const attendees = consultation.client_email ? [consultation.client_email] : [];

    const event = await createCalendarEvent({
      summary: `Consultoria — ${consultation.client_name || "Aluno"} (${consultation.product_title})`,
      description: [
        `Consultoria: ${consultation.product_title}`,
        `Aluno: ${consultation.client_name || "-"} (${consultation.client_email || "-"})`,
        "",
        "Briefing:",
        consultation.briefing || "(a ser preenchido pelo aluno)",
      ].join("\n"),
      startIso: consultation.scheduled_at,
      endIso: consultation.ends_at,
      attendees,
      withMeet: true,
      requestId: `consult-${consultation.id}`,
    });

    await supabaseAdmin
      .from("consultations")
      .update({
        google_event_id: event.eventId,
        google_calendar_id: event.calendarId,
        meet_link: event.meetLink,
        calendar_html_link: event.htmlLink,
      })
      .eq("id", consultation.id);

    await auditConsultation({
      consultationId: consultation.id,
      action: "google_event_created",
      details: { eventId: event.eventId, meetLink: event.meetLink },
    });

    return { ok: true as const, meetLink: event.meetLink, eventId: event.eventId };
  } catch (err) {
    const message = (err as Error)?.message ?? "Falha ao criar evento no Google";
    await auditConsultation({
      consultationId: consultation.id,
      action: "google_event_created",
      status: "error",
      details: { error: message },
    });
    return { ok: false as const, error: message };
  }
}

export async function cancelGoogleMeeting(consultation: ConsultationRow) {
  if (!consultation.google_event_id) return;
  try {
    const { deleteCalendarEvent } = await import("@/lib/google-calendar.server");
    await deleteCalendarEvent(consultation.google_event_id, true);
    await auditConsultation({ consultationId: consultation.id, action: "google_event_deleted" });
  } catch (err) {
    await auditConsultation({
      consultationId: consultation.id,
      action: "google_event_deleted",
      status: "error",
      details: { error: (err as Error)?.message },
    });
  }
}

/** Move o evento do Google para o novo horário (reagendamento). */
export async function rescheduleGoogleMeeting(
  consultation: ConsultationRow,
  startIso: string,
  endIso: string,
) {
  if (!consultation.google_event_id) {
    return attachGoogleMeeting({ ...consultation, scheduled_at: startIso, ends_at: endIso });
  }
  try {
    const { updateCalendarEvent } = await import("@/lib/google-calendar.server");
    const event = await updateCalendarEvent(consultation.google_event_id, { startIso, endIso });
    await supabaseAdmin
      .from("consultations")
      .update({
        meet_link: event.meetLink || consultation.meet_link,
        calendar_html_link: event.htmlLink,
      })
      .eq("id", consultation.id);
    await auditConsultation({
      consultationId: consultation.id,
      action: "google_event_rescheduled",
      details: { startIso, endIso },
    });
    return { ok: true as const, meetLink: event.meetLink || consultation.meet_link };
  } catch (err) {
    const message = (err as Error)?.message ?? "Falha ao reagendar no Google";
    await auditConsultation({
      consultationId: consultation.id,
      action: "google_event_rescheduled",
      status: "error",
      details: { error: message },
    });
    return { ok: false as const, error: message };
  }
}



/* ------------------------------ E-mails ------------------------------ */

const DASH = "https://ronneinaveia.com.br/app/consultorias";

async function sendConsultationEmail(
  consultation: ConsultationRow,
  event: string,
  extra: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  if (!consultation.client_email) return { skipped: true };
  const { triggerEmailEvent, triggerEmailOnce } = await import("@/lib/resend.server");
  const payload = {
    event,
    to: consultation.client_email,
    data: {
      name: consultation.client_name || "Churrasqueiro",
      title: consultation.product_title,
      date: formatBR(consultation.scheduled_at),
      duration: `${consultation.duration_minutes} minutos`,
      meet_link: consultation.meet_link || DASH,
      link: consultation.meet_link || DASH,
      briefing_link: DASH,
      ...extra,
    },
  };

  try {
    const result = idempotencyKey
      ? await triggerEmailOnce({ ...payload, idempotencyKey })
      : await triggerEmailEvent(payload);
    await auditConsultation({ consultationId: consultation.id, action: `email_${event}` });
    return result;
  } catch (err) {
    await auditConsultation({
      consultationId: consultation.id,
      action: `email_${event}`,
      status: "error",
      details: { error: (err as Error)?.message },
    });
    return { error: (err as Error)?.message };
  }
}

export async function sendConsultationConfirmation(consultation: ConsultationRow) {
  const res = await sendConsultationEmail(
    consultation,
    "consultoria_confirmada",
    {},
    `consult-confirm-${consultation.id}`,
  );
  await supabaseAdmin
    .from("consultations")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", consultation.id);
  return res;
}

export async function sendConsultationReminder(
  consultation: ConsultationRow,
  window: "24h" | "8h" | "1h",
) {
  const event =
    window === "1h"
      ? "consultoria_lembrete_1h"
      : window === "24h"
        ? "consultoria_lembrete_24h"
        : "consultoria_lembrete_8h";

  const res = await sendConsultationEmail(
    consultation,
    event,
    { briefing_pending: !consultation.briefing },
    `consult-${window}-${consultation.id}`,
  );

  const stamp = new Date().toISOString();
  await supabaseAdmin
    .from("consultations")
    .update(
      window === "1h"
        ? { reminder_1h_sent_at: stamp }
        : window === "24h"
          ? { reminder_24h_sent_at: stamp }
          : { reminder_8h_sent_at: stamp },
    )
    .eq("id", consultation.id);
  return res;
}

export async function sendConsultationRecording(consultation: ConsultationRow) {
  const res = await sendConsultationEmail(
    consultation,
    "consultoria_gravacao",
    { recording_url: consultation.recording_url, link: consultation.recording_url || DASH },
    `consult-rec-${consultation.id}`,
  );
  await supabaseAdmin
    .from("consultations")
    .update({ recording_sent_at: new Date().toISOString() })
    .eq("id", consultation.id);
  return res;
}

export async function sendConsultationCompleted(consultation: ConsultationRow) {
  return sendConsultationEmail(
    consultation,
    "consultoria_concluida",
    {
      recording_url: consultation.recording_url,
      link: DASH,
      has_recording: Boolean(consultation.recording_url),
    },
    `consult-done-${consultation.id}`,
  );
}

/* ------------------------- Conclusão + automações ------------------------- */

export type ConsultationMaterial = { title: string; url: string };

/**
 * Marca a reunião como concluída, libera os materiais complementares do produto,
 * avisa o aluno por e-mail e registra a auditoria.
 */
export async function completeConsultation(
  consultationId: string,
  options: { actorId?: string | null; actorRole?: string; notify?: boolean } = {},
) {
  const { data: row } = await supabaseAdmin
    .from("consultations")
    .select("*")
    .eq("id", consultationId)
    .maybeSingle();
  if (!row) throw new Error("Consultoria não encontrada.");

  const existing = Array.isArray((row as any).materials) ? ((row as any).materials as ConsultationMaterial[]) : [];
  let materials = existing;

  if (!existing.length && row.product_id) {
    const { data: product } = await supabaseAdmin
      .from("consultation_products")
      .select("materials")
      .eq("id", row.product_id)
      .maybeSingle();
    const fromProduct = Array.isArray((product as any)?.materials)
      ? ((product as any).materials as ConsultationMaterial[])
      : [];
    if (fromProduct.length) materials = fromProduct;
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("consultations")
    .update({
      status: "completed",
      completed_at: row.completed_at ?? now,
      materials: materials as never,
      materials_released_at: materials.length ? ((row as any).materials_released_at ?? now) : null,
    })
    .eq("id", consultationId);

  await auditConsultation({
    consultationId,
    actorId: options.actorId ?? null,
    actorRole: options.actorRole ?? "system",
    action: "completed",
    details: { materials: materials.length, notified: options.notify !== false },
  });

  if (options.notify !== false) {
    await sendConsultationCompleted({ ...(row as any), materials } as never);
  }

  return { completed: true, materials };
}

/* --------------------------- Lembretes (cron) --------------------------- */

export async function runConsultationReminders() {
  const now = Date.now();
  const { data: upcoming } = await supabaseAdmin
    .from("consultations")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date(now).toISOString())
    .lte("scheduled_at", new Date(now + 26 * 3600_000).toISOString());

  let sent24h = 0;
  let sent8h = 0;
  let sent1h = 0;

  for (const row of (upcoming ?? []) as ConsultationRow[]) {
    const minutesAhead = (+new Date(row.scheduled_at) - now) / 60_000;

    if (!(row as any).reminder_24h_sent_at && minutesAhead <= 24 * 60 && minutesAhead > 8 * 60) {
      await sendConsultationReminder(row, "24h");
      sent24h++;
    }
    if (!row.reminder_8h_sent_at && minutesAhead <= 8 * 60 && minutesAhead > 60) {
      await sendConsultationReminder(row, "8h");
      sent8h++;
    }
    if (!row.reminder_1h_sent_at && minutesAhead <= 60 && minutesAhead > 0) {
      await sendConsultationReminder(row, "1h");
      sent1h++;
    }
  }

  // Reuniões que já passaram entram no fluxo completo de conclusão
  // (materiais liberados + e-mail + auditoria).
  const { data: finished } = await supabaseAdmin
    .from("consultations")
    .select("id")
    .eq("status", "scheduled")
    .lt("ends_at", new Date(now - 15 * 60_000).toISOString());

  for (const f of finished ?? []) {
    try {
      await completeConsultation(f.id, { actorRole: "system" });
    } catch (err) {
      await auditConsultation({
        consultationId: f.id,
        action: "auto_completed",
        status: "error",
        details: { error: (err as Error)?.message },
      });
    }
  }

  return {
    checked: upcoming?.length ?? 0,
    sent24h,
    sent8h,
    sent1h,
    completed: finished?.length ?? 0,
  };
}

