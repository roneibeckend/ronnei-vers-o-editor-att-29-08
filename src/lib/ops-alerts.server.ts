import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAdminRecipients, notifyAdmins } from "@/lib/payouts-helpers.server";
import { triggerEmailEvent } from "@/lib/resend.server";

/** Janela de deduplicação: um mesmo alerta não é repetido dentro deste intervalo. */
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;

export type OpsAlertInput = {
  type: string;
  /** Chave estável do problema (ex.: `webhook:evt_123`). Deduplicada por 6 horas. */
  dedupKey: string;
  title: string;
  message: string;
  severity?: "critical" | "warning";
  details?: Record<string, any>;
};

/**
 * Registra um alerta operacional (system_logs + integration_logs + ops_alerts),
 * notifica os administradores no painel e por e-mail.
 * Retorna false quando o alerta foi suprimido pela janela de 6 horas.
 */
export async function raiseOpsAlert(input: OpsAlertInput): Promise<boolean> {
  const severity = input.severity || "critical";
  const details = input.details || {};

  try {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("ops_alerts")
      .select("id")
      .eq("dedup_key", input.dedupKey)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();

    if (recent) return false;
  } catch (err) {
    console.warn("[ops] Falha ao checar deduplicação de alerta:", err);
  }

  const { data: alert, error } = await supabaseAdmin
    .from("ops_alerts")
    .insert({
      type: input.type,
      dedup_key: input.dedupKey,
      severity,
      title: input.title,
      message: input.message,
      details: details as any,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[ops] Falha ao registrar alerta:", error.message);
    return false;
  }

  // Trilhas de auditoria: log do sistema + log de integração
  await supabaseAdmin
    .from("system_logs")
    .insert({
      level: severity === "critical" ? "error" : "warn",
      source: `ops:${input.type}`,
      message: `${input.title} — ${input.message}`,
      details: details as any,
    })
    .then(undefined, () => undefined);

  await supabaseAdmin
    .from("integration_logs")
    .insert({
      integration_name: "ops-recovery",
      status: severity === "critical" ? "error" : "warning",
      message: `${input.title} — ${input.message}`,
      details: details as any,
    })
    .then(undefined, () => undefined);

  // Notificação interna para os admins
  try {
    await notifyAdmins(input.title, input.message, { ops_alert_id: alert?.id, type: input.type });
  } catch (err) {
    console.warn("[ops] Falha ao notificar admins no painel:", err);
  }

  // Central de notificações administrativas (painel em tempo real + push)
  try {
    const { notifyAdmin } = await import("@/lib/admin-notify.server");
    await notifyAdmin({
      type: input.type.startsWith("email") ? "email" : "system",
      severity: severity === "critical" ? "critical" : "warning",
      title: input.title,
      body: input.message,
      link: "/admin/reconciliacao",
      dedupKey: `ops:${input.dedupKey}`,
      entityType: "ops_alert",
      entityId: alert?.id ?? null,
      metadata: { ops_type: input.type, ...details },
    });
  } catch (err) {
    console.warn("[ops] Falha ao publicar na central de notificações:", err);
  }

  // E-mail para os admins
  try {
    const admins = await getAdminRecipients();
    for (const admin of admins) {
      await triggerEmailEvent({
        event: "ops_alert",
        to: admin.email,
        data: {
          subject: `[Alerta ${severity === "critical" ? "crítico" : "operacional"}] ${input.title}`,
          heading: input.title,
          name: admin.name,
          message: input.message,
          link: "https://ronneinaveia.com.br/admin/reconciliacao",
        },
      }).catch((err) => console.warn("[ops] Falha ao enviar e-mail de alerta:", err?.message));
    }
    if (admins.length > 0) {
      await supabaseAdmin
        .from("ops_alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", alert?.id ?? "");
    }
  } catch (err) {
    console.warn("[ops] Falha ao alertar admins por e-mail:", err);
  }

  return true;
}
