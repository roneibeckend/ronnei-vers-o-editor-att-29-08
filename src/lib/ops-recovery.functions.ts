import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const idSchema = (data: unknown) => z.object({ id: z.string().uuid() }).parse(data);

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Acesso negado: permissão de administrador necessária.");
}

export const getOpsRecoveryOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [reconciliations, emails, alerts, job] = await Promise.all([
      supabaseAdmin
        .from("payment_reconciliations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("email_logs")
        .select("id, recipient_email, template_name, status, attempts, next_retry_at, error_message, created_at, resolved_at")
        .in("status", ["failed", "failed_permanent", "error"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("ops_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("ops_job_runs").select("*").eq("job", "ops_recovery").maybeSingle(),
    ]);

    return {
      reconciliations: reconciliations.data || [],
      emails: emails.data || [],
      alerts: alerts.data || [],
      job: job.data || null,
    };
  });

export const runOpsRecoveryNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runOpsRecovery } = await import("@/lib/ops-recovery.server");
    return await runOpsRecovery();
  });

export const fixReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idSchema)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { reprocessReconciliation } = await import("@/lib/ops-recovery.server");
    return await reprocessReconciliation(data.id);
  });

export const ignoreReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idSchema)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("payment_reconciliations")
      .update({ status: "ignored", resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

export const retryEmailQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idSchema)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { retryEmailNow } = await import("@/lib/ops-recovery.server");
    return await retryEmailNow(data.id);
  });

export const resolveOpsAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idSchema)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("ops_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });
