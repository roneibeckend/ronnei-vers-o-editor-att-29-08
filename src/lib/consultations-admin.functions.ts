import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Proibido");
}

/* --------------------------- Visão geral admin --------------------------- */

export const getConsultationsAdminData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [products, availability, blocks, consultations, audit] = await Promise.all([
      supabaseAdmin.from("consultation_products").select("*").order("sort_order").then((r) => r.data ?? []),
      supabaseAdmin
        .from("consultation_availability")
        .select("*")
        .order("weekday")
        .order("start_time")
        .then((r) => r.data ?? []),
      supabaseAdmin
        .from("consultation_blocks")
        .select("*")
        .order("starts_at", { ascending: false })
        .limit(50)
        .then((r) => r.data ?? []),
      supabaseAdmin
        .from("consultations")
        .select("*")
        .order("scheduled_at", { ascending: false })
        .limit(200)
        .then((r) => r.data ?? []),
      supabaseAdmin
        .from("consultation_audit_log")
        .select("id, consultation_id, action, status, actor_role, details, created_at")
        .order("created_at", { ascending: false })
        .limit(80)
        .then((r) => r.data ?? []),
    ]);

    return { products, availability, blocks, consultations, audit };
  });

/* ------------------------------ Produtos ------------------------------ */

const productSchema = z.object({
  id: z.string().trim().min(3).max(60).regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
  title: z.string().trim().min(3).max(160),
  subtitle: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  cover_url: z.string().trim().max(500).nullable().optional(),
  duration_minutes: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(180)]),
  price: z.number().min(0).max(100000),
  status: z.enum(["draft", "coming_soon", "active"]),
  briefing_required: z.boolean(),
  affiliate_enabled: z.boolean(),
  materials: z
    .array(z.object({ title: z.string().trim().min(1).max(160), url: z.string().trim().url().max(600) }))
    .max(20)
    .optional(),
  sort_order: z.number().int().min(0).max(999),
});

export const saveConsultationProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => productSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");

    const { error } = await supabaseAdmin.from("consultation_products").upsert(
      {
        ...data,
        subtitle: data.subtitle || null,
        description: data.description || null,
        cover_url: data.cover_url || null,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`Falha ao salvar: ${error.message}`);

    await auditConsultation({
      actorId: context.userId,
      actorRole: "admin",
      action: "product_saved",
      details: { id: data.id, status: data.status },
    });
    return { saved: true };
  });

export const deleteConsultationProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");
    const { error } = await supabaseAdmin.from("consultation_products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditConsultation({
      actorId: context.userId,
      actorRole: "admin",
      action: "product_deleted",
      details: { id: data.id },
    });
    return { deleted: true };
  });

/* ---------------------------- Disponibilidade ---------------------------- */

export const saveAvailabilityRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        weekday: z.number().int().min(0).max(6),
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
        slot_interval_minutes: z.number().int().min(15).max(240),
        active: z.boolean(),
      })
      .refine((v) => v.end_time > v.start_time, { message: "Horário final deve ser maior que o inicial" })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");

    const payload = {
      weekday: data.weekday,
      start_time: data.start_time,
      end_time: data.end_time,
      slot_interval_minutes: data.slot_interval_minutes,
      active: data.active,
    };

    const { error } = data.id
      ? await supabaseAdmin.from("consultation_availability").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("consultation_availability").insert(payload);
    if (error) throw new Error(`Falha ao salvar agenda: ${error.message}`);

    await auditConsultation({
      actorId: context.userId,
      actorRole: "admin",
      action: "availability_saved",
      details: payload,
    });
    return { saved: true };
  });

export const deleteAvailabilityRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("consultation_availability").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

export const saveConsultationBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        starts_at: z.string().min(10),
        ends_at: z.string().min(10),
        reason: z.string().trim().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const start = new Date(data.starts_at);
    const end = new Date(data.ends_at);
    if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
      throw new Error("Período de bloqueio inválido.");
    }
    const { error } = await supabaseAdmin.from("consultation_blocks").insert({
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      reason: data.reason || null,
    });
    if (error) throw new Error(error.message);
    return { saved: true };
  });

