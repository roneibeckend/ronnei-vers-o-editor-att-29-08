import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getAdminRecipients,
  notifyAdmins,
  notifyUser,
  sendPayoutEmail,
  formatBRL,
  formatDateBR,
} from "@/lib/payouts-helpers.server";

const requestPayoutSchema = z.object({
  amount: z.number().positive("O valor deve ser maior que zero."),
  method: z.string().default("pix"),
  pix_key: z.string().trim().min(5, "Informe uma chave PIX válida.").max(140),
  user_type: z.enum(["affiliate", "partner"]).default("affiliate"),
  document_path: z.string().trim().max(500).optional(),
});

const updateStatusSchema = z.object({
  payoutId: z.string().uuid(),
  status: z.enum(["pending", "analyzing", "approved", "paid", "rejected", "cancelled"]),
  notes: z.string().trim().max(1000).optional(),
  rejectionReason: z.string().trim().max(500).optional(),
});

const payoutIdSchema = z.object({
  payoutId: z.string().uuid(),
});

const requestDocumentSchema = z.object({
  payoutId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso negado.");
}

async function getProfileBrief(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  return { name: (data?.name as string) || "Usuário", email: (data?.email as string) || null };
}

/**
 * Solicitação de saque pelo afiliado/sócio.
 * Toda a validação de saldo, concorrência e documento acontece atomicamente no banco.
 */
export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requestPayoutSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Afiliados só podem sacar com e-mail confirmado (exigência de compliance).
    if (data.user_type === "affiliate") {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("email_verified_at")
        .eq("id", context.userId)
        .maybeSingle();

      if (!profile?.email_verified_at) {
        throw new Error(
          "Confirme seu e-mail no perfil antes de solicitar o primeiro saque como afiliado.",
        );
      }
    }

    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;
    const userAgent = getRequestHeader("user-agent") || undefined;



    const { data: payoutId, error } = await context.supabase.rpc("request_payout_atomic", {
      p_amount: data.amount,
      p_method: data.method,
      p_pix_key: data.pix_key,
      p_user_type: data.user_type,
      p_document_url: data.document_path || undefined,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (error) throw new Error(error.message);

    // Notificações e e-mails (não bloqueiam o fluxo em caso de falha)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const profile = await getProfileBrief(supabaseAdmin, context.userId);
      const amountFmt = formatBRL(data.amount);
      const dateFmt = formatDateBR();

      await notifyUser(
        context.userId,
        "Solicitação de saque recebida",
        `Recebemos seu pedido de saque de R$ ${amountFmt}. Nossa equipe irá analisar e você será avisado a cada atualização.`,
        { payout_id: payoutId, amount: data.amount },
      );

      await notifyAdmins(
        "Novo pedido de saque",
        `${profile.name} solicitou um saque de R$ ${amountFmt} via PIX.`,
        { payout_id: payoutId, user_id: context.userId, amount: data.amount },
      );

      await sendPayoutEmail("saque_solicitado", profile.email, {
        name: profile.name,
        amount: amountFmt,
        pix_key: data.pix_key,
        date: dateFmt,
      });

      const origin = getRequestHeader("origin") || "https://skewer-success-lab.lovable.app";
      const admins = await getAdminRecipients();
      await Promise.all(
        admins.map((admin) =>
          sendPayoutEmail("saque_admin_novo", admin.email, {
            name: profile.name,
            email: profile.email || "-",
            amount: amountFmt,
            pix_key: data.pix_key,
            date: dateFmt,
            link: `${origin}/admin/financeiro`,
          }),
        ),
      );
    } catch (notifyErr) {
      console.error("[payouts] Falha ao notificar solicitação de saque:", notifyErr);
    }

    return { success: true, payoutId };
  });

/** Cancelamento do saque pelo próprio usuário (somente enquanto pendente). */
export const cancelMyPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payoutIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_payout", {
      p_payout_id: data.payoutId,
    });
    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Reenvio de documento quando o admin solicita nova validação. */
export const resubmitPayoutDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ payoutId: z.string().uuid(), document_path: z.string().trim().min(1).max(500) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: payout, error: fetchError } = await context.supabase
      .from("payout_requests")
      .select("id, user_id, status, document_status")
      .eq("id", data.payoutId)
      .single();

    if (fetchError || !payout) throw new Error("Solicitação não encontrada.");
    if (payout.user_id !== context.userId) throw new Error("Acesso negado.");
    if (payout.status === "paid" || payout.status === "cancelled") {
      throw new Error("Esta solicitação já foi finalizada.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        document_url: data.document_path,
        document_status: "pending",
        document_uploaded_at: new Date().toISOString(),
      } as any)
      .eq("id", data.payoutId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    await supabaseAdmin.from("payout_audit_log").insert({
      payout_id: data.payoutId,
      actor_id: context.userId,
      action: "document_resubmitted",
      details: { path: data.document_path },
    });


    return { success: true };
  });

/** Histórico de saques do usuário logado. */
export const getPayoutHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payout_requests")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  });

/**
 * Atualização de status pelo admin.
 * O PIX é enviado manualmente pelo administrador fora do painel; marcar como
 * 'paid' apenas registra a baixa (nenhuma transferência automática é disparada).
 * Recusa/cancelamento estorna o saldo automaticamente (via função no banco).
 */
