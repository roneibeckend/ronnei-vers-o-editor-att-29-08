import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 3 — Financeiro e Assinaturas (ações administrativas).
 *
 * Todas as ações exigem papel admin, motivo (quando alteram estado) e são
 * registradas em public.admin_audit_log com responsável e data/hora.
 */

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function auditFinance(input: {
  action: string;
  studentId?: string | null;
  adminId: string;
  reason?: string | null;
  productType?: string | null;
  productId?: string | null;
  productName?: string | null;
  details?: Record<string, unknown>;
  message: string;
  level?: "info" | "warning" | "error";
}) {
  const db = await admin();
  await db.from("admin_audit_log").insert({
    action: input.action,
    target_user_id: input.studentId ?? null,
    actor_id: input.adminId,
    product_type: input.productType ?? null,
    product_id: input.productId ?? null,
    product_name: input.productName ?? null,
    reason: input.reason ?? null,
    details: input.details ?? {},
  });

  const { logSystemEvent } = await import("@/lib/system-log.server");
  await logSystemEvent({
    level: input.level ?? "info",
    source: "admin-financeiro",
    message: input.message,
    details: {
      action: input.action,
      student_id: input.studentId ?? null,
      admin_id: input.adminId,
      reason: input.reason ?? null,
      ...(input.details ?? {}),
    },
    userId: input.adminId,
  });
}

const reasonSchema = z
  .string()
  .trim()
  .min(5, "Informe um motivo com pelo menos 5 caracteres.")
  .max(500);

function normalizeStatus(raw: string | null | undefined) {
  const s = (raw || "").toUpperCase();
  if (["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(s)) return "paid";
  if (s === "PENDING" || s === "AWAITING_RISK_ANALYSIS") return "pending";
  if (s === "OVERDUE") return "overdue";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(s))
    return "refunded";
  if (s === "CANCELED" || s === "CANCELLED" || s === "DELETED") return "canceled";
  return s.toLowerCase() || "unknown";
}

function subscriptionBucket(sub: any): "active" | "canceled" | "overdue" | "expired" {
  const status = (sub?.status || "").toUpperCase();
  if (status === "EXPIRED") return "expired";
  if (status === "INACTIVE" || status === "CANCELLED" || status === "CANCELED") return "canceled";
  if (status === "OVERDUE") return "overdue";
  return "active";
}

/** 1) Histórico financeiro completo do aluno. */
export const getStudentFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ studentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { parseExternalReference } = await import("@/lib/asaas.server");

    const { data: paymentRows } = await db
      .from("payments")
      .select(
        "id, external_id, amount, net_amount, fee, status, billing_type, external_reference, customer_id, metadata, confirmed_at, created_at",
      )
      .eq("user_id", data.studentId)
      .order("created_at", { ascending: false })
      .limit(200);

    const payments = (paymentRows ?? []).map((p: any) => {
      const ref = parseExternalReference(p.external_reference);
      return {
        id: p.id as string,
        externalId: p.external_id as string,
        amount: Number(p.amount ?? 0),
        netAmount: Number(p.net_amount ?? 0),
        status: p.status as string,
        statusKind: normalizeStatus(p.status),
        billingType: (p.billing_type ?? null) as string | null,
        productType: ref?.productType ?? null,
        productId: ref?.productId ?? null,
        confirmedAt: (p.confirmed_at ?? null) as string | null,
        createdAt: p.created_at as string,
      };
    });

    // Estornos registrados no painel (auditoria financeira).
    const { data: refundRows } = await db
      .from("admin_audit_log")
      .select("id, action, product_type, product_name, product_id, reason, details, created_at, actor_id")
      .eq("target_user_id", data.studentId)
      .in("action", ["payment_refunded", "payment_refund_failed", "subscription_canceled"])
      .order("created_at", { ascending: false })
      .limit(100);

    const actorIds = Array.from(new Set((refundRows ?? []).map((r: any) => r.actor_id).filter(Boolean)));
    let actors: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profiles } = await db.from("profiles").select("id, name, email").in("id", actorIds);
      actors = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.name || p.email || p.id]));
    }

    const refunds = (refundRows ?? []).map((r: any) => ({
      id: r.id as string,
      action: r.action as string,
      amount: Number((r.details as any)?.amount ?? 0),
      productName: (r.product_name ?? null) as string | null,
      reason: (r.reason ?? null) as string | null,
      createdAt: r.created_at as string,
      actor: r.actor_id ? actors[r.actor_id] ?? "Administrador" : "Sistema",
    }));

    // Faturas e assinaturas no Asaas (quando houver cliente vinculado).
    const customerIds = Array.from(
      new Set((paymentRows ?? []).map((p: any) => p.customer_id).filter(Boolean)),
    ) as string[];

    let invoices: any[] = [];
    let subscriptions: any[] = [];
    let asaasError: string | null = null;

    if (customerIds.length) {
      try {
        const { getAsaasConfig, asaasRequest } = await import("@/lib/asaas.server");
        const config = await getAsaasConfig();

        for (const customerId of customerIds.slice(0, 3)) {
          const inv = await asaasRequest(config, `/payments?customer=${customerId}&limit=50`, "GET");
          for (const item of inv?.data ?? []) {
            invoices.push({
              id: item.id as string,
              description: (item.description ?? item.externalReference ?? "Fatura") as string,
              amount: Number(item.value ?? 0),
              status: item.status as string,
              statusKind: normalizeStatus(item.status),
              dueDate: (item.dueDate ?? null) as string | null,
              invoiceUrl: (item.invoiceUrl ?? null) as string | null,
              subscriptionId: (item.subscription ?? null) as string | null,
            });
          }

          const subs = await asaasRequest(config, `/subscriptions?customer=${customerId}&limit=50`, "GET");
          for (const item of subs?.data ?? []) {
            subscriptions.push({
              id: item.id as string,
              description: (item.description ?? item.externalReference ?? "Assinatura") as string,
              amount: Number(item.value ?? 0),
              status: item.status as string,
              bucket: subscriptionBucket(item),
              cycle: (item.cycle ?? null) as string | null,
              nextDueDate: (item.nextDueDate ?? null) as string | null,
            });
          }
        }
      } catch (err: any) {
        asaasError = err?.message || "Não foi possível consultar o Asaas.";
      }
    }

    const totalPaid = payments
      .filter((p) => p.statusKind === "paid")
      .reduce((sum, p) => sum + p.amount, 0);
    const totalRefunded = payments
      .filter((p) => p.statusKind === "refunded")
      .reduce((sum, p) => sum + p.amount, 0);

    return { payments, invoices, subscriptions, refunds, totalPaid, totalRefunded, asaasError };
  });