export const deleteConsultationBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("consultation_blocks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

/* --------------------------- Reuniões (admin) --------------------------- */

export const setConsultationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["awaiting_payment", "pending_payment", "scheduled", "completed", "cancelled", "no_show"]),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, cancelGoogleMeeting, completeConsultation } = await import(
      "@/lib/consultations.server"
    );

    const { data: row } = await supabaseAdmin.from("consultations").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");

    if (data.notes) {
      await supabaseAdmin.from("consultations").update({ admin_notes: data.notes }).eq("id", data.id);
    }

    // Concluir dispara as automações completas (materiais + e-mail + auditoria).
    if (data.status === "completed") {
      const result = await completeConsultation(data.id, {
        actorId: context.userId,
        actorRole: "admin",
      });
      return { saved: true, materials: result.materials.length };
    }

    // Falta manual passa pelo fluxo completo (Google + e-mail + auditoria).
    if (data.status === "no_show") {
      const { markConsultationNoShow } = await import("@/lib/consultations.server");
      await markConsultationNoShow(row as never, {
        actorId: context.userId,
        actorRole: "admin",
        reason: data.notes || undefined,
      });
      return { saved: true };
    }

    const cancelledByConsultant = data.status === "cancelled";
    if (cancelledByConsultant && row.google_event_id) {
      await cancelGoogleMeeting(row as never);
    }

    const { error } = await supabaseAdmin
      .from("consultations")
      .update({
        status: data.status,
        cancelled_by: cancelledByConsultant ? "admin" : (row as any).cancelled_by ?? null,
        cancel_reason: cancelledByConsultant ? data.notes || "Cancelado pelo admin" : row.cancel_reason,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Cancelamento nosso: o aluno escolhe entre remarcar sem taxa ou suporte.
    if (cancelledByConsultant) {
      const { sendConsultationCancelledByConsultant } = await import("@/lib/consultations.server");
      await sendConsultationCancelledByConsultant(row as never, data.notes ?? null);
    }

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: `status_${data.status}`,
      details: { notes: data.notes ?? null },
    });
    return { saved: true };
  });

/** Reagenda a reunião (move o evento do Google e avisa o aluno). */
export const rescheduleConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        scheduledAt: z.string().datetime(),
        durationMinutes: z.number().int().min(15).max(240).optional(),
        notify: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, rescheduleGoogleMeeting, sendConsultationConfirmation } = await import(
      "@/lib/consultations.server"
    );

    const { data: row } = await supabaseAdmin.from("consultations").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");

    const duration = data.durationMinutes ?? row.duration_minutes ?? 60;
    const start = new Date(data.scheduledAt);
    if (Number.isNaN(+start)) throw new Error("Data inválida.");
    if (+start < Date.now()) throw new Error("Escolha uma data futura.");
    const endIso = new Date(+start + duration * 60_000).toISOString();

    const google = await rescheduleGoogleMeeting(row as never, start.toISOString(), endIso);

    const { data: updated, error } = await supabaseAdmin
      .from("consultations")
      .update({
        scheduled_at: start.toISOString(),
        ends_at: endIso,
        duration_minutes: duration,
        status: "scheduled",
        rescheduled_from: row.scheduled_at,
        reschedule_count: ((row as any).reschedule_count ?? 0) + 1,
        // Novos lembretes para o novo horário
        reminder_24h_sent_at: null,
        reminder_8h_sent_at: null,
        reminder_1h_sent_at: null,
        confirmation_sent_at: null,
        meet_link: google.ok ? (google.meetLink ?? row.meet_link) : row.meet_link,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: "rescheduled",
      details: { from: row.scheduled_at, to: start.toISOString(), google: google.ok },
    });

    if (data.notify) await sendConsultationConfirmation(updated as never);
    return { saved: true, meetLink: updated.meet_link, googleError: google.ok ? null : google.error };
  });

/** Observações internas, observações para o aluno e materiais complementares. */
export const saveConsultationNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        adminNotes: z.string().trim().max(5000).nullable().optional(),
        studentNotes: z.string().trim().max(5000).nullable().optional(),
        actionPlan: z.string().trim().max(5000).nullable().optional(),
        meetingSummary: z.string().trim().max(10000).nullable().optional(),
        meetingScript: z.string().trim().max(20000).nullable().optional(),
        materials: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(160),
              url: z.string().trim().url().max(600),
            }),
          )
          .max(20)
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");

    const patch: Record<string, unknown> = {};
    if (data.adminNotes !== undefined) patch["admin_notes"] = data.adminNotes || null;
    if (data.studentNotes !== undefined) patch["student_notes"] = data.studentNotes || null;
    if (data.actionPlan !== undefined) patch["action_plan"] = data.actionPlan || null;
    if (data.meetingSummary !== undefined) patch["meeting_summary"] = data.meetingSummary || null;
    if (data.meetingScript !== undefined) patch["meeting_script"] = data.meetingScript || null;
    if (data.materials !== undefined) {
      patch["materials"] = data.materials;
      patch["materials_released_at"] = data.materials.length ? new Date().toISOString() : null;
    }

    const { error } = await supabaseAdmin
      .from("consultations")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: "notes_saved",
      details: { fields: Object.keys(patch) },
    });
    return { saved: true };
  });

