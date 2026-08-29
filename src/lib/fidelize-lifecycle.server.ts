// Sincronização de ciclo de vida Fidelize → Ronnei.
// Quando uma conta com origem "ronnei" faz upgrade, downgrade ou cancelamento
// diretamente na Fidelize, a Fidelize dispara um webhook para cá. A partir daí
// a Fidelize passa a ser a fonte da verdade da assinatura: cancelamos a cobrança
// recorrente no Asaas, marcamos o aluno como migrado e registramos auditoria.

import { logSystemEvent } from "./system-log.server";
import { fidelizePlanLabel, isFidelizePlan } from "./fidelize-plans";

export type FidelizeLifecycleEventType = "upgrade" | "downgrade" | "cancellation" | "reactivation";

export type FidelizeLifecyclePayload = {
  eventId?: string | null;
  event: string;
  email?: string | null;
  tenantId?: string | null;
  previousPlan?: string | null;
  newPlan?: string | null;
  source?: string | null;
  raw: Record<string, unknown>;
};

const EVENT_ALIASES: Record<string, FidelizeLifecycleEventType> = {
  upgrade: "upgrade",
  "plan.upgraded": "upgrade",
  plan_upgraded: "upgrade",
  downgrade: "downgrade",
  "plan.downgraded": "downgrade",
  plan_downgraded: "downgrade",
  cancel: "cancellation",
  canceled: "cancellation",
  cancelled: "cancellation",
  cancellation: "cancellation",
  "subscription.canceled": "cancellation",
  "subscription.cancelled": "cancellation",
  account_canceled: "cancellation",
  // Reativação / retomada da assinatura na Fidelize.
  reactivate: "reactivation",
  reactivated: "reactivation",
  reactivation: "reactivation",
  resubscribe: "reactivation",
  resubscribed: "reactivation",
  resumed: "reactivation",
  renewed: "reactivation",
  "subscription.reactivate": "reactivation",
  "subscription.reactivated": "reactivation",
  "subscription.reactivation": "reactivation",
  "subscription.resumed": "reactivation",
  "subscription.resume": "reactivation",
  "subscription.renewed": "reactivation",
  "subscription.resubscribed": "reactivation",
  subscription_reactivated: "reactivation",
  subscription_resumed: "reactivation",
  subscription_renewed: "reactivation",
  "account.reactivated": "reactivation",
  account_reactivated: "reactivation",
  "plan.reactivated": "reactivation",
  plan_reactivated: "reactivation",
};

export function normalizeLifecycleEvent(value: string | null | undefined): FidelizeLifecycleEventType | null {
  const key = (value || "").trim().toLowerCase();
  return EVENT_ALIASES[key] ?? null;
}

/** Extrai o payload do webhook em um formato estável (aceita variações de nomes). */
export function parseLifecyclePayload(body: Record<string, any>): FidelizeLifecyclePayload {
  const data = (body["data"] && typeof body["data"] === "object" ? body["data"] : body) as Record<string, any>;
  return {
    eventId: body["event_id"] ?? body["eventId"] ?? body["id"] ?? null,
    event: String(body["event"] ?? body["type"] ?? body["event_type"] ?? data["event"] ?? ""),
    email: data["email"] ?? data["customer_email"] ?? null,
    tenantId: data["tenant_id"] ?? data["tenantId"] ?? data["tenant"] ?? null,
    previousPlan: data["previous_plan"] ?? data["previousPlan"] ?? data["old_plan"] ?? null,
    newPlan: data["new_plan"] ?? data["newPlan"] ?? data["plan"] ?? null,
    source: data["source"] ?? body["source"] ?? null,
    raw: body,
  };
}