/** 2) Estorno administrativo (com revogação de acesso opcional). */
export const adminRegisterRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        reason: reasonSchema,
        revokeAccess: z.boolean().default(false),
        refundInAsaas: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { parseExternalReference } = await import("@/lib/asaas.server");

    const { data: payment } = await db
      .from("payments")
      .select("id, external_id, user_id, amount, status, external_reference")
      .eq("id", data.paymentId)
      .maybeSingle();

    if (!payment) throw new Error("Pagamento não encontrado.");
    if (normalizeStatus(payment.status) === "refunded") {
      throw new Error("Este pagamento já está registrado como estornado.");
    }

    const ref = parseExternalReference(payment.external_reference);
    let productName: string | null = null;
    if (ref?.productType && ref?.productId) {
      const table = ref.productType === "course" ? "courses" : "ebooks";
      const { data: prod } = await db.from(table).select("title").eq("id", ref.productId).maybeSingle();
      productName = prod?.title ?? ref.productId;
    }

    let asaasRefund: string | null = null;
    if (data.refundInAsaas && payment.external_id) {
      try {
        const { getAsaasConfig, asaasRequest } = await import("@/lib/asaas.server");
        const config = await getAsaasConfig();
        const result = await asaasRequest(
          config,
          `/payments/${payment.external_id}/refund`,
          "POST",
          { description: data.reason.slice(0, 200) },
        );
        asaasRefund = (result?.status as string) ?? "REFUND_REQUESTED";
      } catch (err: any) {
        await auditFinance({
          action: "payment_refund_failed",
          studentId: payment.user_id,
          adminId: context.userId,
          reason: data.reason,
          level: "error",
          message: `Falha ao estornar no Asaas o pagamento ${payment.external_id}: ${err?.message ?? err}`,
          details: { payment_id: payment.id, amount: Number(payment.amount ?? 0) },
        });
        throw new Error(`Estorno no Asaas falhou: ${err?.message || "erro desconhecido"}`);
      }
    }

    const { error: updateError } = await db
      .from("payments")
      .update({ status: "REFUNDED", updated_at: new Date().toISOString() })
      .eq("id", payment.id);

    if (updateError) throw new Error(updateError.message);

    let accessRevoked = false;
    if (data.revokeAccess && payment.user_id && ref?.productType && ref?.productId) {
      const table = ref.productType === "course" ? "course_enrollments" : "ebook_enrollments";
      const column = ref.productType === "course" ? "course_id" : "ebook_id";
      const { error: delError } = await db
        .from(table)
        .delete()
        .eq("user_id", payment.user_id)
        .eq(column, ref.productId);
      accessRevoked = !delError;

      if (accessRevoked) {
        await auditFinance({
          action: "access_revoked",
          studentId: payment.user_id,
          adminId: context.userId,
          reason: `Estorno: ${data.reason}`,
          productType: ref.productType,
          productId: ref.productId,
          productName,
          level: "warning",
          message: `Acesso revogado por estorno: ${productName ?? ref.productId}`,
        });
      }
    }

    await auditFinance({
      action: "payment_refunded",
      studentId: payment.user_id,
      adminId: context.userId,
      reason: data.reason,
      productType: ref?.productType ?? null,
      productId: ref?.productId ?? null,
      productName,
      level: "warning",
      message: `Estorno registrado (R$ ${Number(payment.amount ?? 0).toFixed(2)}) — pagamento ${payment.external_id}`,
      details: {
        payment_id: payment.id,
        external_id: payment.external_id,
        amount: Number(payment.amount ?? 0),
        asaas_refund: asaasRefund,
        access_revoked: accessRevoked,
      },
    });

    return { success: true as const, accessRevoked, asaasRefund };
  });

