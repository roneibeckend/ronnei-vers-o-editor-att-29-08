import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 1 — Suporte e Recuperação de Acesso (ações administrativas).
 *
 * Todas as ações:
 *  - exigem papel admin;
 *  - registram auditoria em public.system_logs (source: "admin-suporte");
 *  - retornam sucesso/falha explícito para o painel.
 *
 * Nenhuma destas ações altera permissões, papéis ou matrículas.
 */

const TRANSACTIONAL_EVENTS = [
  "welcome",
  "payment_approved",
  "access_granted",
  "invoice_created",
  "payout_requested",
  "payout_paid",
] as const;

export type TransactionalEvent = (typeof TRANSACTIONAL_EVENTS)[number];

const emailSchema = z.string().trim().toLowerCase().email("Informe um e-mail válido.");

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

async function loadStudent(studentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, email_verified_at")
    .eq("id", studentId)
    .maybeSingle();
  if (!profile) throw new Error("Aluno não encontrado.");
  return { supabaseAdmin, profile: profile as any };
}

async function audit(input: {
  action: string;
  message: string;
  studentId: string;
  adminId: string;
  details?: Record<string, unknown>;
  level?: "info" | "warning" | "error";
}) {
  const { logSystemEvent } = await import("@/lib/system-log.server");
  await logSystemEvent({
    level: input.level ?? "info",
    source: "admin-suporte",
    message: input.message,
    details: {
      action: input.action,
      student_id: input.studentId,
      admin_id: input.adminId,
      ...(input.details ?? {}),
    },
    userId: input.adminId,
  });
}

/** 1) Reset de senha administrativo — envia link de redefinição ao aluno. */
export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ studentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin, profile } = await loadStudent(data.studentId);
    if (!profile.email) throw new Error("Este aluno não possui e-mail cadastrado.");

    const { LINKS, BRAND } = await import("@/emails/layout");
    const { triggerEmailEvent } = await import("@/lib/resend.server");

    try {
      const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: profile.email,
        options: { redirectTo: `${BRAND.site}/auth/callback` },
      });
      if (error) throw new Error(error.message);

      const resetUrl = (link as any)?.properties?.action_link;
      if (!resetUrl) throw new Error("Não foi possível gerar o link de redefinição.");

      await triggerEmailEvent({
        event: "password_reset",
        to: profile.email,
        data: {
          name: profile.name || profile.email.split("@")[0],
          reset_url: resetUrl,
          link: resetUrl,
        },
      });

      await audit({
        action: "password_reset_sent",
        message: `Reset de senha enviado para ${profile.email}`,
        studentId: data.studentId,
        adminId: context.userId,
        details: { email: profile.email },
      });

      return { success: true as const, email: profile.email };
    } catch (err: any) {
      await audit({
        action: "password_reset_failed",
        level: "error",
        message: `Falha ao enviar reset de senha para ${profile.email}: ${err?.message ?? err}`,
        studentId: data.studentId,
        adminId: context.userId,
        details: { email: profile.email },
      });
      throw new Error(err?.message || "Falha ao enviar o e-mail de redefinição.");
    }
  });

/** 2) Reenvio de confirmação de e-mail — novo código de 6 dígitos. */
export const adminResendEmailConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ studentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin, profile } = await loadStudent(data.studentId);
    if (!profile.email) throw new Error("Este aluno não possui e-mail cadastrado.");
    if (profile.email_verified_at) {
      return { success: true as const, alreadyVerified: true as const, email: profile.email };
    }

    const { triggerEmailEvent } = await import("@/lib/resend.server");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

    try {
      const { error } = await supabaseAdmin.from("email_verifications").insert({
        user_id: data.studentId,
        email: profile.email,
        code,
        expires_at: expiresAt,
      });
      if (error) throw new Error(error.message);

      await triggerEmailEvent({
        event: "email_confirmation",
        to: profile.email,
        data: {
          name: profile.name || profile.email.split("@")[0],
          code,
          codigo: code,
          expires_in: "30 minutos",
        },
      });

      await audit({
        action: "email_confirmation_resent",
        message: `Código de confirmação reenviado (admin) para ${profile.email}`,
        studentId: data.studentId,
        adminId: context.userId,
        details: { email: profile.email, expires_at: expiresAt },
      });

      return { success: true as const, alreadyVerified: false as const, email: profile.email, expiresAt };
    } catch (err: any) {
      await audit({
        action: "email_confirmation_failed",
        level: "error",
        message: `Falha ao reenviar confirmação para ${profile.email}: ${err?.message ?? err}`,
        studentId: data.studentId,
        adminId: context.userId,
      });
      throw new Error(err?.message || "Falha ao reenviar a confirmação de e-mail.");
    }
  });

const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (v?: string | null) =>
  new Date(v || Date.now()).toLocaleDateString("pt-BR");

