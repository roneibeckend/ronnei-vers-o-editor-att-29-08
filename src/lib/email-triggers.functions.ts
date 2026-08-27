import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Disparos de e-mail transacionais do fluxo do aluno.
 *
 * Cada função valida o solicitante e usa `triggerEmailOnce` para não enviar
 * o mesmo e-mail duas vezes (idempotência por chave de evento).
 */

/** Boas-vindas: público, mas só para contas criadas nos últimos 30 minutos. */
export const sendWelcomeEmailPublic = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
    return { email };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { triggerEmailOnce } = await import("@/lib/resend.server");
    const { LINKS } = await import("@/emails/layout");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, created_at, email_notifications_opt_in")
      .eq("email", data.email)
      .maybeSingle();

    if (!profile) return { sent: false, reason: "profile_not_found" };
    if ((profile as any).email_notifications_opt_in === false) {
      return { sent: false, reason: "opt_out" };
    }

    const createdAt = new Date((profile as any).created_at || 0).getTime();
    if (!createdAt || Date.now() - createdAt > 30 * 60 * 1000) {
      return { sent: false, reason: "not_recent_signup" };
    }

    await triggerEmailOnce({
      event: "welcome",
      to: data.email,
      data: {
        name: (profile as any).name || data.email.split("@")[0],
        dashboard_url: LINKS.dashboard,
      },
      idempotencyKey: `welcome_${(profile as any).id}`,
    });

    return { sent: true };
  });

/** Confirmação de abertura de chamado (enviado ao próprio aluno). */
export const notifySupportTicketCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string; message: string }) => ({
    ticket_id: String(input?.ticket_id || ""),
    message: String(input?.message || ""),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { triggerEmailOnce } = await import("@/lib/resend.server");
    const { LINKS } = await import("@/emails/layout");

    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject")
      .eq("id", data.ticket_id)
      .maybeSingle();

    if (!ticket || (ticket as any).user_id !== context.userId) {
      return { sent: false, reason: "ticket_not_found" };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, email_notifications_opt_in")
      .eq("id", context.userId)
      .maybeSingle();

    // Alerta imediato para a equipe na central administrativa
    try {
      const { notifyAdmin } = await import("@/lib/admin-notify.server");
      await notifyAdmin({
        type: "support",
        severity: "warning",
        title: "🎧 Novo chamado de suporte",
        body: `${(profile as any)?.name || "Aluno"}: ${(ticket as any).subject || data.message || "Sem assunto"}`,
        entityType: "support_ticket",
        entityId: String((ticket as any).id),
        link: "/admin/suporte",
        dedupKey: `support:${(ticket as any).id}`,
        metadata: { ticket_id: (ticket as any).id, user_id: context.userId },
      });
    } catch (err) {
      console.warn("[suporte] Falha ao notificar admins:", err);
    }

    if (!profile?.email || (profile as any).email_notifications_opt_in === false) {
      return { sent: false, reason: "no_email_or_opt_out" };
    }

    await triggerEmailOnce({
      event: "support_received",
      to: profile.email,
      data: {
        name: (profile as any).name || "Aluno",
        message: data.message || (ticket as any).subject || "Chamado aberto.",
        ticket_id: `TCK-${String((ticket as any).id).slice(0, 8).toUpperCase()}`,
        link: `${LINKS.dashboard}/suporte`,
      },
      idempotencyKey: `support_received_${(ticket as any).id}`,
    });

    return { sent: true };
  });

/** Resposta do suporte (somente admin; enviado ao dono do chamado). */
export const notifySupportReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticket_id: string; message: string; message_id?: string }) => ({
    ticket_id: String(input?.ticket_id || ""),
    message: String(input?.message || ""),
    message_id: input?.message_id ? String(input.message_id) : undefined,
  }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { triggerEmailOnce } = await import("@/lib/resend.server");
    const { LINKS } = await import("@/emails/layout");

    const { data: ticket } = await supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject")
      .eq("id", data.ticket_id)
      .maybeSingle();

    if (!ticket) return { sent: false, reason: "ticket_not_found" };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, email_notifications_opt_in")
      .eq("id", (ticket as any).user_id)
      .maybeSingle();

    if (!profile?.email || (profile as any).email_notifications_opt_in === false) {
      return { sent: false, reason: "no_email_or_opt_out" };
    }

    await triggerEmailOnce({
      event: "support_reply",
      to: profile.email,
      data: {
        name: (profile as any).name || "Aluno",
        message: data.message,
        ticket_id: `TCK-${String((ticket as any).id).slice(0, 8).toUpperCase()}`,
        link: `${LINKS.dashboard}/suporte`,
      },
      idempotencyKey: `support_reply_${data.message_id || `${(ticket as any).id}_${Date.now()}`}`,
    });

    return { sent: true };
  });

/** Conclusão de treinamento (curso ou e-book) — enviado uma única vez. */
export const notifyContentCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { content_id: string; content_type: "course" | "ebook"; title?: string }) => ({
    content_id: String(input?.content_id || ""),
    content_type: input?.content_type === "ebook" ? ("ebook" as const) : ("course" as const),
    title: input?.title ? String(input.title) : undefined,
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { triggerEmailOnce } = await import("@/lib/resend.server");
    const { LINKS } = await import("@/emails/layout");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, email_notifications_opt_in")
      .eq("id", context.userId)
      .maybeSingle();

    if (!profile?.email || (profile as any).email_notifications_opt_in === false) {
      return { sent: false, reason: "no_email_or_opt_out" };
    }

    let title = data.title;
    if (!title) {
      const { data: content } = await supabaseAdmin
        .from(data.content_type === "ebook" ? "ebooks" : "courses")
        .select("title")
        .eq("id", data.content_id)
        .maybeSingle();
      title = (content as any)?.title || (data.content_type === "ebook" ? "E-book" : "Treinamento");
    }

    await triggerEmailOnce({
      event: "course_completed",
      to: profile.email,
      data: {
        name: (profile as any).name || "Aluno",
        title,
        link: `${LINKS.dashboard}/certificados`,
      },
      idempotencyKey: `completed_${context.userId}_${data.content_type}_${data.content_id}`,
    });

    return { sent: true };
  });
