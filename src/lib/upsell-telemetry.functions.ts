import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UpsellLogInput = {
  step: string;
  level: "info" | "warn" | "error";
  surface: string;
  reason?: string | null;
  details?: Record<string, unknown> | null;
};

/** Persiste eventos relevantes do fluxo de upsell em system_logs (visível em /admin/logs). */
export const logUpsellEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsellLogInput) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const level = ["info", "warn", "error"].includes(data.level) ? data.level : "info";

    await supabaseAdmin.from("system_logs").insert({
      level,
      source: `upsell:${String(data.surface || "unknown").slice(0, 40)}`,
      message: `${String(data.step || "event").slice(0, 80)}${data.reason ? ` — ${String(data.reason).slice(0, 120)}` : ""}`,
      details: {
        step: data.step,
        surface: data.surface,
        reason: data.reason ?? null,
        ...(data.details ?? {}),
      },
      user_id: context.userId,
    });

    return { ok: true };
  });
