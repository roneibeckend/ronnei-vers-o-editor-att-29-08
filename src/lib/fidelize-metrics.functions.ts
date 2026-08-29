import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Métricas comerciais da Fidelize para o painel administrativo:
 * contas ativas por plano e projeção de receita recorrente do próximo mês.
 */
export const getFidelizeRevenueSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getFidelizePlanRecords } = await import("@/lib/fidelize-plans.server");

    const [{ data: rows }, plans] = await Promise.all([
      supabaseAdmin
        .from("fidelize_provisioning_logs")
        .select("plan, status, subscription_status, is_test, created_at")
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(2000),
      getFidelizePlanRecords(),
    ]);

    const priceOf = (plan: string) => plans.find((p) => p.plan === plan)?.price ?? 0;
    const labelOf = (plan: string) => plans.find((p) => p.plan === plan)?.label ?? plan;

    const real = (rows || []).filter((r) => !r.is_test);

    const active = real.filter((r) => (r.subscription_status ?? "active") === "active");
    const overdue = real.filter((r) => r.subscription_status === "overdue");
    const canceled = real.filter((r) => r.subscription_status === "canceled");

    const byPlan = plans.map((p) => {
      const activeCount = active.filter((r) => r.plan === p.plan).length;
      return {
        plan: p.plan,
        label: p.label,
        price: p.price,
        activeCount,
        monthly: activeCount * p.price,
      };
    });

    const monthlyProjection = byPlan.reduce((acc, p) => acc + p.monthly, 0);
    const overdueValue = overdue.reduce((acc, r) => acc + priceOf(String(r.plan)), 0);

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const newThisMonth = real.filter((r) => new Date(r.created_at) >= startOfMonth).length;

    void labelOf;

    return {
      totalCustomers: real.length,
      activeCustomers: active.length,
      overdueCustomers: overdue.length,
      canceledCustomers: canceled.length,
      newThisMonth,
      monthlyProjection,
      overdueValue,
      averageTicket: active.length ? monthlyProjection / active.length : 0,
      byPlan,
    };
  });
