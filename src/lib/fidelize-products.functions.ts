import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FIDELIZE_PLANS } from "./fidelize-plans";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Proibido");
}

/** Catálogo público dos planos Fidelize (preço e status atuais). */
export const listFidelizePlans = createServerFn({ method: "GET" }).handler(async () => {
  const { getFidelizePlanRecords } = await import("./fidelize-plans.server");
  return getFidelizePlanRecords();
});

/** Catálogo completo para o admin (inclui planos desativados). */
export const listFidelizePlansAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { getFidelizePlanRecords } = await import("./fidelize-plans.server");
    return getFidelizePlanRecords();
  });

/** Salva a personalização completa de cada plano Fidelize. */
export const saveFidelizePlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        plans: z
          .array(
            z.object({
              plan: z.enum(["starter", "pro", "premium"]),
              price: z.number().min(1, "O preço deve ser maior que zero.").max(99999),
              active: z.boolean(),
              label: z.string().trim().max(80).optional().or(z.literal("")),
              tagline: z.string().trim().max(120).optional().or(z.literal("")),
              description: z.string().trim().max(600).optional().or(z.literal("")),
              coverUrl: z.string().trim().max(2000).optional().or(z.literal("")),
              ctaLabel: z.string().trim().max(60).optional().or(z.literal("")),
              modules: z.array(z.string().trim().max(120)).max(20).optional(),
              highlight: z.boolean().optional(),
              sortOrder: z.number().int().min(0).max(99).optional(),
              affiliateEnabled: z.boolean().optional(),
              reset: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(FIDELIZE_PLANS.length),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { saveFidelizePlanOverrides } = await import("./fidelize-plans.server");
    const { logSystemEvent } = await import("./system-log.server");

    await saveFidelizePlanOverrides(data.plans);

    await logSystemEvent({
      level: "info",
      source: "fidelize",
      message: "Produtos/planos Fidelize atualizados",
      details: { plans: data.plans },
      userId: context.userId,
    });

    return { success: true };
  });
