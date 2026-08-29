import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Provisionamento mais recente da Fidelize do aluno logado. */
export const getMyFidelizeAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fidelize_provisioning_logs")
      .select("id, plan, tenant_id, login_url, slug, modules, status, error_message, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as Record<string, any>;
    return {
      id: row["id"] as string,
      plan: (row["plan"] as string) ?? null,
      tenantId: (row["tenant_id"] as string) ?? null,
      loginUrl: (row["login_url"] as string) ?? null,
      slug: (row["slug"] as string) ?? null,
      modules: Array.isArray(row["modules"]) ? (row["modules"] as string[]) : [],
      status: (row["status"] as string) ?? "pending",
      errorMessage: (row["error_message"] as string) ?? null,
      activatedAt: (row["updated_at"] as string) ?? (row["created_at"] as string),
      createdAt: row["created_at"] as string,
    };
  });
