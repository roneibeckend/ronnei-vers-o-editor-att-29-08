import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const enableLeakedPasswordProtection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado.");
    const { patchAuthConfig } = await import("./oauth-admin.server");
    const result = await patchAuthConfig({ password_hibp_enabled: true });
    return { ok: true, password_hibp_enabled: (result as Record<string, unknown>)["password_hibp_enabled"] ?? null };
  });
