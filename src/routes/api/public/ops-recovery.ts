import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runOpsRecovery } from "@/lib/ops-recovery.server";

const JOB = "ops_recovery";
const LOCK_MINUTES = 10;

export const Route = createFileRoute("/api/public/ops-recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ---- Autenticação: segredo interno, token do agendador ou admin logado ----
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Não autorizado", { status: 401 });
        }
        const token = authHeader.slice(7);
        let authorized = false;

        const internalSecret = process.env["REPORT_INTERNAL_SECRET"];
        if (internalSecret && token === internalSecret) authorized = true;

        if (!authorized) {
          const { data: settings } = await supabaseAdmin
            .from("report_settings")
            .select("cron_token")
            .limit(1)
            .maybeSingle();
          if (settings?.cron_token && token === settings.cron_token) authorized = true;
        }

        if (!authorized) {
          const { data: userData } = await supabaseAdmin.auth.getUser(token);
          if (userData?.user) {
            const { data: roleRow } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", userData.user.id)
              .eq("role", "admin")
              .maybeSingle();
            if (roleRow) authorized = true;
          }
        }

        if (!authorized) return new Response("Não autorizado", { status: 401 });

        // ---- Guarda de pausa + trava de execução única ----
        const nowIso = new Date().toISOString();
        const { data: job } = await supabaseAdmin
          .from("ops_job_runs")
          .select("*")
          .eq("job", JOB)
          .maybeSingle();

        if (job?.paused) {
          return new Response(
            JSON.stringify({ skipped: true, reason: job.pause_reason || "Rotina pausada." }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (job?.locked_until && job.locked_until > nowIso) {
          return new Response(JSON.stringify({ skipped: true, reason: "Execução em andamento." }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        await supabaseAdmin
          .from("ops_job_runs")
          .upsert({ job: JOB, locked_until: lockedUntil, last_run_at: nowIso, last_status: "running" }, { onConflict: "job" });

        try {
          const result = await runOpsRecovery();
          await supabaseAdmin
            .from("ops_job_runs")
            .update({ locked_until: null, last_status: "success", last_error: null, last_run_at: new Date().toISOString() })
            .eq("job", JOB);

          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          await supabaseAdmin
            .from("ops_job_runs")
            .update({ locked_until: null, last_status: "error", last_error: err?.message || "Erro desconhecido" })
            .eq("job", JOB);
          console.error("[ops-recovery] Falha na execução:", err);
          return new Response(JSON.stringify({ ok: false, error: "Falha na rotina de recuperação." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