/** Define um link de reunião personalizado (Zoom, Meet manual, etc). */
export const setConsultationMeetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        meetLink: z.string().trim().url().max(600),
        notify: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, sendConsultationConfirmation } = await import("@/lib/consultations.server");

    const { data: updated, error } = await supabaseAdmin
      .from("consultations")
      .update({ meet_link: data.meetLink })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: "meet_link_updated",
      details: { link: data.meetLink },
    });

    if (data.notify) await sendConsultationConfirmation(updated as never);
    return { saved: true };
  });

/** Histórico completo de uma reunião específica. */
export const getConsultationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [log, emails] = await Promise.all([
      supabaseAdmin
        .from("consultation_audit_log")
        .select("id, action, status, actor_role, details, created_at")
        .eq("consultation_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100)
        .then((r) => r.data ?? []),
      supabaseAdmin
        .from("email_logs")
        .select("id, template_name, status, recipient_email, created_at")
        .ilike("idempotency_key", `%${data.id}%`)
        .order("created_at", { ascending: false })
        .limit(30)
        .then((r) => r.data ?? []),
    ]);
    return { log, emails };
  });

/** Relatórios do módulo: vendas, realizadas, receita, comparecimento. */
export const getConsultationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ days: z.number().int().min(7).max(365).default(30) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("consultations")
      .select("id, status, amount, scheduled_at, created_at, client_name, product_title, meet_link")
      .order("scheduled_at", { ascending: true });

    const all = rows ?? [];
    const paidStatuses = new Set(["scheduled", "completed", "no_show"]);
    const inPeriod = all.filter((r) => (r.created_at ?? "") >= since);

    const revenue = (list: typeof all) =>
      list.filter((r) => paidStatuses.has(r.status)).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

    const completed = all.filter((r) => r.status === "completed").length;
    const noShow = all.filter((r) => r.status === "no_show").length;
    const attendance = completed + noShow > 0 ? Math.round((completed / (completed + noShow)) * 100) : null;

    const nowIso = new Date().toISOString();
    const upcoming = all
      .filter((r) => r.status === "scheduled" && (r.scheduled_at ?? "") >= nowIso)
      .slice(0, 8);

    return {
      sold: all.filter((r) => paidStatuses.has(r.status)).length,
      soldInPeriod: inPeriod.filter((r) => paidStatuses.has(r.status)).length,
      completed,
      cancelled: all.filter((r) => r.status === "cancelled").length,
      noShow,
      // Reservas não pagas nunca entram na receita (paidStatuses acima).
      pendingPayment: all.filter((r) => r.status === "pending_payment" || r.status === "awaiting_payment").length,
      revenueTotal: revenue(all),
      revenuePeriod: revenue(inPeriod),
      attendanceRate: attendance,
      upcoming,
      days: data.days,
    };
  });


/** Recria o evento no Google Calendar/Meet (útil quando a integração estava fora). */
export const regenerateConsultationMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { attachGoogleMeeting, cancelGoogleMeeting } = await import("@/lib/consultations.server");

    const { data: row } = await supabaseAdmin.from("consultations").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");
    if (row.google_event_id) await cancelGoogleMeeting(row as never);

    const result = await attachGoogleMeeting({
      ...(row as Record<string, unknown>),
      google_event_id: null,
    } as never);
    if (!result.ok) throw new Error(result.error);
    return { meetLink: result.meetLink };
  });

/** Lista gravações na pasta do Drive configurada para vincular à reunião. */
export const listConsultationRecordings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    try {
      const { listFolderFiles } = await import("@/lib/google-drive.server");
      return { files: await listFolderFiles(null, 50), error: null as string | null };
    } catch (err) {
      return { files: [], error: (err as Error)?.message ?? "Falha ao listar o Drive" };
    }
  });

