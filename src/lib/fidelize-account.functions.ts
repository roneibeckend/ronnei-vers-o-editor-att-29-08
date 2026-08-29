import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Provisionamento mais recente da Fidelize do aluno logado. */
export const getMyFidelizeAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fidelize_provisioning_logs")
      .select(
        "id, plan, tenant_id, login_url, slug, modules, status, error_message, request_payload, created_at, updated_at, lifecycle_status, lifecycle_plan, migrated_to_fidelize, migrated_at, subscription_canceled_at",
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
      loginUrl: (row["login_url"] as string) ?? null,
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
    };
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
  if (typeof direct === "string" && direct.startsWith("http")) return direct;

  const base = (loginUrl as string) || (response["login_url"] as string) || null;
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
