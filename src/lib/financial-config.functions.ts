import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const costSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  value: z.number().finite().min(0).max(999999999.99),
});

const partnerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  percent: z.number().finite().min(0).max(100),
  user_id: z.string().uuid().optional().nullable(),
});

async function requireAdmin(context: any) {
  const db = context.supabase as any;

  const { data: isAdmin, error } = await db.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });

  if (error || !isAdmin) {
    throw new Error("Acesso negado: permissão de administrador necessária.");
  }

  return db;
}

export const getFinancialConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context);

    const [settingsRes, costsRes, partnersRes] = await Promise.all([
      db
        .from("financial_settings")
        .select("manual_revenue, updated_at")
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .maybeSingle(),

      db
        .from("financial_costs")
        .select("id, label, value, created_at")
        .order("created_at", { ascending: true }),

      db
        .from("financial_partners")
        .select("id, name, percent, user_id, created_at")
        .order("created_at", { ascending: true }),
    ]);

    if (settingsRes.error) throw new Error(settingsRes.error.message);
    if (costsRes.error) throw new Error(costsRes.error.message);
    if (partnersRes.error) throw new Error(partnersRes.error.message);

    return {
      version: settingsRes.data?.updated_at ?? null,
      manualRevenue: Number(settingsRes.data?.manual_revenue ?? 0),

      costs: (costsRes.data ?? []).map((c: any) => ({
        id: c.id,
        label: c.label,
        value: Number(c.value) || 0,
      })),

      partners: (partnersRes.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        percent: Number(p.percent) || 0,
        user_id: p.user_id ?? null,
      })),
    };
  });

export const saveFinancialConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        expectedVersion: z.string().max(80).optional().nullable(),
        costs: z.array(costSchema).max(200),
        partners: z.array(partnerSchema).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context);

    const { data: result, error } = await db.rpc(
      "save_financial_config_v2",
      {
        p_expected_version: data.expectedVersion ?? null,
        p_costs: data.costs,
        p_partners: data.partners,
      },
    );

    if (error) {
      if (
        error.code === "40001" ||
        String(error.message || "").includes("FINANCIAL_CONFIG_CONFLICT")
      ) {
        throw new Error(
          "Os dados financeiros foram alterados em outra aba. Atualize a página antes de salvar novamente.",
        );
      }

      if (error.code === "42501") {
        throw new Error("Você não possui permissão para alterar o financeiro.");
      }

      throw new Error(
        "Falha ao salvar configurações financeiras: " +
          (error.message || "erro desconhecido"),
      );
    }

    const saved = result as any;

    return {
      version: saved?.version ?? null,

      costs: Array.isArray(saved?.costs)
        ? saved.costs.map((c: any) => ({
            id: String(c.id),
            label: String(c.label),
            value: Number(c.value) || 0,
          }))
        : [],

      partners: Array.isArray(saved?.partners)
        ? saved.partners.map((p: any) => ({
            id: String(p.id),
            name: String(p.name),
            percent: Number(p.percent) || 0,
            user_id: p.user_id ? String(p.user_id) : null,
          }))
        : [],
    };
  });