/** Vincula o link da gravação e avisa o aluno por e-mail. */
export const attachConsultationRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        recordingUrl: z.string().url().max(600),
        fileId: z.string().max(200).optional(),
        notify: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, sendConsultationRecording } = await import("@/lib/consultations.server");

    const { data: updated, error } = await supabaseAdmin
      .from("consultations")
      .update({ recording_url: data.recordingUrl, recording_file_id: data.fileId || null })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: "recording_attached",
      details: { url: data.recordingUrl },
    });

    if (data.notify) await sendConsultationRecording(updated as never);
    return { saved: true };
  });

/** Dispara manualmente a rotina de lembretes (mesma usada pelo agendador). */
export const runConsultationRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runConsultationReminders } = await import("@/lib/consultations.server");
    return runConsultationReminders();
  });

/* ------------------------- Automações (lembretes) ------------------------- */

/** Painel de monitoramento da rotina automática de lembretes. */
export const getConsultationAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    const [job, logs, upcoming] = await Promise.all([
      supabaseAdmin.from("ops_job_runs").select("*").eq("job", "consultation_reminders").maybeSingle(),
      supabaseAdmin
        .from("consultation_audit_log")
        .select("id, consultation_id, action, status, details, created_at")
        .like("action", "reminder_%")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("consultations")
        .select("id, scheduled_at, reminder_8h_sent_at, reminder_1h_sent_at, meet_link, google_event_id, status")
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(50),
    ]);

    const rows = logs.data ?? [];
    const sent = rows.filter((r) => r.status === "ok");
    const failures = rows.filter((r) => r.status === "error");

    const lastRunAt = job.data?.last_run_at ?? null;
    const nextRunAt = lastRunAt ? new Date(+new Date(lastRunAt) + 15 * 60_000).toISOString() : null;

    return {
      job: job.data ?? null,
      lastRunAt,
      nextRunAt,
      intervalMinutes: 15,
      sentCount: sent.length,
      sent8hCount: sent.filter((r) => r.action === "reminder_8h_sent").length,
      sent1hCount: sent.filter((r) => r.action === "reminder_1h_sent").length,
      failureCount: failures.length,
      recentFailures: failures.slice(0, 20),
      recentSent: sent.slice(0, 20),
      upcoming: upcoming.data ?? [],
    };
  });

/* --------------------- Presença: pendentes de contato --------------------- */

/** Alunos com encontro nas próximas 48h que ainda não confirmaram presença. */
export const getAttendancePanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();

    const { data } = await supabaseAdmin
      .from("consultations")
      .select(
        "id, client_name, client_email, client_phone, product_title, scheduled_at, duration_minutes, meet_link, attendance_requested_at, attendance_confirmed_at, reschedule_count, booking_group, session_index, sessions_total",
      )
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date(now).toISOString())
      .lte("scheduled_at", new Date(now + 48 * 3600_000).toISOString())
      .order("scheduled_at", { ascending: true });

    const rows = data ?? [];
    return {
      pending: rows.filter((r: any) => !r.attendance_confirmed_at),
      confirmed: rows.filter((r: any) => r.attendance_confirmed_at),
      total: rows.length,
    };
  });

/** Reenvia manualmente o pedido de confirmação de presença. */
export const resendAttendanceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");

    const { requestAttendanceConfirmation } = await import("@/lib/consultation-attendance.server");
    await requestAttendanceConfirmation(row as never);
    return { sent: true };
  });

/* ------------------------- Gravações automáticas ------------------------- */


/** Painel Admin → Consultorias → Gravações. */
export const getConsultationRecordingsPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [registry, job, consultations] = await Promise.all([
      supabaseAdmin
        .from("consultation_recordings")
        .select("*")
        .order("drive_created_time", { ascending: false })
        .limit(200)
        .then((r) => r.data ?? []),
      supabaseAdmin.from("ops_job_runs").select("*").eq("job", "consultation_recordings").maybeSingle(),
      supabaseAdmin
        .from("consultations")
        .select("id, product_title, client_name, scheduled_at, status, recording_url")
        .in("status", ["scheduled", "completed", "no_show"])
        .order("scheduled_at", { ascending: false })
        .limit(120)
        .then((r) => r.data ?? []),
    ]);

    const lastRunAt = job.data?.last_run_at ?? null;
    return {
      registry,
      consultations,
      job: job.data ?? null,
      lastRunAt,
      nextRunAt: lastRunAt ? new Date(+new Date(lastRunAt) + 3600_000).toISOString() : null,
      intervalMinutes: 60,
      counts: {
        total: registry.length,
        linked: registry.filter((r) => r.status === "linked").length,
        pending: registry.filter((r) => r.status === "pending").length,
        unmatched: registry.filter((r) => r.status === "unmatched").length,
        failed: registry.filter((r) => r.status === "error" || r.status === "failed").length,
      },
    };
  });

