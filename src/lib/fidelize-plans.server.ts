// Resolve o catálogo efetivo dos planos Fidelize (server-only).
// Os planos base vivem em fidelize-plans.ts; preço/status/descrição podem ser
// sobrescritos pelo admin e ficam em public.integrations.settings.plans
// (linha category = 'fidelize').

import { FIDELIZE_PLANS, FIDELIZE_PLAN_CATALOG, type FidelizePlan } from "./fidelize-plans";

export type FidelizePlanRecord = {
  plan: FidelizePlan;
  label: string;
  description: string;
  modules: string[];
  price: number;
  active: boolean;
  /** true quando o preço/status foi personalizado pelo admin. */
  customized: boolean;
};

type PlanOverride = Partial<{ price: number; active: boolean; label: string; description: string }>;

export async function getFidelizePlanRecords(): Promise<FidelizePlanRecord[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data } = await supabaseAdmin
    .from("integrations")
    .select("settings")
    .eq("category", "fidelize")
    .maybeSingle();

  const overrides = (((data?.settings || {}) as Record<string, unknown>)["plans"] || {}) as Record<
    string,
    PlanOverride
  >;

  return FIDELIZE_PLANS.map((plan) => {
    const base = FIDELIZE_PLAN_CATALOG[plan];
    const override = overrides[plan] || {};
    const price = Number.isFinite(Number(override.price)) && Number(override.price) > 0 ? Number(override.price) : base.price;

    return {
      plan,
      label: override.label?.trim() || base.label,
      description: override.description?.trim() || base.description,
      modules: base.modules,
      price,
      active: override.active !== false,
      customized: Object.keys(override).length > 0,
    };
  });
}

export async function getFidelizePlanRecord(plan: FidelizePlan): Promise<FidelizePlanRecord> {
  const records = await getFidelizePlanRecords();
  return records.find((r) => r.plan === plan)!;
}

export async function saveFidelizePlanOverrides(
  input: { plan: FidelizePlan; price: number; active: boolean }[],
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: current } = await supabaseAdmin
    .from("integrations")
    .select("id, settings")
    .eq("category", "fidelize")
    .maybeSingle();

  const settings = { ...((current?.settings || {}) as Record<string, unknown>) };
  const plans = { ...((settings["plans"] || {}) as Record<string, PlanOverride>) };

  for (const item of input) {
    plans[item.plan] = { ...(plans[item.plan] || {}), price: item.price, active: item.active };
  }
  settings["plans"] = plans;

  if (current?.id) {
    const { error } = await supabaseAdmin
      .from("integrations")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", current.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("integrations").insert([
      {
        name: "Fidelize",
        type: "ia" as const,
        category: "fidelize",
        status: false,
        credentials: {},
        settings,
      },
    ]);
    if (error) throw error;
  }
}