/** 3) Assinaturas — visão geral (ativas, canceladas, inadimplentes, expiradas). */
export const listSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();

    let items: any[] = [];
    let asaasError: string | null = null;

    try {
      const { getAsaasConfig, asaasRequest } = await import("@/lib/asaas.server");
      const config = await getAsaasConfig();
      const result = await asaasRequest(config, `/subscriptions?limit=${data.limit ?? 100}`, "GET");
      items = result?.data ?? [];
    } catch (err: any) {
      asaasError = err?.message || "Não foi possível consultar o Asaas.";
    }

    // Vincula ao aluno pela referência externa quando disponível.
    const { parseExternalReference } = await import("@/lib/asaas.server");
    const userIds = Array.from(
      new Set(
        items
          .map((s: any) => parseExternalReference(s.externalReference)?.userId)
          .filter(Boolean) as string[],
      ),
    );

    let students: Record<string, { name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profiles } = await db.from("profiles").select("id, name, email").in("id", userIds);
      students = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, { name: p.name ?? null, email: p.email ?? null }]),
      );
    }

    const subscriptions = items.map((s: any) => {
      const ref = parseExternalReference(s.externalReference);
      const student = ref?.userId ? students[ref.userId] : undefined;
      return {
        id: s.id as string,
        description: (s.description ?? s.externalReference ?? "Assinatura") as string,
        amount: Number(s.value ?? 0),
        status: s.status as string,
        bucket: subscriptionBucket(s),
        cycle: (s.cycle ?? null) as string | null,
        nextDueDate: (s.nextDueDate ?? null) as string | null,
        customerId: (s.customer ?? null) as string | null,
        studentId: ref?.userId ?? null,
        studentName: student?.name ?? null,
        studentEmail: student?.email ?? null,
        productId: ref?.productId ?? null,
        productType: ref?.productType ?? null,
      };
    });

    const counts = {
      active: subscriptions.filter((s) => s.bucket === "active").length,
      canceled: subscriptions.filter((s) => s.bucket === "canceled").length,
      overdue: subscriptions.filter((s) => s.bucket === "overdue").length,
      expired: subscriptions.filter((s) => s.bucket === "expired").length,
    };

    return { subscriptions, counts, asaasError };
  });

/** 4) Cancelamento de assinatura via Asaas. */
export const adminCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        subscriptionId: z.string().min(1),
        reason: reasonSchema,
        studentId: z.string().uuid().nullable().optional(),
        description: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    try {
      const { getAsaasConfig, asaasRequest } = await import("@/lib/asaas.server");
      const config = await getAsaasConfig();
      await asaasRequest(config, `/subscriptions/${data.subscriptionId}`, "DELETE");
    } catch (err: any) {
      await auditFinance({
        action: "subscription_cancel_failed",
        studentId: data.studentId ?? null,
        adminId: context.userId,
        reason: data.reason,
        level: "error",
        message: `Falha ao cancelar assinatura ${data.subscriptionId}: ${err?.message ?? err}`,
        details: { subscription_id: data.subscriptionId },
      });
      throw new Error(err?.message || "Falha ao cancelar a assinatura no Asaas.");
    }

    await auditFinance({
      action: "subscription_canceled",
      studentId: data.studentId ?? null,
      adminId: context.userId,
      reason: data.reason,
      productName: data.description ?? null,
      level: "warning",
      message: `Assinatura cancelada: ${data.subscriptionId}`,
      details: { subscription_id: data.subscriptionId },
    });

    return { success: true as const };
  });

/** 5) Auditoria financeira geral (para o painel de assinaturas). */
export const getFinanceAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();

    const { data: rows, error } = await db
      .from("admin_audit_log")
      .select("id, action, product_name, reason, details, created_at, actor_id, target_user_id")
      .in("action", [
        "payment_refunded",
        "payment_refund_failed",
        "subscription_canceled",
        "subscription_cancel_failed",
      ])
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);

    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set([
        ...(rows ?? []).map((r: any) => r.actor_id),
        ...(rows ?? []).map((r: any) => r.target_user_id),
      ].filter(Boolean)),
    );

    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profiles } = await db.from("profiles").select("id, name, email").in("id", ids);
      names = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.name || p.email || p.id]));
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      action: r.action as string,
      productName: (r.product_name ?? null) as string | null,
      reason: (r.reason ?? null) as string | null,
      amount: Number((r.details as any)?.amount ?? 0),
      createdAt: r.created_at as string,
      actor: r.actor_id ? names[r.actor_id] ?? "Administrador" : "Sistema",
      student: r.target_user_id ? names[r.target_user_id] ?? null : null,
    }));
  });