/** Executa a rotina de gravações agora (mesma usada pelo agendador). */
export const runConsultationRecordingsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { syncConsultationRecordings } = await import("@/lib/consultation-recordings.server");
    const result = await syncConsultationRecordings();
    const { auditConsultation } = await import("@/lib/consultations.server");
    await auditConsultation({
      actorId: context.userId,
      actorRole: "admin",
      action: "recordings_sync_manual",
      status: result.driveError ? "error" : "ok",
      details: result as never,
    });
    return result;
  });

/** Reprocessa uma gravação específica (opcionalmente forçando a consultoria). */
export const reprocessConsultationRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fileId: z.string().min(3).max(200),
        consultationId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncConsultationRecordings } = await import("@/lib/consultation-recordings.server");
    const { auditConsultation } = await import("@/lib/consultations.server");

    const { data: row } = await supabaseAdmin
      .from("consultation_recordings")
      .select("*")
      .eq("file_id", data.fileId)
      .maybeSingle();
    if (!row) throw new Error("Gravação não encontrada no registro.");

    await supabaseAdmin
      .from("consultation_recordings")
      .update({
        status: "pending",
        attempts: 0,
        next_attempt_at: null,
        error_message: null,
        match_reason: null,
        consultation_id: data.consultationId ?? null,
      })
      .eq("id", row.id);

    // Vínculo manual: entrega direto na consultoria escolhida pelo admin.
    if (data.consultationId) {
      const { deliverRecordingToConsultation } = await import("@/lib/consultation-recordings.server");
      const url = await deliverRecordingToConsultation(data.fileId, data.consultationId, "Vínculo manual do admin.");
      await auditConsultation({
        consultationId: data.consultationId,
        actorId: context.userId,
        actorRole: "admin",
        action: "recording_manual_linked",
        details: { fileId: data.fileId, url },
      });
      return { linked: 1, manual: true, url };
    }

    const result = await syncConsultationRecordings({ fileId: data.fileId });
    await auditConsultation({
      actorId: context.userId,
      actorRole: "admin",
      action: "recording_reprocessed",
      status: result.failed ? "error" : "ok",
      details: { fileId: data.fileId, ...result } as never,
    });
    return result;
  });

/* ---------------- Envio do relatório em PDF por e-mail ---------------- */

/**
 * Envia o relatório da reunião (PDF gerado no navegador do admin) por e-mail
 * para os destinatários escolhidos (aluno, consultor e/ou e-mails extras).
 */
export const sendConsultationReportEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        recipients: z.array(z.string().trim().email().max(160)).min(1).max(10),
        message: z.string().trim().max(2000).optional(),
        filename: z.string().trim().min(4).max(120),
        pdfBase64: z.string().min(100).max(8_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, formatBR } = await import("@/lib/consultations.server");
    const { sendResendEmail } = await import("@/lib/resend.server");

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("id, client_name, product_title, scheduled_at, duration_minutes")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");

    const recipients = Array.from(new Set(data.recipients.map((e) => e.toLowerCase())));
    const when = formatBR(row.scheduled_at);
    const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a1c;">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px;background:#ffffff;">
    <h1 style="font-size:20px;margin:0 0 12px;">Relatório da consultoria</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 8px;">
      <strong>Aluno:</strong> ${row.client_name || "Aluno"}<br/>
      <strong>Produto:</strong> ${row.product_title}<br/>
      <strong>Data:</strong> ${when} (${row.duration_minutes} min)
    </p>
    ${data.message ? `<p style="font-size:14px;line-height:1.6;white-space:pre-line;margin:16px 0 0;">${data.message.replace(/[<>]/g, "")}</p>` : ""}
    <p style="font-size:13px;color:#6b6b70;margin:20px 0 0;">O relatório completo está em anexo (PDF).</p>
  </div>