/** 3) Reenvio de e-mails transacionais com dados reais do aluno. */
export const adminResendTransactionalEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        studentId: z.string().uuid(),
        event: z.enum(TRANSACTIONAL_EVENTS),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin, profile } = await loadStudent(data.studentId);
    if (!profile.email) throw new Error("Este aluno não possui e-mail cadastrado.");

    const { LINKS } = await import("@/emails/layout");
    const { triggerEmailEvent } = await import("@/lib/resend.server");
    const name = profile.name || profile.email.split("@")[0];

    try {
      let payload: Record<string, any> = { name };

      if (data.event === "welcome") {
        payload = { name, dashboard_url: LINKS.dashboard };
      }

      if (data.event === "payment_approved" || data.event === "access_granted" || data.event === "invoice_created") {
        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("amount, billing_type, status, confirmed_at, created_at, metadata, external_id")
          .eq("user_id", data.studentId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!payment) {
          throw new Error("Nenhum pagamento encontrado para este aluno — não é possível reenviar este e-mail.");
        }

        const meta = ((payment as any).metadata ?? {}) as Record<string, any>;
        const productName =
          meta.product_name || meta.product_title || meta.description || "Acesso à plataforma";

        if (data.event === "payment_approved") {
          payload = {
            name,
            product_name: productName,
            amount: money((payment as any).amount),
            method: (payment as any).billing_type || "PIX",
            date: dateBR((payment as any).confirmed_at || (payment as any).created_at),
            link: `${LINKS.dashboard}/perfil`,
          };
        } else if (data.event === "access_granted") {
          payload = {
            name,
            product_name: productName,
            amount: money((payment as any).amount),
            date: dateBR((payment as any).confirmed_at || (payment as any).created_at),
            access_link: `${LINKS.dashboard}/cursos`,
          };
        } else {
          payload = {
            name,
            amount: money((payment as any).amount),
            due_date: dateBR((payment as any).created_at),
            invoice_url:
              meta.invoice_url ||
              meta.payment_url ||
              ((payment as any).external_id
                ? `https://www.asaas.com/i/${(payment as any).external_id}`
                : `${LINKS.dashboard}/perfil`),
            status: (payment as any).status || "Aguardando pagamento",
          };
        }
      }

      if (data.event === "payout_requested" || data.event === "payout_paid") {
        const { data: payout } = await supabaseAdmin
          .from("payout_requests")
          .select("amount, pix_key, status, created_at, updated_at")
          .eq("user_id", data.studentId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!payout) {
          throw new Error("Nenhuma solicitação de saque encontrada para este aluno.");
        }

        payload = {
          name,
          amount: money((payout as any).amount),
          pix_key: (payout as any).pix_key || "—",
          date: dateBR(
            data.event === "payout_paid" ? (payout as any).updated_at : (payout as any).created_at,
          ),
          link: `${LINKS.dashboard}/afiliados/saques`,
        };
      }

      await triggerEmailEvent({ event: data.event, to: profile.email, data: payload });

      await audit({
        action: "transactional_email_resent",
        message: `E-mail transacional "${data.event}" reenviado para ${profile.email}`,
        studentId: data.studentId,
        adminId: context.userId,
        details: { event: data.event, email: profile.email },
      });

      return { success: true as const, event: data.event, email: profile.email };
    } catch (err: any) {
      await audit({
        action: "transactional_email_failed",
        level: "error",
        message: `Falha ao reenviar "${data.event}" para ${profile.email}: ${err?.message ?? err}`,
        studentId: data.studentId,
        adminId: context.userId,
        details: { event: data.event },
      });
      throw new Error(err?.message || "Falha ao reenviar o e-mail transacional.");
    }
  });

/** 4) Correção de e-mail do aluno — registra valor anterior, novo e responsável. */
export const adminUpdateStudentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ studentId: z.string().uuid(), email: emailSchema, reason: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin, profile } = await loadStudent(data.studentId);

    const previousEmail = (profile.email as string | null) || null;
    if (previousEmail && previousEmail.toLowerCase() === data.email) {
      throw new Error("O novo e-mail é igual ao atual.");
    }

    const { data: conflict } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .neq("id", data.studentId)
      .maybeSingle();
    if (conflict) throw new Error("Este e-mail já está em uso por outro cadastro.");

    try {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.studentId, {
        email: data.email,
        email_confirm: true,
      });
      if (authError) throw new Error(authError.message);

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ email: data.email })
        .eq("id", data.studentId);
      if (profileError) throw new Error(profileError.message);

      await audit({
        action: "student_email_updated",
        message: `E-mail do aluno alterado de ${previousEmail ?? "(vazio)"} para ${data.email}`,
        studentId: data.studentId,
        adminId: context.userId,
        details: {
          previous_email: previousEmail,
          new_email: data.email,
          reason: data.reason ?? null,
        },
      });

      return { success: true as const, previousEmail, email: data.email };
    } catch (err: any) {
      await audit({
        action: "student_email_update_failed",
        level: "error",
        message: `Falha ao alterar e-mail do aluno ${previousEmail ?? data.studentId}: ${err?.message ?? err}`,
        studentId: data.studentId,
        adminId: context.userId,
        details: { previous_email: previousEmail, new_email: data.email },
      });
      throw new Error(err?.message || "Falha ao alterar o e-mail do aluno.");
    }
  });
