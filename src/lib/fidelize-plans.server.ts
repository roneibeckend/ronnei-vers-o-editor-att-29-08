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
  cover: string;
  tagline: string;
  highlight: boolean;
  /** Texto do botão de compra exibido ao aluno. */
  ctaLabel: string;
  /** Ordem de exibição dos cards (menor primeiro). */
  sortOrder: number;
  /** true quando o preço/status foi personalizado pelo admin. */
  customized: boolean;
};

export type FidelizePlanOverride = Partial<{
  price: number;
  active: boolean;
  label: string;
  description: string;
  coverUrl: string;
  tagline: string;
  modules: string[];
  highlight: boolean;
  ctaLabel: string;
  sortOrder: number;
}>;

type PlanOverride = FidelizePlanOverride;

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

  return FIDELIZE_PLANS.map((plan, index) => {
    const base = FIDELIZE_PLAN_CATALOG[plan];
    const override = overrides[plan] || {};
    const price = Number.isFinite(Number(override.price)) && Number(override.price) > 0 ? Number(override.price) : base.price;
    const modules = Array.isArray(override.modules) && override.modules.length ? override.modules : base.modules;

    return {
      plan,
      label: override.label?.trim() || base.label,
      description: override.description?.trim() || base.description,
      modules,
      price,
      active: override.active !== false,
      cover: override.coverUrl?.trim() || base.cover,
      tagline: override.tagline?.trim() || base.tagline,
      highlight: typeof override.highlight === "boolean" ? override.highlight : Boolean(base.highlight),
      ctaLabel: override.ctaLabel?.trim() || "Assinar agora",
      sortOrder: Number.isFinite(Number(override.sortOrder)) ? Number(override.sortOrder) : index,
      customized: Object.keys(override).length > 0,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getFidelizePlanRecord(plan: FidelizePlan): Promise<FidelizePlanRecord> {
  const records = await getFidelizePlanRecords();
  return records.find((r) => r.plan === plan)!;
}

export async function saveFidelizePlanOverrides(
  input: ({ plan: FidelizePlan; reset?: boolean } & FidelizePlanOverride)[],
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
    if (item.reset) {
      delete plans[item.plan];
      continue;
    }
    plans[item.plan] = {
      ...(plans[item.plan] || {}),
      price: item.price,
      active: item.active,
      label: item.label?.trim() || undefined,
      tagline: item.tagline?.trim() || undefined,
      description: item.description?.trim() || undefined,
      coverUrl: item.coverUrl?.trim() || undefined,
      ctaLabel: item.ctaLabel?.trim() || undefined,
      modules: item.modules?.map((m) => m.trim()).filter(Boolean),
      highlight: item.highlight,
      sortOrder: item.sortOrder,
    };
  }
  settings["plans"] = plans;

  if (current?.id) {
    const { error } = await supabaseAdmin
      .from("integrations")
      .update({ settings: settings as never, updated_at: new Date().toISOString() })
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
        settings: settings as never,
      },
    ]);
    if (error) throw error;
  }
}
