import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIDELIZE_PUBLIC_ORIGIN = "https://afidelize.app";

function normalizeFidelizePublicUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;

  try {
    const url = new URL(value);

    if (url.hostname === "fidelizeapp.lovable.app") {
      const production = new URL(FIDELIZE_PUBLIC_ORIGIN);
      url.protocol = production.protocol;
      url.host = production.host;
    }

    return url.toString();
  } catch {
    return value;
  }
}

/** Provisionamento mais recente da Fidelize do aluno logado. */
export const getMyFidelizeAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fidelize_provisioning_logs")
      .select(
        "id, plan, tenant_id, login_url, slug, modules, status, error_message, request_payload, created_at, updated_at, lifecycle_status, lifecycle_plan, migrated_to_fidelize, migrated_at, subscription_canceled_at, subscription_status, last_payment_at, next_due_date, overdue_since, cancel_requested_at, reactivated_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as Record<string, any>;
    const request = (row["request_payload"] || {}) as Record<string, any>;
    return {
      id: row["id"] as string,
      plan: (row["plan"] as string) ?? null,
      tenantId: (row["tenant_id"] as string) ?? null,
      loginUrl: normalizeFidelizePublicUrl((row["login_url"] as string) ?? null),
      slug: (row["slug"] as string) ?? null,
      email: (request["email"] as string) ?? null,
      modules: Array.isArray(row["modules"]) ? (row["modules"] as string[]) : [],
      status: (row["status"] as string) ?? "pending",
      errorMessage: (row["error_message"] as string) ?? null,
      activatedAt: (row["updated_at"] as string) ?? (row["created_at"] as string),
      createdAt: row["created_at"] as string,
      lifecycleStatus: (row["lifecycle_status"] as string) ?? "active",
      lifecyclePlan: (row["lifecycle_plan"] as string) ?? null,
      migratedToFidelize: Boolean(row["migrated_to_fidelize"]),
      migratedAt: (row["migrated_at"] as string) ?? null,
      subscriptionCanceledAt: (row["subscription_canceled_at"] as string) ?? null,
      subscriptionStatus: (row["subscription_status"] as string) ?? "active",
      lastPaymentAt: (row["last_payment_at"] as string) ?? null,
      nextDueDate: (row["next_due_date"] as string) ?? null,
      overdueSince: (row["overdue_since"] as string) ?? null,
      cancelRequestedAt: (row["cancel_requested_at"] as string) ?? null,
      reactivatedAt: (row["reactivated_at"] as string) ?? null,
    };
  });

/** Recursos reais do plano contratado (plan_modules vindos da Fidelize). */
export const getMyFidelizePlanModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("fidelize_provisioning_logs")
      .select("tenant_id, plan, status")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = (data || null) as Record<string, any> | null;
    const tenantId = row?.["tenant_id"] as string | undefined;
    if (!tenantId) {
      return { success: false, planModules: [] as string[], plan: (row?.["plan"] as string) ?? null, error: null };
    }

    const { getFidelizeTenantModules } = await import("./fidelize-provisioning-info.server");
    const result = await getFidelizeTenantModules(tenantId);
    return {
      success: result.success,
      planModules: result.planModules,
      plan: result.plan ?? ((row?.["plan"] as string) ?? null),
      error: result.error,
    };
  });

/** Retorna a melhor URL de acesso (login único) à Fidelize para o aluno logado. */

export const getMyFidelizeAccessUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getFidelizeAccessTarget } = await import("./fidelize-sso.server");
    return getFidelizeAccessTarget(context.userId);
  });

/** Reenvia os dados de acesso da conta Fidelize para o e-mail do aluno. */
export const resendMyFidelizeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resendFidelizeAccess } = await import("./fidelize-provisioning.server");
    return resendFidelizeAccess(context.userId);
  });

/**
 * Revela a senha temporária (e o link de acesso direto, quando a Fidelize
 * devolve um token de autologin) da conta do próprio aluno.
 */
export const revealMyFidelizeCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fidelize_provisioning_logs")
      .select("id, login_url, request_payload, response_payload, status")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, message: "Nenhuma conta Fidelize encontrada." };

    const row = data as Record<string, any>;
    const response = (row["response_payload"] || {}) as Record<string, any>;
    const request = (row["request_payload"] || {}) as Record<string, any>;
    const password =
      response["temporary_password"] || response["password"] || response["temp_password"] || null;

    return {
      success: Boolean(password),
      login: (response["login"] as string) || (request["email"] as string) || null,
      temporaryPassword: (password as string) || null,
      autoLoginUrl: buildAutoLoginUrl(response, row["login_url"], request["email"]),
      message: password
        ? null
        : "A Fidelize não devolveu uma senha temporária para esta conta. Use “Esqueci minha senha” na plataforma ou reenvie o acesso.",
    };
  });

/** Monta a URL de acesso com autologin (token da Fidelize) ou, no mínimo, com o e-mail pré-preenchido. */
function buildAutoLoginUrl(
  response: Record<string, any>,
  loginUrl: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const direct =
    response["autologin_url"] || response["auto_login_url"] || response["sso_url"] || response["magic_link"];
  if (typeof direct === "string" && direct.startsWith("http")) {
    return normalizeFidelizePublicUrl(direct);
  }

  const base = normalizeFidelizePublicUrl(
    (loginUrl as string) || (response["login_url"] as string) || null,
  );
  if (!base || !base.startsWith("http")) return null;

  try {
    const url = new URL(base);
    const token =
      response["autologin_token"] || response["access_token"] || response["login_token"] || response["token"];
    if (typeof token === "string" && token) url.searchParams.set("token", token);
    if (email) url.searchParams.set("email", String(email));
    return url.toString();
  } catch {
    return base;
  }
}

/** Cancela a assinatura recorrente Fidelize do aluno (confirmado no Asaas). */
export const cancelMyFidelizeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { cancelFidelizeSubscriptionForUser } = await import("./fidelize-subscription.server");
    return cancelFidelizeSubscriptionForUser(context.userId);
  });

/** Marca a intenção de reativar; o acesso volta quando o Asaas confirmar o pagamento. */
export const requestMyFidelizeReactivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { markFidelizeReactivationRequested } = await import("./fidelize-subscription.server");
    const record = await markFidelizeReactivationRequested(context.userId);
    if (!record) return { success: false, plan: null, message: "Nenhuma conta Fidelize encontrada." };
    return { success: true, plan: record.plan as string, message: null as string | null };
  });
