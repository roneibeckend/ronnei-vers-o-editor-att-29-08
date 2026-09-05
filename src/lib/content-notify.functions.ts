import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ContentSchema = z.object({
  contentType: z.enum(["ebook", "course"]),
  contentId: z.string().min(1),
});

const NotifySchema = ContentSchema.extend({
  force: z.boolean().optional().default(false),
});

const CampaignSchema = z.object({
  campaignId: z.string().uuid(),
});

async function assertAdmin(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });

  if (error || !isAdmin) {
    throw new Error("Acesso negado: permissão de administrador necessária.");
  }
}

async function loadContent(db: any, contentType: "ebook" | "course", contentId: string) {
  const table = contentType === "ebook" ? "ebooks" : "courses";
  const { data: content, error } = await db
    .from(table)
    .select("id, title, description, status")
    .eq("id", contentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!content) throw new Error("Conteúdo não encontrado.");
  return content;
}

async function loadEligibleStudents(db: any) {
  const { data, error } = await db
    .from("profiles")
    .select("id, email, name, email_notifications_opt_in")
    .eq("status", "student")
    .not("email", "is", null)
    .or("email_notifications_opt_in.eq.true,email_notifications_opt_in.is.null")
    .limit(5000);

  if (error) throw new Error(error.message);

  const unique = new Map<string, any>();
  for (const student of data || []) {
    const email = String(student.email || "").trim().toLowerCase();
    if (!email || student.email_notifications_opt_in === false) continue;
    if (!unique.has(email)) unique.set(email, { ...student, email });
  }

  return Array.from(unique.values());
}

async function findPreviousNotification(
  db: any,
  contentType: "ebook" | "course",
  contentId: string,
) {
  const { data, error } = await db
    .from("content_notifications")
    .select("id, created_at, recipients_count, sent_count")
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function findActiveCampaign(
  db: any,
  contentType: "ebook" | "course",
  contentId: string,
) {
  const { data, error } = await db
    .from("content_email_campaigns")
    .select("id, status, total_recipients, sent_count, failed_count, created_at")
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export const previewNewContentNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => ContentSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const content = await loadContent(db, data.contentType, data.contentId);
    const previous = await findPreviousNotification(db, data.contentType, data.contentId);
    const activeCampaign = await findActiveCampaign(db, data.contentType, data.contentId);

    if (content.status !== "active") {
      return {
        success: true,
        canSend: false,
        contentId: content.id,
        contentType: data.contentType,
        title: content.title,
        status: content.status,
        recipients: 0,
        alreadySent: Boolean(previous),
        activeCampaign: null,
        reason:
          data.contentType === "course"
            ? "Este curso ainda não está publicado. Publique o curso antes de avisar os alunos."
            : "Este eBook ainda não está publicado. Publique o eBook antes de avisar os alunos.",
      };
    }

    if (activeCampaign) {
      return {
        success: true,
        canSend: false,
        contentId: content.id,
        contentType: data.contentType,
        title: content.title,
        status: content.status,
        recipients: Number(activeCampaign.total_recipients) || 0,
        alreadySent: Boolean(previous),
        activeCampaign: activeCampaign.id,
        reason:
          "Já existe uma campanha de e-mail em andamento para este conteúdo. Acompanhe o histórico antes de criar outra.",
      };
    }

    const students = await loadEligibleStudents(db);

    if (students.length === 0) {
      return {
        success: true,
        canSend: false,
        contentId: content.id,
        contentType: data.contentType,
        title: content.title,
        status: content.status,
        recipients: 0,
        alreadySent: Boolean(previous),
        reason: "Nenhum aluno elegível para receber este e-mail.",
      };
    }

    return {
      success: true,
      canSend: true,
      contentId: content.id,
      contentType: data.contentType,
      title: content.title,
      status: content.status,
      recipients: students.length,
      alreadySent: Boolean(previous),
      sentAt: previous?.created_at ?? null,
      previousSentCount: Number(previous?.sent_count) || 0,
    };
  });