</body></html>`;

    await sendResendEmail({
      to: recipients,
      subject: `Relatório da consultoria — ${row.client_name || "Aluno"} · ${when}`,
      html,
      tags: [{ name: "tipo", value: "relatorio_consultoria" }],
      attachments: [{ filename: data.filename, content: data.pdfBase64 }],
    });

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: "report_emailed",
      details: { recipients, filename: data.filename },
    });

    return { sent: true, recipients };
  });

/* ------------------- Preparação automática da reunião ------------------- */

/** Gera (ou regenera) resumo executivo, dados identificados e roteiro sugerido. */
export const generateConsultationPrepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { generateConsultationPrep } = await import("@/lib/consultation-prep.server");
    const { prep, row } = await generateConsultationPrep(data.id, context.userId);
    return { prep, meetingScript: (row as any).meeting_script ?? null };
  });

/** Envia a preparação (dossiê) por e-mail ao Ronnei / consultores. */
export const sendConsultationPrepEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        recipients: z.array(z.string().trim().email().max(160)).max(10).optional(),
        filename: z.string().trim().min(4).max(120).optional(),
        pdfBase64: z.string().min(100).max(8_000_000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { sendConsultationPrepEmail } = await import("@/lib/consultation-prep.server");
    const result = await sendConsultationPrepEmail({
      consultationId: data.id,
      recipients: data.recipients,
      pdf: data.filename && data.pdfBase64 ? { filename: data.filename, base64: data.pdfBase64 } : null,
      actorId: context.userId,
    });
    if ("error" in result && result.error) throw new Error(result.error);
    return result;
  });

/* ------------------------- Pós-reunião ------------------------- */

/** Gera resumo da consultoria + plano de ação a partir das observações. */
export const generateConsultationOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), notes: z.string().trim().min(5).max(10000), save: z.boolean().default(true) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");
    const { loadConsultationDossier } = await import("@/lib/consultation-prep.server");
    const { buildConsultationOutcome } = await import("@/lib/consultation-prep");

    const { row, dossier } = await loadConsultationDossier(data.id);
    const outcome = buildConsultationOutcome({
      notes: data.notes,
      dossier,
      prep: ((row as any).prep_data as any) ?? null,
    });

    if (data.save) {
      await supabaseAdmin
        .from("consultations")
        .update({
          admin_notes: data.notes,
          meeting_summary: outcome.summary,
          action_plan: outcome.actionPlan,
        } as never)
        .eq("id", data.id);
      await auditConsultation({
        consultationId: data.id,
        actorId: context.userId,
        actorRole: "admin",
        action: "outcome_generated",
      });
    }

    return outcome;
  });

/** Envia ao cliente o resumo da consultoria, o plano de ação e o PDF final. */
export const sendConsultationOutcomeToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        recipients: z.array(z.string().trim().email().max(160)).min(1).max(5),
        filename: z.string().trim().min(4).max(120),
        pdfBase64: z.string().min(100).max(8_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, formatBR } = await import("@/lib/consultations.server");
    const { sendResendEmail } = await import("@/lib/resend.server");

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("id, client_name, product_title, scheduled_at, meeting_summary, action_plan")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");
    if (!String(row.meeting_summary ?? "").trim()) {
      throw new Error("Gere o resumo da consultoria antes de enviar ao cliente.");
    }

    const clean = (v: unknown) => String(v ?? "").replace(/[<>]/g, "");
    const recipients = Array.from(new Set(data.recipients.map((e) => e.toLowerCase())));
    const when = formatBR(row.scheduled_at);
    const plan = String(row.action_plan ?? "").trim();

    const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a1c;">
  <div style="max-width:580px;margin:0 auto;padding:28px 24px;background:#ffffff;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ff6a00;margin:0 0 6px;font-weight:bold;">Ronnei na Veia</p>
    <h1 style="font-size:20px;margin:0 0 6px;">Resumo da sua consultoria</h1>
    <p style="font-size:13px;color:#6b6b70;margin:0 0 18px;">${clean(row.product_title)} · ${clean(when)}</p>
    <p style="font-size:14px;line-height:1.65;white-space:pre-line;margin:0;">${clean(row.meeting_summary)}</p>
    ${plan ? `<h2 style="font-size:15px;margin:22px 0 8px;">Seu plano de ação</h2><p style="font-size:14px;line-height:1.7;white-space:pre-line;margin:0;">${clean(plan)}</p>` : ""}
    <p style="font-size:13px;color:#6b6b70;margin:22px 0 0;">O relatório completo em PDF está em anexo. Qualquer dúvida, é só responder este e-mail.</p>
  </div>
</body></html>`;

    await sendResendEmail({
      to: recipients,
      subject: `Resumo e plano de ação da sua consultoria — ${clean(when)}`,
      html,
      tags: [{ name: "tipo", value: "resumo_consultoria_cliente" }],
      attachments: [{ filename: data.filename, content: data.pdfBase64 }],
    });

    await supabaseAdmin
      .from("consultations")
      .update({ client_report_sent_at: new Date().toISOString() } as never)
      .eq("id", data.id);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: "client_report_emailed",
      details: { recipients },
    });

    return { sent: true, recipients };
  });