export const adminUpdatePayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    if (data.status === "rejected" && !data.rejectionReason?.trim()) {
      throw new Error("Informe o motivo da recusa.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Busca dados atuais para o fluxo de pagamento e notificações
    const { data: payout, error: fetchError } = await supabaseAdmin
      .from("payout_requests")
      .select("*")
      .eq("id", data.payoutId)
      .single();

    if (fetchError || !payout) throw new Error("Solicitação não encontrada.");

    // Pagamento manual: o admin envia o PIX por fora e apenas registra a baixa aqui.


    const { data: result, error: rpcError } = await context.supabase.rpc(
      "admin_set_payout_status",
      {
        p_payout_id: data.payoutId,
        p_status: data.status,
        p_notes: data.notes || undefined,
        p_rejection_reason: data.rejectionReason || undefined,
      },
    );

    if (rpcError) throw new Error(rpcError.message);

    // Notificações e e-mails por status
    try {
      const profile = await getProfileBrief(supabaseAdmin, payout.user_id);
      const amountFmt = formatBRL(Number(payout.amount));
      const dateFmt = formatDateBR();

      const notifications: Record<string, { title: string; message: string; template?: string }> = {
        analyzing: {
          title: "Saque em análise",
          message: `Seu saque de R$ ${amountFmt} está sendo analisado pela nossa equipe.`,
          template: "saque_em_analise",
        },
        approved: {
          title: "Saque aprovado!",
          message: `Seu saque de R$ ${amountFmt} foi aprovado e será enviado em até 4 horas úteis.`,
          template: "saque_aprovado",
        },
        paid: {
          title: "Saque enviado!",
          message: `Seu saque de R$ ${amountFmt} foi enviado para sua chave PIX. Obrigado por fazer parte da nossa plataforma!`,
          template: "saque_pago",
        },
        rejected: {
          title: "Saque não aprovado",
          message: `Seu saque de R$ ${amountFmt} não foi aprovado. Motivo: ${data.rejectionReason}. O valor foi estornado para seu saldo.`,
          template: "saque_recusado",
        },
        cancelled: {
          title: "Saque cancelado",
          message: `Seu saque de R$ ${amountFmt} foi cancelado e o valor estornado para seu saldo.`,
        },
      };

      const config = notifications[data.status];
      if (config) {
        await notifyUser(payout.user_id, config.title, config.message, {
          payout_id: payout.id,
          status: data.status,
        });

        if (config.template) {
          await sendPayoutEmail(config.template, profile.email, {
            name: profile.name,
            amount: amountFmt,
            pix_key: payout.pix_key || "-",
            date: dateFmt,
            reason: data.rejectionReason || "-",
          });
        }
      }
    } catch (notifyErr) {
      console.error("[payouts] Falha ao notificar mudança de status:", notifyErr);
    }

    return { success: true, result };
  });

/** Admin solicita novo documento de identidade para o saque. */
export const adminRequestPayoutDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requestDocumentSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { error } = await context.supabase.rpc("admin_request_payout_document", {
      p_payout_id: data.payoutId,
      p_notes: data.notes || undefined,
    });
    if (error) throw new Error(error.message);

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: payout } = await supabaseAdmin
        .from("payout_requests")
        .select("user_id, amount")
        .eq("id", data.payoutId)
        .single();

      if (payout) {
        await notifyUser(
          payout.user_id,
          "Documentação solicitada",
          `Precisamos de um novo documento de identidade para prosseguir com seu saque de R$ ${formatBRL(Number(payout.amount))}. Acesse sua área financeira para reenviar.`,
          { payout_id: data.payoutId },
        );
      }
    } catch (notifyErr) {
      console.error("[payouts] Falha ao notificar solicitação de documento:", notifyErr);
    }

    return { success: true };
  });

/** Gera URL assinada (5 min) para o admin visualizar o documento de identidade. */
export const getPayoutDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payoutIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: payout, error } = await context.supabase
      .from("payout_requests")
      .select("document_url")
      .eq("id", data.payoutId)
      .single();

    if (error || !payout) throw new Error("Solicitação não encontrada.");
    const path = (payout as any).document_url as string | null;
    if (!path) throw new Error("Nenhum documento anexado a esta solicitação.");

    const { data: signed, error: signError } = await context.supabase.storage
      .from("identity-documents")
      .createSignedUrl(path, 300);

    if (signError || !signed) throw new Error("Não foi possível gerar o acesso ao documento.");
    return { url: signed.signedUrl };
  });

/** Histórico de auditoria de um saque (admin). */
export const getPayoutAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payoutIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: logs, error } = await context.supabase
      .from("payout_audit_log" as any)
      .select("*")
      .eq("payout_id", data.payoutId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return logs || [];
  });

/** Lista completa de saques com dados do usuário (admin/manager). */
export const adminListPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isManager } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "manager",
    });
    if (!isAdmin && !isManager) throw new Error("Acesso negado.");

    const { data, error } = await context.supabase
      .from("payout_requests")
      .select("*, profiles:user_id(name, email)")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  });


/** Dados financeiros do sócio logado. */
export const getPartnerFinancials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: balance } = await supabaseAdmin
      .from("partner_balances")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: partnerInfo } = await supabaseAdmin
      .from("financial_partners")
      .select("percent, name")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      balance: balance?.balance || 0,
      total_withdrawn: balance?.total_withdrawn || 0,
      percent: partnerInfo?.percent || 0,
      name: partnerInfo?.name || "Sócio",
    };
  });