export const notifyNewContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => NotifySchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const content = await loadContent(db, data.contentType, data.contentId);

    if (content.status !== "active") {
      throw new Error(
        data.contentType === "course"
          ? "Envio bloqueado: publique o curso antes de avisar os alunos."
          : "Envio bloqueado: publique o eBook antes de avisar os alunos.",
      );
    }

    const activeCampaign = await findActiveCampaign(db, data.contentType, data.contentId);
    if (activeCampaign) {
      return {
        success: false,
        alreadyQueued: true,
        campaignId: activeCampaign.id,
        recipients: Number(activeCampaign.total_recipients) || 0,
        message: "Já existe uma campanha em andamento para este conteúdo.",
      };
    }

    const previous = await findPreviousNotification(db, data.contentType, data.contentId);
    if (previous && !data.force) {
      return {
        success: false,
        alreadySent: true,
        sentAt: previous.created_at,
        sentCount: Number(previous.sent_count) || 0,
        recipients: Number(previous.recipients_count) || 0,
        message: "Este conteúdo já foi anunciado por e-mail.",
      };
    }

    const recipients = await loadEligibleStudents(db);
    if (recipients.length === 0) {
      return {
        success: false,
        alreadySent: false,
        recipients: 0,
        sentCount: 0,
        error: "Nenhum aluno elegível para receber este e-mail.",
      };
    }

    const event = data.contentType === "ebook" ? "new_ebook" : "new_course";
    const link =
      data.contentType === "ebook"
        ? `https://ronneinaveia.com.br/app/ebooks/${content.id}`
        : `https://ronneinaveia.com.br/app/cursos/${content.id}`;

    const { data: campaign, error: campaignError } = await db
      .from("content_email_campaigns")
      .insert({
        content_type: data.contentType,
        content_id: content.id,
        title: content.title,
        event,
        payload: { description: content.description || null, link },
        status: "queued",
        total_recipients: recipients.length,
        sent_count: 0,
        failed_count: 0,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (campaignError) throw new Error(campaignError.message);

    const rows = recipients.map((student: any) => ({
      campaign_id: campaign.id,
      user_id: student.id,
      email: student.email,
      name: student.name || "Aluno",
      status: "queued",
      attempts: 0,
    }));

    try {
      for (let index = 0; index < rows.length; index += 500) {
        const { error: recipientsError } = await db
          .from("content_email_recipients")
          .insert(rows.slice(index, index + 500));
        if (recipientsError) throw recipientsError;
      }
    } catch (error: any) {
      await db.from("content_email_campaigns").delete().eq("id", campaign.id);
      throw new Error(
        "Falha ao congelar a lista de destinatários: " +
          (error?.message || "erro desconhecido"),
      );
    }

    return {
      success: true,
      queued: true,
      campaignId: campaign.id,
      recipients: recipients.length,
      sentCount: 0,
      message: "Campanha criada. O envio será processado em lotes.",
    };
  });

export const listContentEmailCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data, error } = await db
      .from("content_email_campaigns")
      .select(
        "id, content_type, content_id, title, status, total_recipients, sent_count, failed_count, created_at, started_at, completed_at, next_run_at, last_error",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return data || [];
  });

export const getContentEmailCampaignRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => CampaignSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: rows, error } = await db
      .from("content_email_recipients")
      .select(
        "id, email, name, status, attempts, last_error, provider_message_id, sent_at, updated_at",
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw new Error(error.message);
    return rows || [];
  });

export const retryContentEmailCampaignFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => CampaignSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: failedRows, error: failedError } = await db
      .from("content_email_recipients")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed");

    if (failedError) throw new Error(failedError.message);

    if (!failedRows?.length) {
      return {
        success: false,
        retried: 0,
        message: "Esta campanha não possui falhas para reenviar.",
      };
    }

    const { error: resetError } = await db
      .from("content_email_recipients")
      .update({
        status: "queued",
        attempts: 0,
        last_error: null,
        next_retry_at: null,
        provider_message_id: null,
        sent_at: null,
      })
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed");

    if (resetError) throw new Error(resetError.message);

    await db
      .from("content_email_campaigns")
      .update({
        status: "queued",
        completed_at: null,
        next_run_at: null,
        last_error: null,
        failed_count: 0,
      })
      .eq("id", data.campaignId);

    return { success: true, retried: failedRows.length };
  });

export const listContentNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data, error } = await db
      .from("content_notifications")
      .select("content_type, content_id, title, recipients_count, sent_count, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);
    return data || [];
  });
