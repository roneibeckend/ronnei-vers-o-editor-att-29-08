// Estado da assinatura recorrente Fidelize (fonte: Asaas) → área do aluno.
// A assinatura só muda de estado no app depois que o Asaas confirma o evento
// (pagamento recebido, vencido, cancelado ou estorno).

import { logSystemEvent } from "./system-log.server";

export type FidelizeSubscriptionStatus = "active" | "overdue" | "canceled" | "pending";

export type FidelizeAccountRow = {
  id: string;
  user_id: string;
  plan: string;
  order_id: string | null;
  status: string;
  subscription_status: string | null;
  request_payload: Record<string, any> | null;
};

/** Último provisionamento Fidelize do aluno (independente do status). */
export async function getLatestFidelizeLog(userId: string): Promise<FidelizeAccountRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("fidelize_provisioning_logs")
    .select("id, user_id, plan, order_id, status, subscription_status, request_payload")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FidelizeAccountRow | null) ?? null;
}

async function updateLog(id: string, patch: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("fidelize_provisioning_logs")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}

/** Assinaturas recorrentes Fidelize do aluno no Asaas. */
export async function listFidelizeAsaasSubscriptions(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseExternalReference, getAsaasConfig, asaasRequest } = await import("./asaas.server");

  const { data: paymentRows } = await supabaseAdmin
    .from("payments")
    .select("customer_id, external_reference")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (paymentRows ?? []) as Record<string, any>[];
  const customerIds = Array.from(
    new Set(
      rows
        .filter((row) => parseExternalReference(row["external_reference"])?.productType === "fidelize")
        .map((row) => row["customer_id"])
        .filter(Boolean),
    ),
  ) as string[];

  if (!customerIds.length) return { subscriptions: [] as any[], customerIds };

  const config = await getAsaasConfig();
  const subscriptions: any[] = [];
  for (const customerId of customerIds.slice(0, 5)) {
    try {
      const result = await asaasRequest(config, `/subscriptions?customer=${customerId}&limit=50`, "GET");
      for (const sub of result?.data ?? []) {
        const ref = parseExternalReference(sub?.externalReference);
        const isFidelize = ref?.productType === "fidelize" || /fidelize/i.test(String(sub?.description ?? ""));
        if (isFidelize) subscriptions.push(sub);
      }
    } catch {
      /* falha de listagem não deve derrubar o fluxo */
    }
  }
  return { subscriptions, customerIds };
}

/** Cancelamento solicitado pelo aluno: cancela no Asaas e só então reflete no app. */
export async function cancelFidelizeSubscriptionForUser(userId: string) {
  const record = await getLatestFidelizeLog(userId);
  if (!record) return { success: false, message: "Nenhuma assinatura Fidelize encontrada na sua conta." };

  const { getAsaasConfig, asaasRequest } = await import("./asaas.server");
  const { subscriptions } = await listFidelizeAsaasSubscriptions(userId);
  const active = subscriptions.filter(
    (s) => !["INACTIVE", "CANCELLED", "CANCELED", "EXPIRED"].includes(String(s?.status ?? "").toUpperCase()),
  );

  const now = new Date().toISOString();
  const canceled: string[] = [];
  const failed: string[] = [];

  if (active.length) {
    const config = await getAsaasConfig();
    for (const sub of active) {
      try {
        await asaasRequest(config, `/subscriptions/${sub.id}`, "DELETE");
        canceled.push(String(sub.id));
      } catch {
        failed.push(String(sub.id));
      }
    }
  }

  if (failed.length && !canceled.length) {
    return {
      success: false,
      message: "Não conseguimos cancelar sua assinatura agora. Tente novamente em alguns minutos.",
    };
  }

  await updateLog(record.id, {
    subscription_status: "canceled",
    cancel_requested_at: now,
    subscription_canceled_at: now,
    subscription_id: canceled[0] ?? null,
    lifecycle_status: "canceled",
  });

  await logSystemEvent({
    level: "info",
    source: "fidelize",
    message: `Assinatura Fidelize cancelada pelo aluno (${canceled.length} recorrência(s) encerrada(s) no Asaas).`,
    details: { userId, canceled, failed, plan: record.plan },
    userId,
  });

  try {
    const { notifyAdmin } = await import("./admin-notify.server");
    await notifyAdmin({
      type: "system",
      severity: "warning",
      title: "Fidelize: cancelamento solicitado pelo aluno",
      body: `${canceled.length} assinatura(s) recorrente(s) cancelada(s) no Asaas.`,
      link: "/admin/integracoes",
      dedupKey: `fidelize_cancel_${record.id}_${now.slice(0, 10)}`,
      metadata: { userId, plan: record.plan },
    });
  } catch {
    /* best-effort */
  }

  return {
    success: true,
    canceled,
    message: active.length
      ? "Assinatura cancelada. Você continua com acesso até o fim do período já pago."
      : "Sua assinatura já não possuía cobrança recorrente ativa. Marcamos como cancelada.",
  };
}

/** Marca a intenção de reativar (o acesso só volta quando o Asaas confirmar o pagamento). */
export async function markFidelizeReactivationRequested(userId: string) {
  const record = await getLatestFidelizeLog(userId);
  if (!record) return null;
  await updateLog(record.id, { subscription_status: "pending" });
  return record;
}

/** Pagamento recorrente confirmado no Asaas: mantém/retoma o acesso do aluno. */
export async function applyFidelizeRecurringPayment(params: {
  userId: string;
  paymentId: string;
  plan: string;
  dueDate?: string | null;
  subscriptionId?: string | null;
}) {
  const record = await getLatestFidelizeLog(params.userId);
  if (!record || record.status !== "success") return { renewal: false as const, record };

  const now = new Date().toISOString();
  await updateLog(record.id, {
    subscription_status: "active",
    last_payment_at: now,
    last_payment_id: params.paymentId,
    next_due_date: params.dueDate ?? null,
    overdue_since: null,
    ...(record.subscription_status === "active" ? {} : { reactivated_at: now }),
    ...(params.subscriptionId ? { subscription_id: params.subscriptionId } : {}),
  });

  await logSystemEvent({
    level: "info",
    source: "fidelize",
    message: "Cobrança mensal Fidelize confirmada — acesso mantido.",
    details: { userId: params.userId, paymentId: params.paymentId, plan: params.plan },
    userId: params.userId,
  });

  return { renewal: true as const, record };
}

/** Fatura recorrente vencida/estornada/cancelada no Asaas. */
export async function applyFidelizeSubscriptionSignal(params: {
  userId: string;
  status: Extract<FidelizeSubscriptionStatus, "overdue" | "canceled">;
  paymentId?: string | null;
}) {
  const record = await getLatestFidelizeLog(params.userId);
  if (!record) return { applied: false as const };

  const now = new Date().toISOString();
  await updateLog(record.id, {
    subscription_status: params.status,
    ...(params.status === "overdue" ? { overdue_since: now } : { subscription_canceled_at: now }),
  });

  await logSystemEvent({
    level: "warning",
    source: "fidelize",
    message:
      params.status === "overdue"
        ? "Assinatura Fidelize marcada como vencida (fatura em atraso no Asaas)."
        : "Assinatura Fidelize marcada como cancelada (evento do Asaas).",
    details: { userId: params.userId, paymentId: params.paymentId ?? null },
    userId: params.userId,
  });

  return { applied: true as const };
}