/** Cancela no Asaas todas as assinaturas recorrentes ligadas à Fidelize do aluno. */
async function cancelAsaasSubscriptions(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseExternalReference, getAsaasConfig, asaasRequest } = await import("./asaas.server");

  const { data: paymentRows } = await supabaseAdmin
    .from("payments")
    .select("customer_id, external_reference")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (paymentRows ?? []) as Record<string, any>[];
  const fidelizeRows = rows.filter(
    (row) => parseExternalReference(row["external_reference"])?.productType === "fidelize",
  );
  const customerIds = Array.from(
    new Set(fidelizeRows.map((row) => row["customer_id"]).filter(Boolean)),
  ) as string[];

  if (!customerIds.length) {
    return { canceled: [] as string[], failed: [] as { id: string; error: string }[], skipped: "sem_cliente_asaas" };
  }

  const config = await getAsaasConfig();
  const canceled: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const customerId of customerIds.slice(0, 5)) {
    let subscriptions: any[] = [];
    try {
      const result = await asaasRequest(config, `/subscriptions?customer=${customerId}&limit=50`, "GET");
      subscriptions = result?.data ?? [];
    } catch (err) {
      failed.push({ id: customerId, error: (err as Error)?.message || "Falha ao listar assinaturas." });
      continue;
    }

    for (const sub of subscriptions) {
      const ref = parseExternalReference(sub?.externalReference);
      const isFidelize = ref?.productType === "fidelize" || /fidelize/i.test(String(sub?.description ?? ""));
      const status = String(sub?.status ?? "").toUpperCase();
      if (!isFidelize || status === "INACTIVE" || status === "CANCELLED" || status === "CANCELED") continue;

      try {
        await asaasRequest(config, `/subscriptions/${sub.id}`, "DELETE");
        canceled.push(sub.id as string);
      } catch (err) {
        failed.push({ id: sub.id as string, error: (err as Error)?.message || "Falha ao cancelar." });
      }
    }
  }

  return { canceled, failed, skipped: null as string | null };
}

/**
 * Processa um evento de ciclo de vida recebido da Fidelize.
 * Idempotente por `eventId` (quando informado pela Fidelize).
 */
