import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  asaasFetchJson,
  asaasHeaders,
  getAsaasConfig,
  grantAccess,
  parseExternalReference,
  resolveUserFromPayment,
} from "@/lib/asaas.server";
import { raiseOpsAlert } from "@/lib/ops-alerts.server";
import { triggerEmailEvent } from "@/lib/resend.server";

/** Limites por execução — garantem que a rotina sempre termina. */
const MAX_PAYMENTS_PER_RUN = 100;
const MAX_EMAILS_PER_RUN = 20;
const MAX_EMAIL_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [5, 20, 60];
const PAID_STATUSES = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

export type OpsRecoveryResult = {
  reconciliation: { checked: number; divergences: number; recorded: number };
  emails: { processed: number; sent: number; failed: number; exhausted: number };
  alerts: { created: number };
};

// ---------------------------------------------------------------------------
// 1. Reconciliação Asaas
// ---------------------------------------------------------------------------

async function hasAccess(productType: string, productId: string, userId: string) {
  if (productType === "course") {
    const { data } = await supabaseAdmin
      .from("course_enrollments")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", productId)
      .maybeSingle();
    return Boolean(data);
  }
  if (productType === "ebook") {
    const { data } = await supabaseAdmin
      .from("ebook_enrollments")
      .select("id")
      .eq("user_id", userId)
      .eq("ebook_id", productId)
      .maybeSingle();
    return Boolean(data);
  }
  return false;
}

async function productExists(productType: string, productId: string) {
  const table = productType === "course" ? "courses" : productType === "ebook" ? "ebooks" : null;
  if (!table) return false;
  const { data } = await supabaseAdmin.from(table).select("id").eq("id", productId).maybeSingle();
  return Boolean(data);
}

async function recordDivergence(entry: {
  externalId: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  productId: string | null;
  productType: string | null;
  amount: number;
  paymentStatus: string | null;
  issue: string;
  details: Record<string, any>;
}) {
  const { error } = await supabaseAdmin.from("payment_reconciliations").upsert(
    {
      external_id: entry.externalId,
      user_id: entry.userId,
      customer_email: entry.email,
      customer_name: entry.name,
      product_id: entry.productId,
      product_type: entry.productType,
      amount: entry.amount,
      payment_status: entry.paymentStatus,
      issue: entry.issue,
      status: "pending",
      details: entry.details as any,
    },
    { onConflict: "external_id" },
  );
  if (error) {
    console.error("[ops] Falha ao registrar divergência:", error.message);
    return false;
  }
  return true;
}

