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
  duration_minutes: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  price: z.number().min(0).max(100000),
  status: z.enum(["draft", "coming_soon", "active"]),
  briefing_required: z.boolean(),
  affiliate_enabled: z.boolean(),
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
        status: z.enum(["pending_payment", "scheduled", "completed", "cancelled", "no_show"]),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsultation, cancelGoogleMeeting } = await import("@/lib/consultations.server");

    const { data: row } = await supabaseAdmin.from("consultations").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Consultoria não encontrada.");

    if (data.status === "cancelled" && row.google_event_id) {
      await cancelGoogleMeeting(row as never);
    }

    const { error } = await supabaseAdmin
      .from("consultations")
      .update({
        status: data.status,
        admin_notes: data.notes ?? row.admin_notes,
        completed_at: data.status === "completed" ? new Date().toISOString() : row.completed_at,
        cancel_reason: data.status === "cancelled" ? data.notes || "Cancelado pelo admin" : row.cancel_reason,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await auditConsultation({
      consultationId: data.id,
      actorId: context.userId,
      actorRole: "admin",
      action: `status_${data.status}`,
      details: { notes: data.notes ?? null },
    });
    return { saved: true };
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