/* ------------------- Combo (várias sessões, mesma compra) ------------------- */

/** Todas as sessões do combo ao qual esta consultoria pertence (ordenadas). */
export const getConsultationGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");

    const group = (row as any).booking_group as string | null;
    if (!group) return { sessions: [row] };

    const { data: sessions } = await supabaseAdmin
      .from("consultations")
      .select("*")
      .eq("booking_group", group)
      .order("session_index", { ascending: true })
      .order("scheduled_at", { ascending: true });

    return { sessions: (sessions?.length ? sessions : [row]) as any[] };
  });

/**
 * Envia por e-mail o pacote final do combo: PDF consolidado + um PDF por
 * encontro. Os PDFs são gerados no navegador do admin e vêm em base64.
 */
export const sendConsultationComboReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        recipients: z.array(z.string().trim().email().max(160)).min(1).max(5),
        message: z.string().trim().max(2000).optional(),
        attachments: z
          .array(
            z.object({
              filename: z.string().trim().min(4).max(140),
              base64: z.string().min(100).max(8_000_000),
            }),
          )
          .min(1)
          .max(8),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, formatBR } = await import("@/lib/consultations.server");
    const { sendResendEmail } = await import("@/lib/resend.server");

    const { data: row } = await supabaseAdmin
      .from("consultations")
      .select("id, booking_group, client_name, product_title, scheduled_at, sessions_total")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");

    const group = (row as any).booking_group as string | null;
    const { data: sessions } = group
      ? await supabaseAdmin
          .from("consultations")
          .select("id, session_index, scheduled_at, meeting_summary")
          .eq("booking_group", group)
          .order("session_index", { ascending: true })
      : { data: [row as any] };

    const rows = (sessions ?? []) as any[];
    if (!rows.some((s) => String(s.meeting_summary ?? "").trim())) {
      throw new Error("Gere o resumo de pelo menos um encontro antes de enviar o relatório final.");
    }

    const clean = (v: unknown) => String(v ?? "").replace(/[<>]/g, "");
    const recipients = Array.from(new Set(data.recipients.map((e) => e.toLowerCase())));

    const agenda = rows
      .map(
        (s, i) =>
          `<li style="margin:0 0 4px;">Encontro ${s.session_index ?? i + 1} — ${clean(formatBR(s.scheduled_at))}</li>`,
      )
      .join("");

    const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a1c;">
  <div style="max-width:580px;margin:0 auto;padding:28px 24px;background:#ffffff;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ff6a00;margin:0 0 6px;font-weight:bold;">Ronnei na Veia</p>
    <h1 style="font-size:20px;margin:0 0 6px;">Relatório final da sua consultoria</h1>
    <p style="font-size:13px;color:#6b6b70;margin:0 0 18px;">${clean(row.product_title)} · ${rows.length} encontro(s)</p>
    <ul style="font-size:14px;line-height:1.6;margin:0 0 16px 18px;padding:0;">${agenda}</ul>
    ${data.message ? `<p style="font-size:14px;line-height:1.65;white-space:pre-line;margin:0 0 16px;">${clean(data.message)}</p>` : ""}
    <p style="font-size:13px;color:#6b6b70;margin:0;">Em anexo: o relatório consolidado do programa e o relatório individual de cada encontro (PDF).</p>
  </div>
