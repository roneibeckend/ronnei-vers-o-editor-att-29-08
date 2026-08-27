import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWebPush } from "@/lib/web-push.server";

export type AdminNotificationType =
  | "sale"
  | "affiliate"
  | "payout"
  | "support"
  | "payment"
  | "email"
  | "system"
  | "webhook"
  | "course"
  | "ebook"
  | "security";

export type AdminNotificationSeverity = "info" | "success" | "warning" | "critical";

export type AdminNotifyInput = {
  type: AdminNotificationType;
  title: string;
  body: string;
  severity?: AdminNotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  /** Rota do painel aberta ao clicar (ex.: `/admin/suporte`). */
  link?: string | null;
  /** Chave estável para evitar duplicidade (janela de 10 minutos). */
  dedupKey?: string | null;
  metadata?: Record<string, any>;
  /** Ignora as preferências de categoria (usado no teste manual). */
  force?: boolean;
};

const DEDUP_WINDOW_MS = 10 * 60 * 1000;

const SETTING_BY_TYPE: Record<AdminNotificationType, string> = {
  sale: "sales",
  affiliate: "affiliates",
  payout: "payouts",
  support: "support",
  payment: "finance",
  email: "emails",
  security: "security",
  system: "system",
  webhook: "system",
  course: "system",
  ebook: "system",
};

type SettingsRow = Record<string, any>;

async function loadSettings(): Promise<SettingsRow | null> {
  const { data } = await supabaseAdmin
    .from("admin_notification_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  return (data as SettingsRow) || null;
}

/**
 * Cria uma notificação administrativa (histórico + tempo real) e dispara push
 * para todos os dispositivos ativos dos admins. Nunca lança exceções.
 */
export async function notifyAdmin(input: AdminNotifyInput): Promise<{ created: boolean; id?: string }> {
  try {
    const severity = input.severity || "info";
    const settings = await loadSettings();

    if (!input.force && settings) {
      const column = SETTING_BY_TYPE[input.type] || "system";
      if (settings[column] === false) return { created: false };
    }

    // Deduplicação: mesma chave dentro da janela não gera nova notificação/push.
    if (input.dedupKey) {
      const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("admin_notifications")
        .select("id")
        .eq("dedup_key", input.dedupKey)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (recent) return { created: false, id: (recent as any).id };
    }

    const { data: notification, error } = await supabaseAdmin
      .from("admin_notifications")
      .insert({
        title: input.title,
        body: input.body,
        type: input.type,
        severity,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        link: input.link ?? null,
        dedup_key: input.dedupKey ?? null,
        metadata: (input.metadata || {}) as any,
      })
      .select("id")
      .maybeSingle();

    if (error || !notification) {
      console.error("[admin-notify] Falha ao registrar notificação:", error?.message);
      return { created: false };
    }

    const notificationId = (notification as any).id as string;

    await supabaseAdmin
      .from("notification_logs")
      .insert({
        notification_id: notificationId,
        delivery_method: "in_app",
        delivered: true,
        delivered_at: new Date().toISOString(),
      })
      .then(undefined, () => undefined);

    if (settings?.push_enabled !== false) {
      await deliverPush(notificationId, {
        title: input.title,
        body: input.body,
        severity,
        type: input.type,
        link: input.link || "/admin/notificacoes",
        notificationId,
      }).catch((err) => console.warn("[admin-notify] Falha no push:", err));
    }

    return { created: true, id: notificationId };
  } catch (err: any) {
    console.error("[admin-notify] Erro inesperado:", err?.message);
    return { created: false };
  }
}

/** Envia o push para todos os dispositivos ativos e registra a auditoria. */
export async function deliverPush(
  notificationId: string | null,
  payload: {
    title: string;
    body: string;
    severity: string;
    type: string;
    link: string;
    notificationId?: string | null;
  },
  onlyUserId?: string,
) {
  let query = supabaseAdmin
    .from("admin_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("active", true);

  if (onlyUserId) query = query.eq("user_id", onlyUserId);

  const { data: subs } = await query;
  if (!subs || subs.length === 0) return;

  for (const sub of subs as any[]) {
    const result = await sendWebPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { ...payload, tag: payload.notificationId || `${payload.type}-${Date.now()}` },
    );

    await supabaseAdmin
      .from("notification_logs")
      .insert({
        notification_id: notificationId,
        user_id: sub.user_id,
        delivery_method: "push",
        delivered: result.ok,
        delivered_at: result.ok ? new Date().toISOString() : null,
        error: result.ok ? null : result.error.slice(0, 400),
      })
      .then(undefined, () => undefined);

    if (!result.ok && result.expired) {
      await supabaseAdmin
        .from("admin_push_subscriptions")
        .update({ active: false })
        .eq("id", sub.id)
        .then(undefined, () => undefined);
    }
  }
}

export function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}
