import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const severitySchema = z.enum(["info", "success", "warning", "critical"]);

/** Garante que o chamador é administrador. */
async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado: apenas administradores.");
  return supabaseAdmin;
}

export const getPushConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { getVapidPublicKey } = await import("@/lib/web-push.server");
    return { publicKey: getVapidPublicKey() };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        endpoint: z.string().url(),
        p256dh: z.string().min(10),
        auth: z.string().min(4),
        deviceName: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const { error } = await supabaseAdmin.from("admin_push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        device_name: data.deviceName || "Dispositivo",
        active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ endpoint: z.string().url() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    await supabaseAdmin.from("admin_push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const listPushDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .select("id, device_name, active, created_at, last_seen_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return { devices: data || [] };
  });

export const listAdminNotifications = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
        type: z.string().optional(),
        severity: severitySchema.optional(),
        onlyUnread: z.boolean().optional(),
      })
      .parse(data ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);

    const from = (data.page - 1) * data.pageSize;
    let query = supabaseAdmin
      .from("admin_notifications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);

    if (data.type) query = query.eq("type", data.type);
    if (data.severity) query = query.eq("severity", data.severity);
    if (data.onlyUnread) query = query.eq("read", false);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    return { items: rows || [], total: count || 0, page: data.page, pageSize: data.pageSize };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() }).parse(data ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const patch = { read: true, read_at: new Date().toISOString() };

    if (data.all) {
      await supabaseAdmin.from("admin_notifications").update(patch).eq("read", false);
    } else if (data.ids?.length) {
      await supabaseAdmin.from("admin_notifications").update(patch).in("id", data.ids);
    }
    return { ok: true };
  });

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("admin_notification_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (data) return { settings: data };

    const { data: created } = await supabaseAdmin
      .from("admin_notification_settings")
      .insert({})
      .select("*")
      .maybeSingle();
    return { settings: created };
  });

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        sales: z.boolean().optional(),
        affiliates: z.boolean().optional(),
        payouts: z.boolean().optional(),
        support: z.boolean().optional(),
        emails: z.boolean().optional(),
        finance: z.boolean().optional(),
        security: z.boolean().optional(),
        system: z.boolean().optional(),
        push_enabled: z.boolean().optional(),
        sound_enabled: z.boolean().optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("admin_notification_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data: created } = await supabaseAdmin
        .from("admin_notification_settings")
        .insert(data as any)
        .select("*")
        .maybeSingle();
      return { settings: created };
    }

    const { data: updated, error } = await supabaseAdmin
      .from("admin_notification_settings")
      .update(data as any)
      .eq("id", (existing as any).id)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { settings: updated };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      endpoint: z.string().url(),
    }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { sendWebPush } = await import("@/lib/web-push.server");

    const { data: subscription, error } = await supabaseAdmin
      .from("admin_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint)
      .eq("active", true)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!subscription) {
      return {
        ok: false,
        total: 1,
        delivered: 0,
        failed: 1,
        message:
          "Este aparelho não possui uma inscrição push ativa. Use Reparar push primeiro.",
      };
    }

    // Tempo para o usuário colocar o PWA em background.
    await new Promise((resolve) =>
      setTimeout(resolve, 5000),
    );

    const result = await sendWebPush(
      {
        endpoint: (subscription as any).endpoint,
        p256dh: (subscription as any).p256dh,
        auth: (subscription as any).auth,
      },
      {
        title: "🔔 Ronnei na Veia",
        body:
          "Push nativo funcionando neste iPhone.",
        severity: "info",
        type: "system",
        link: "/admin/notificacoes",
        tag: `rnv-device-test-${Date.now()}`,
      },
    );

    await supabaseAdmin
      .from("notification_logs")
      .insert({
        notification_id: null,
        user_id: context.userId,
        delivery_method: "push",
        delivered: result.ok,
        delivered_at:
          result.ok
            ? new Date().toISOString()
            : null,
        error:
          result.ok
            ? null
            : result.error.slice(0, 400),
      })
      .then(undefined, () => undefined);

    if (!result.ok && result.expired) {
      await supabaseAdmin
        .from("admin_push_subscriptions")
        .update({ active: false })
        .eq("id", (subscription as any).id)
        .then(undefined, () => undefined);
    }

    return {
      ok: result.ok,
      total: 1,
      delivered: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      message: result.ok
        ? "O serviço de push aceitou a mensagem para ESTE aparelho."
        : result.error,
    };
  });

/** Resumo operacional das últimas 24 horas para o dashboard. */
export const getOperationalSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [payments, students, affiliates, tickets, criticals, unread] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("net_amount, amount, status, created_at")
        .gte("created_at", since)
        .in("status", ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabaseAdmin.from("affiliates").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin
        .from("admin_notifications")
        .select("id", { count: "exact", head: true })
        .eq("severity", "critical")
        .gte("created_at", since),
      supabaseAdmin.from("admin_notifications").select("id", { count: "exact", head: true }).eq("read", false),
    ]);

    const rows = (payments.data || []) as any[];
    const revenue = rows.reduce((acc, p) => acc + Number(p.net_amount ?? p.amount ?? 0), 0);

    return {
      sales: rows.length,
      revenue,
      newStudents: students.count || 0,
      newAffiliates: affiliates.count || 0,
      tickets: tickets.count || 0,
      criticalErrors: criticals.count || 0,
      unread: unread.count || 0,
    };
  });