/** Compara pagamentos pagos e assinaturas ativas do Asaas com os acessos liberados. */
export async function reconcileAsaas(): Promise<OpsRecoveryResult["reconciliation"]> {
  const summary = { checked: 0, divergences: 0, recorded: 0 };

  let apiKey: string;
  let baseUrl: string;
  try {
    const config = await getAsaasConfig();
    apiKey = config.apiKey;
    baseUrl = config.baseUrl;
  } catch (err: any) {
    console.warn("[ops] Reconciliação ignorada (Asaas não configurado):", err?.message);
    return summary;
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const payments: any[] = [];

  for (const status of ["CONFIRMED", "RECEIVED"]) {
    if (payments.length >= MAX_PAYMENTS_PER_RUN) break;
    const url = `${baseUrl}/payments?status=${status}&limit=50&offset=0&paymentDate%5Bge%5D=${since}`;
    const res = await asaasFetchJson(url, { headers: asaasHeaders(apiKey) });
    if (!res.ok || !res.json?.data) continue;
    payments.push(...res.json.data.slice(0, MAX_PAYMENTS_PER_RUN - payments.length));
  }

  for (const payment of payments) {
    summary.checked += 1;
    const externalId: string = payment.id;
    const amount = Number(payment.value || payment.netValue || 0);
    const ref = parseExternalReference(payment.externalReference);

    // 1) Garante que a venda está registrada no financeiro
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id, user_id")
      .eq("external_id", externalId)
      .maybeSingle();

    let userId: string | null = ref?.userId || existingPayment?.user_id || null;
    if (!userId) {
      userId = await resolveUserFromPayment(payment, baseUrl, apiKey).catch(() => null);
    }

    if (!existingPayment) {
      await supabaseAdmin.from("payments").insert({
        external_id: externalId,
        user_id: userId,
        amount,
        net_amount: Number(payment.netValue || amount),
        fee: Math.max(0, amount - Number(payment.netValue || amount)),
        status: payment.status,
        billing_type: payment.billingType || null,
        external_reference: payment.externalReference || null,
        customer_id: payment.customer || null,
        confirmed_at: payment.confirmedDate || payment.paymentDate || new Date().toISOString(),
        metadata: { source: "reconciliation" } as any,
      });
    }

    // 2) Verifica se o acesso foi liberado
    if (!ref?.productType || !ref?.productId) {
      summary.divergences += 1;
      if (
        await recordDivergence({
          externalId,
          userId,
          email: payment.customerEmail || null,
          name: payment.customerName || null,
          productId: null,
          productType: null,
          amount,
          paymentStatus: payment.status,
          issue: "sem_referencia",
          details: { externalReference: payment.externalReference || null },
        })
      ) {
        summary.recorded += 1;
      }
      continue;
    }

    if (!userId) {
      summary.divergences += 1;
      if (
        await recordDivergence({
          externalId,
          userId: null,
          email: payment.customerEmail || null,
          name: payment.customerName || null,
          productId: ref.productId,
          productType: ref.productType,
          amount,
          paymentStatus: payment.status,
          issue: "cliente_nao_encontrado",
          details: { externalReference: payment.externalReference },
        })
      ) {
        summary.recorded += 1;
      }
      continue;
    }

    const granted = await hasAccess(ref.productType, ref.productId, userId);
    if (granted) {
      // Se havia divergência registrada antes, marca como resolvida.
      await supabaseAdmin
        .from("payment_reconciliations")
        .update({ status: "fixed", resolved_at: new Date().toISOString() })
        .eq("external_id", externalId)
        .eq("status", "pending");
      continue;
    }

    const exists = await productExists(ref.productType, ref.productId);
    summary.divergences += 1;
    if (
      await recordDivergence({
        externalId,
        userId,
        email: payment.customerEmail || null,
        name: payment.customerName || null,
        productId: ref.productId,
        productType: ref.productType,
        amount,
        paymentStatus: payment.status,
        issue: exists ? "pagamento_sem_matricula" : "produto_inexistente",
        details: { externalReference: payment.externalReference },
      })
    ) {
      summary.recorded += 1;
    }
  }

  // 3) Assinaturas ativas sem acesso liberado
  const subsRes = await asaasFetchJson(`${baseUrl}/subscriptions?status=ACTIVE&limit=50`, {
    headers: asaasHeaders(apiKey),
  }).catch(() => null);

  for (const sub of subsRes?.json?.data || []) {
    const ref = parseExternalReference(sub.externalReference);
    if (!ref?.productType || !ref?.productId || !ref?.userId) continue;
    summary.checked += 1;
    if (await hasAccess(ref.productType, ref.productId, ref.userId)) continue;
    summary.divergences += 1;
    if (
      await recordDivergence({
        externalId: `sub_${sub.id}`,
        userId: ref.userId,
        email: sub.customerEmail || null,
        name: sub.customerName || null,
        productId: ref.productId,
        productType: ref.productType,
        amount: Number(sub.value || 0),
        paymentStatus: "ACTIVE_SUBSCRIPTION",
        issue: "assinatura_sem_matricula",
        details: { subscriptionId: sub.id },
      })
    ) {
      summary.recorded += 1;
    }
  }

  return summary;
}

/** Reprocessa manualmente uma divergência: libera o acesso do cliente pagante. */
export async function reprocessReconciliation(id: string) {
  const { data: item } = await supabaseAdmin
    .from("payment_reconciliations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!item) throw new Error("Divergência não encontrada.");

  await supabaseAdmin
    .from("payment_reconciliations")
    .update({ last_attempt_at: new Date().toISOString() })
    .eq("id", id);

  if (!item.user_id || !item.product_id || !item.product_type) {
    throw new Error("Divergência sem cliente ou produto identificado — corrija manualmente o pedido.");
  }

  if (!(await productExists(item.product_type, item.product_id))) {
    await supabaseAdmin
      .from("payment_reconciliations")
      .update({ status: "ignored", resolved_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: false, message: "Produto não existe mais no catálogo. Divergência arquivada." };
  }

  const ok = await grantAccess(item.product_type, item.product_id, item.user_id);
  if (!ok) throw new Error("Não foi possível liberar o acesso. Tente novamente.");

  await supabaseAdmin
    .from("payment_reconciliations")
    .update({ status: "fixed", resolved_at: new Date().toISOString() })
    .eq("id", id);

  await supabaseAdmin.from("system_logs").insert({
    level: "info",
    source: "ops:reconciliation",
    message: `Acesso liberado manualmente (${item.product_type}:${item.product_id})`,
    details: { reconciliation_id: id, user_id: item.user_id } as any,
  });

  return { ok: true, message: "Acesso liberado com sucesso." };
}

// ---------------------------------------------------------------------------
// 2. Fila de reenvio de e-mails
// ---------------------------------------------------------------------------

type RetryPayload = { event: string; to: string; data: Record<string, any>; idempotencyKey?: string };

function parseRetryPayload(raw: any): RetryPayload | null {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.event || !raw.to) return null;
  return { event: String(raw.event), to: String(raw.to), data: raw.data || {}, idempotencyKey: raw.idempotency_key || raw.idempotencyKey };
}

export async function retryFailedEmails(): Promise<OpsRecoveryResult["emails"]> {
  const summary = { processed: 0, sent: 0, failed: 0, exhausted: 0 };
  const nowIso = new Date().toISOString();

  const { data: pending } = await supabaseAdmin
    .from("email_logs")
    .select("id, recipient_email, template_name, attempts, retry_payload")
    .in("status", ["failed", "error"])
    .is("resolved_at", null)
    .not("retry_payload", "is", null)
    .lt("attempts", MAX_EMAIL_ATTEMPTS)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(MAX_EMAILS_PER_RUN);

  for (const row of pending || []) {
    const payload = parseRetryPayload(row.retry_payload);
    const attempts = (row.attempts || 0) + 1;
    summary.processed += 1;

    if (!payload) {
      await supabaseAdmin
        .from("email_logs")
        .update({ status: "failed_permanent", resolved_at: nowIso, error_message: "Dados de reenvio inválidos." })
        .eq("id", row.id);
      continue;
    }

    try {
      await triggerEmailEvent({ ...payload, _retry: true });
      await supabaseAdmin
        .from("email_logs")
        .update({ status: "sent", attempts, resolved_at: new Date().toISOString(), sent_at: new Date().toISOString(), next_retry_at: null })
        .eq("id", row.id);
      summary.sent += 1;
    } catch (err: any) {
      const exhausted = attempts >= MAX_EMAIL_ATTEMPTS;
      const backoff = RETRY_BACKOFF_MINUTES[Math.min(attempts, RETRY_BACKOFF_MINUTES.length - 1)];
      await supabaseAdmin
        .from("email_logs")
        .update({
          status: exhausted ? "failed_permanent" : "failed",
          attempts,
          error_message: err?.message || "Falha desconhecida no envio.",
          next_retry_at: exhausted ? null : new Date(Date.now() + backoff * 60_000).toISOString(),
          resolved_at: exhausted ? new Date().toISOString() : null,
        })
        .eq("id", row.id);

      if (exhausted) {
        summary.exhausted += 1;
        // Nunca alertar sobre o próprio e-mail de alerta (evita laço infinito).
        if (payload.event !== "ops_alert") {
          await raiseOpsAlert({
            type: "email_failed",
            dedupKey: `email_failed:${payload.event}:${payload.to}`,
            title: "E-mail crítico não entregue",
            message: `O e-mail "${payload.event}" para ${payload.to} falhou após ${MAX_EMAIL_ATTEMPTS} tentativas: ${err?.message || "erro desconhecido"}`,
            details: { email_log_id: row.id, event: payload.event },
          });
        }
      } else {
        summary.failed += 1;
      }
    }
  }

  return summary;
}

/** Reenvio manual imediato de um e-mail da fila. */
export async function retryEmailNow(id: string) {
  const { data: row } = await supabaseAdmin
    .from("email_logs")
    .select("id, attempts, retry_payload")
    .eq("id", id)
    .maybeSingle();

  if (!row) throw new Error("Registro de e-mail não encontrado.");
  const payload = parseRetryPayload(row.retry_payload);
  if (!payload) throw new Error("Este e-mail não possui dados suficientes para reenvio.");

  await triggerEmailEvent({ ...payload, _retry: true });
  await supabaseAdmin
    .from("email_logs")
    .update({
      status: "sent",
      attempts: (row.attempts || 0) + 1,
      resolved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      next_retry_at: null,
    })
    .eq("id", id);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. Alertas críticos
// ---------------------------------------------------------------------------

export async function scanCriticalAlerts(): Promise<OpsRecoveryResult["alerts"]> {
  let created = 0;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Webhooks do Asaas com falha
  const { data: webhookFailures } = await supabaseAdmin
    .from("asaas_webhook_events")
    .select("event_id, payment_id, event_type, last_error, status")
    .eq("status", "failed")
    .gte("claimed_at", dayAgo)
    .limit(20);

  for (const evt of webhookFailures || []) {
    const ok = await raiseOpsAlert({
      type: "webhook_failed",
      dedupKey: `webhook_failed:${evt.event_id}`,
      title: "Webhook do Asaas falhou",
      message: `Evento ${evt.event_type} do pagamento ${evt.payment_id} não foi processado: ${evt.last_error || "erro desconhecido"}`,
      details: { event_id: evt.event_id, payment_id: evt.payment_id },
    });
    if (ok) created += 1;
  }

  // Pagamentos pagos sem matrícula
  const { data: divergences } = await supabaseAdmin
    .from("payment_reconciliations")
    .select("id, external_id, amount, issue")
    .eq("status", "pending")
    .in("issue", ["pagamento_sem_matricula", "assinatura_sem_matricula", "cliente_nao_encontrado"])
    .limit(20);

  if ((divergences || []).length > 0) {
    const ok = await raiseOpsAlert({
      type: "payment_without_access",
      dedupKey: `payment_without_access:${divergences!.length}:${divergences![0]!.external_id}`,
      title: "Cliente pagante sem acesso liberado",
      message: `${divergences!.length} pagamento(s) confirmado(s) sem matrícula correspondente. Abra Financeiro > Reconciliação para corrigir.`,
      details: { items: divergences!.map((d) => d.external_id) },
    });
    if (ok) created += 1;
  }

  // Saques pendentes há mais de 48h
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: payouts } = await supabaseAdmin
    .from("payout_requests")
    .select("id, amount, created_at, status")
    .in("status", ["pending", "analyzing"])
    .lt("created_at", twoDaysAgo)
    .limit(20);

  if ((payouts || []).length > 0) {
    const ok = await raiseOpsAlert({
      type: "payout_stale",
      dedupKey: `payout_stale:${payouts!.length}`,
      severity: "warning",
      title: "Saques pendentes há mais de 48h",
      message: `${payouts!.length} solicitação(ões) de saque aguardando análise há mais de 48 horas.`,
      details: { ids: payouts!.map((p) => p.id) },
    });
    if (ok) created += 1;
  }

  return { created };
}

// ---------------------------------------------------------------------------
// Execução completa (usada pelo cron e pelo botão manual)
// ---------------------------------------------------------------------------

export async function runOpsRecovery(): Promise<OpsRecoveryResult> {
  const reconciliation = await reconcileAsaas().catch((err) => {
    console.error("[ops] Reconciliação falhou:", err?.message);
    return { checked: 0, divergences: 0, recorded: 0 };
  });
  const emails = await retryFailedEmails().catch((err) => {
    console.error("[ops] Reenvio de e-mails falhou:", err?.message);
    return { processed: 0, sent: 0, failed: 0, exhausted: 0 };
  });
  const alerts = await scanCriticalAlerts().catch((err) => {
    console.error("[ops] Varredura de alertas falhou:", err?.message);
    return { created: 0 };
  });

  return { reconciliation, emails, alerts };
}
