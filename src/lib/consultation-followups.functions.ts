import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Acompanhamentos do aluno (pendentes, agendados e concluídos). */
export const listMyFollowups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("consultation_followups")
      .select("*")
      .eq("user_id", context.userId)
      .order("followup_date", { ascending: true });

    const ids = (rows ?? []).map((r: any) => r.consultation_id);
    const { data: consultations } = ids.length
      ? await supabaseAdmin
          .from("consultations")
          .select("id, product_title, scheduled_at, completed_at, action_plan")
          .in("id", ids)
      : { data: [] as any[] };

    const byId = new Map((consultations ?? []).map((c: any) => [c.id, c]));

    return (rows ?? []).map((r: any) => {
      const consultation = byId.get(r.consultation_id);
      const dueAt = new Date(`${r.followup_date}T12:00:00-03:00`);
      const daysLeft = Math.ceil((+dueAt - Date.now()) / 86_400_000);
      return {
        id: r.id,
        consultationId: r.consultation_id,
        consultationTitle: consultation?.product_title ?? "Consultoria",
        consultationDate: consultation?.completed_at ?? consultation?.scheduled_at ?? null,
        followupDate: r.followup_date,
        daysLeft,
        available: daysLeft <= 0,
        meetingDate: r.meeting_date,
        meetLink: r.meet_link,
        status: r.status,
      };
    });
  });

/** Horários livres de 30 minutos para a reunião de feedback. */
export const getFollowupSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { followupSlots } = await import("@/lib/consultation-followups.server");
    return followupSlots();
  });

/** Agenda a reunião de feedback (30 min) e cria o evento no Google Calendar. */
export const scheduleFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ followupId: z.string().uuid(), startIso: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { scheduleFollowupMeeting } = await import("@/lib/consultation-followups.server");
    const row = await scheduleFollowupMeeting({
      followupId: data.followupId,
      userId: context.userId,
      startIso: data.startIso,
    });
    return {
      id: row.id,
      meetingDate: row.meeting_date,
      meetLink: row.meet_link,
      status: row.status,
    };
  });

/** Cancela a reunião marcada; o acompanhamento volta para pendente. */
export const cancelFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ followupId: z.string().uuid(), reason: z.string().trim().max(200).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { cancelFollowupMeeting } = await import("@/lib/consultation-followups.server");
    return cancelFollowupMeeting({
      followupId: data.followupId,
      userId: context.userId,
      reason: data.reason ?? null,
    });
  });

/* ------------------------------ Admin ------------------------------ */

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso restrito.");
}

/** Painel: lista completa + métricas de comparecimento e implementação. */
export const listFollowupsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("consultation_followups")
      .select("*")
      .order("followup_date", { ascending: false })
      .limit(500);

    const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id))];
    const consultationIds = [...new Set((rows ?? []).map((r: any) => r.consultation_id))];

    const [{ data: profiles }, { data: consultations }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, name, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] } as any),
      consultationIds.length
        ? supabaseAdmin
            .from("consultations")
            .select("id, product_title, completed_at, scheduled_at")
            .in("id", consultationIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    const consultationById = new Map<string, any>((consultations ?? []).map((c: any) => [c.id, c]));

    const items = (rows ?? []).map((r: any) => ({
      id: r.id,
      status: r.status,
      followupDate: r.followup_date,
      meetingDate: r.meeting_date,
      meetLink: r.meet_link,
      attended: r.attended,
      methodImplemented: r.method_implemented,
      feedbackNotes: r.feedback_notes,
      studentName: profileById.get(r.user_id)?.name ?? "—",
      studentEmail: profileById.get(r.user_id)?.email ?? "—",
      consultationTitle: consultationById.get(r.consultation_id)?.product_title ?? "Consultoria",
      consultationDate:
        consultationById.get(r.consultation_id)?.completed_at ??
        consultationById.get(r.consultation_id)?.scheduled_at ??
        null,
    }));

    const completed = items.filter((i) => i.status === "completed");
    const withAttendance = completed.filter((i) => i.attended !== null);
    const withImplementation = completed.filter((i) => i.methodImplemented !== null);

    return {
      items,
      metrics: {
        pending: items.filter((i) => i.status === "pending").length,
        scheduled: items.filter((i) => i.status === "scheduled").length,
        completed: completed.length,
        cancelled: items.filter((i) => i.status === "cancelled").length,
        attendanceRate: withAttendance.length
          ? Math.round((withAttendance.filter((i) => i.attended).length / withAttendance.length) * 100)
          : null,
        implementationRate: withImplementation.length
          ? Math.round(
              (withImplementation.filter((i) => i.methodImplemented).length / withImplementation.length) * 100,
            )
          : null,
      },
    };
  });

/** Admin registra o resultado da reunião de feedback. */
export const updateFollowupResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        followupId: z.string().uuid(),
        attended: z.boolean().optional().nullable(),
        methodImplemented: z.boolean().optional().nullable(),
        feedbackNotes: z.string().trim().max(2000).optional().nullable(),
        status: z.enum(["pending", "scheduled", "completed", "cancelled"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditFollowup } = await import("@/lib/consultation-followups.server");

    const patch: Record<string, unknown> = {};
    if (data.attended !== undefined) patch["attended"] = data.attended;
    if (data.methodImplemented !== undefined) patch["method_implemented"] = data.methodImplemented;
    if (data.feedbackNotes !== undefined) patch["feedback_notes"] = data.feedbackNotes;
    if (data.status) {
      patch["status"] = data.status;
      if (data.status === "completed") patch["completed_at"] = new Date().toISOString();
    }

    const { data: row, error } = await supabaseAdmin
      .from("consultation_followups")
      .update(patch as never)
      .eq("id", data.followupId)
      .select("id, user_id, consultation_id")
      .maybeSingle();

    if (error || !row) throw new Error("Não foi possível salvar o resultado.");

    await auditFollowup({
      action: "result_updated",
      followupId: (row as any).id,
      consultationId: (row as any).consultation_id,
      actorId: context.userId,
      targetUserId: (row as any).user_id,
      details: patch,
    });

    return { ok: true };
  });