</body></html>`;

    await sendResendEmail({
      to: recipients,
      subject: `Relatório final da consultoria — ${clean(row.client_name || "Aluno")}`,
      html,
      tags: [{ name: "tipo", value: "relatorio_final_combo" }],
      attachments: data.attachments.map((a) => ({ filename: a.filename, content: a.base64 })),
    });

    const now = new Date().toISOString();
    if (group) {
      await supabaseAdmin
        .from("consultations")
        .update({ client_report_sent_at: now } as never)
        .eq("booking_group", group);
    } else {
      await supabaseAdmin
        .from("consultations")
        .update({ client_report_sent_at: now } as never)
        .eq("id", data.id);
    }

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: "client_report_emailed",
      details: { recipients, combo: true, attachments: data.attachments.length, sessions: rows.length },
    });

    return { sent: true, recipients, attachments: data.attachments.length };
  });


/* --------------------- Grade de disponibilidade (presets) --------------------- */

/** Cria várias janelas de uma vez (ex.: seg–sex 09:00–12:00), opcionalmente limpando a grade. */
export const applyAvailabilityPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        windows: z
          .array(
            z.object({
              start_time: z.string().regex(/^\d{2}:\d{2}$/),
              end_time: z.string().regex(/^\d{2}:\d{2}$/),
            }),
          )
          .min(1)
          .max(4),
        slot_interval_minutes: z.number().int().min(15).max(240).default(60),
        replace: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation } = await import("@/lib/consultations.server");

    for (const w of data.windows) {
      if (w.end_time <= w.start_time) throw new Error("Horário final deve ser maior que o inicial.");
    }

    if (data.replace) {
      await supabaseAdmin.from("consultation_availability").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    const rows = data.weekdays.flatMap((weekday) =>
      data.windows.map((w) => ({
        weekday,
        start_time: w.start_time,
        end_time: w.end_time,
        slot_interval_minutes: data.slot_interval_minutes,
        active: true,
      })),
    );

    const { error } = await supabaseAdmin.from("consultation_availability").insert(rows);
    if (error) throw new Error(`Falha ao aplicar grade: ${error.message}`);

    await auditConsultation({
      actorId: context.userId,
      actorRole: "admin",
      action: "availability_preset_applied",
      details: { created: rows.length, replace: data.replace },
    });

    return { created: rows.length };
  });

/** Simula a grade: mostra quantos horários de 1h estão realmente disponíveis nos próximos dias. */
export const previewAvailableSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ durationMinutes: z.number().int().min(30).max(600).default(60), days: z.number().int().min(1).max(60).default(14) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { computeAvailableSlots } = await import("@/lib/consultations.server");
    const slots = await computeAvailableSlots(data.durationMinutes, data.days);
    return { total: slots.length, next: slots.slice(0, 12) };
  });

/* ---------------------- Reprocessamento de falhas Google ---------------------- */

/** Reuniões pagas/confirmadas que ficaram sem evento no Google, sem link do Meet ou sem e-mail de confirmação. */
export const getGoogleSyncIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("consultations")
      .select(
        "id, product_title, client_name, client_email, scheduled_at, ends_at, status, google_event_id, meet_link, confirmation_sent_at, booking_group, session_index, sessions_total",
      )
      .eq("status", "scheduled")
      .gte("scheduled_at", since)
      .order("scheduled_at", { ascending: true })
      .limit(200);

    const issues = (rows ?? [])
      .map((r) => {
        const problems: string[] = [];
        if (!r.google_event_id) problems.push("sem evento no Google");
        if (!r.meet_link) problems.push("sem link do Meet");
        if (!r.confirmation_sent_at) problems.push("sem e-mail de confirmação");
        return { ...r, problems };
      })
      .filter((r) => r.problems.length > 0);

    const { data: errors } = await supabaseAdmin
      .from("consultation_audit_log")
      .select("id, consultation_id, action, details, created_at")
      .eq("status", "error")
      .order("created_at", { ascending: false })
      .limit(20);

    return { issues, errors: errors ?? [] };
  });

/** Recria evento/Meet e reenvia a confirmação das reuniões com falha. */
export const retryGoogleSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { attachGoogleMeeting, sendConsultationConfirmation, auditConsultation } = await import(
      "@/lib/consultations.server"
    );

    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const id of data.ids) {
      const { data: row } = await supabaseAdmin.from("consultations").select("*").eq("id", id).maybeSingle();
      if (!row) {
        results.push({ id, ok: false, error: "Consultoria não encontrada" });
        continue;
      }

      let meetOk = Boolean(row.google_event_id && row.meet_link);
      let error: string | undefined;

      if (!meetOk) {
        const res = await attachGoogleMeeting(row as never);
        meetOk = res.ok;
        if (!res.ok) error = res.error;
      }

      if (meetOk && !row.confirmation_sent_at) {
        const { data: fresh } = await supabaseAdmin.from("consultations").select("*").eq("id", id).maybeSingle();
        try {
          await sendConsultationConfirmation((fresh ?? row) as never);
        } catch (err) {
          error = (err as Error)?.message ?? "Falha ao reenviar confirmação";
        }
      }

      await auditConsultation({
        consultationId: id,
        actorId: context.userId,
        actorRole: "admin",
        action: "google_sync_retry",
        status: error ? "error" : "ok",
        ...(error ? { details: { error } } : {}),
      });

      results.push(error ? { id, ok: false, error } : { id, ok: true });
    }

    return {
      results,
      recovered: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
  });