export async function handleFidelizeLifecycleEvent(payload: FidelizeLifecyclePayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const eventType = normalizeLifecycleEvent(payload.event);
  if (!eventType) {
    return { ok: false, status: 400, error: `Evento não suportado: ${payload.event || "(vazio)"}` };
  }

  // Idempotência.
  if (payload.eventId) {
    const { data: seen } = await supabaseAdmin
      .from("fidelize_lifecycle_events")
      .select("id, status")
      .eq("event_id", payload.eventId)
      .maybeSingle();
    if (seen) return { ok: true, status: 200, duplicated: true as const, eventId: payload.eventId };
  }

  // Localiza o provisionamento original (fonte: Ronnei).
  let query = supabaseAdmin
    .from("fidelize_provisioning_logs")
    .select("id, user_id, plan, order_id, tenant_id, request_payload, lifecycle_status")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);

  if (payload.tenantId) query = query.eq("tenant_id", payload.tenantId);
  else if (payload.email) query = query.eq("request_payload->>email", payload.email.toLowerCase());

  const { data: logRow } = await query.maybeSingle();
  const record = (logRow || null) as Record<string, any> | null;

  const baseEvent: Record<string, unknown> = {
    event_id: payload.eventId ?? null,
    event_type: eventType,
    user_id: record?.["user_id"] ?? null,
    provisioning_log_id: record?.["id"] ?? null,
    tenant_id: payload.tenantId ?? record?.["tenant_id"] ?? null,
    email: payload.email ?? (record?.["request_payload"] as any)?.email ?? null,
    previous_plan: payload.previousPlan ?? record?.["plan"] ?? null,
    new_plan: payload.newPlan ?? null,
    payload: payload.raw as never,
  };

  if (!record) {
    await supabaseAdmin.from("fidelize_lifecycle_events").insert({
      ...baseEvent,
      status: "unmatched",
      error_message: "Nenhuma conta Fidelize provisionada pelo Ronnei foi encontrada para este evento.",
    } as never);
    await logSystemEvent({
      level: "warning",
      source: "fidelize",
      message: `Webhook Fidelize (${eventType}) sem conta correspondente no Ronnei.`,
      details: { email: payload.email, tenantId: payload.tenantId },
    });
    return { ok: true, status: 200, matched: false as const };
  }

  // Cancela a cobrança recorrente no Asaas (evita cobrança duplicada).
  let cancelResult: Awaited<ReturnType<typeof cancelAsaasSubscriptions>> = {
    canceled: [],
    failed: [],
    skipped: null,
  };
  try {
    cancelResult = await cancelAsaasSubscriptions(record["user_id"] as string);
  } catch (err) {
    cancelResult = { canceled: [], failed: [{ id: "asaas", error: (err as Error)?.message || "erro" }], skipped: null };
  }

  const now = new Date().toISOString();
  const lifecycleStatus =
    eventType === "cancellation" ? "canceled" : eventType === "reactivation" ? "reactivated" : eventType;
  const newPlan = payload.newPlan && isFidelizePlan(payload.newPlan) ? payload.newPlan : null;

  await supabaseAdmin
    .from("fidelize_provisioning_logs")
    .update({
      lifecycle_status: lifecycleStatus,
      lifecycle_plan: newPlan ?? payload.newPlan ?? record["plan"],
      migrated_to_fidelize: true,
      migrated_at: now,
      subscription_id: cancelResult.canceled[0] ?? null,
      subscription_canceled_at: cancelResult.canceled.length ? now : null,
      updated_at: now,
    } as never)
    .eq("id", record["id"]);

  const { data: eventRow } = await supabaseAdmin
    .from("fidelize_lifecycle_events")
    .insert({
      ...baseEvent,
      subscription_id: cancelResult.canceled[0] ?? null,
      subscription_canceled: cancelResult.canceled.length > 0,
      cancel_result: cancelResult as never,
      status: cancelResult.failed.length ? "partial" : "processed",
      error_message: cancelResult.failed.length
        ? `Falha ao cancelar no Asaas: ${cancelResult.failed.map((f) => `${f.id}: ${f.error}`).join(" | ")}`
        : null,
    } as never)
    .select("id")
    .maybeSingle();

  // Auditoria administrativa.
  await supabaseAdmin.from("admin_audit_log").insert({
    action: `fidelize_${eventType}`,
    target_user_id: record["user_id"],
    actor_id: null,
    product_type: "fidelize",
    product_id: (newPlan ?? record["plan"]) as string,
    product_name: fidelizePlanLabel((newPlan ?? record["plan"]) as any),
    reason: "Evento de ciclo de vida recebido da Fidelize (fonte da verdade após migração).",
    details: {
      event_id: payload.eventId,
      event_type: eventType,
      previous_plan: record["plan"],
      new_plan: payload.newPlan,
      canceled_subscriptions: cancelResult.canceled,
      failed_subscriptions: cancelResult.failed,
      order_id: record["order_id"],
    } as never,
  } as never);

  await logSystemEvent({
    level: cancelResult.failed.length ? "warning" : "info",
    source: "fidelize",
    message: `Ciclo de vida Fidelize (${eventType}) sincronizado — assinatura(s) cancelada(s): ${
      cancelResult.canceled.length
    }`,
    details: {
      user_id: record["user_id"],
      event_id: payload.eventId,
      canceled: cancelResult.canceled,
      failed: cancelResult.failed,
    },
    userId: record["user_id"] as string,
  });

  try {
    const { notifyAdmin } = await import("./admin-notify.server");
    await notifyAdmin({
      type: "system",
      severity: eventType === "cancellation" ? "warning" : "info",
      title: `Fidelize: ${
        eventType === "cancellation"
          ? "cancelamento"
          : eventType === "reactivation"
            ? "reativação"
            : eventType
      } do aluno`,
      body: `A Fidelize informou ${eventType}. ${cancelResult.canceled.length} assinatura(s) cancelada(s) no Asaas.`,
      link: "/admin/integracoes",
      dedupKey: `fidelize_lifecycle_${payload.eventId ?? record["id"]}`,
      metadata: { userId: record["user_id"], eventId: payload.eventId },
    });
  } catch {
    /* notificação é best-effort */
  }

  return {
    ok: true,
    status: 200,
    matched: true as const,
    eventType,
    eventRowId: (eventRow as any)?.id ?? null,
    canceledSubscriptions: cancelResult.canceled,
  };
}
