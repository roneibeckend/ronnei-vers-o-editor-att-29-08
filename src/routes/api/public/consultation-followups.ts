import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const JOB = "consultation_followups";
const LOCK_MINUTES = 5;

/**
 * Rotina diária do acompanhamento pós-consultoria:
 * avisa os feedbacks vencidos (30 dias) e dispara lembretes de 24h e 1h.
 */
export const Route = createFileRoute("/api/public/consultation-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const nowIso = new Date().toISOString();
        const { data: job } = await supabaseAdmin
          .from("ops_job_runs")
          .select("*")
          .eq("job", JOB)
          .maybeSingle();

        if (job?.paused) {
          return Response.json({ skipped: true, reason: job.pause_reason || "Rotina pausada." });
        }
        if (job?.locked_until && job.locked_until > nowIso) {
          return Response.json({ skipped: true, reason: "Execução em andamento." });
        }

        await supabaseAdmin.from("ops_job_runs").upsert(
          {
            job: JOB,
            locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString(),
            last_run_at: nowIso,
            last_status: "running",
          },
          { onConflict: "job" },
        );

        try {
          const { runConsultationFollowups } = await import("@/lib/consultation-followups.server");
          const result = await runConsultationFollowups();
          await supabaseAdmin
            .from("ops_job_runs")
            .update({
              locked_until: null,
              last_status: "success",
              last_error: null,
              last_run_at: new Date().toISOString(),
            })
            .eq("job", JOB);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = (err as Error)?.message || "Erro desconhecido";
          await supabaseAdmin
            .from("ops_job_runs")
            .update({ locked_until: null, last_status: "error", last_error: message })
            .eq("job", JOB);
          console.error("[consultation-followups] Falha:", err);
          return Response.json({ ok: false, error: "Falha na rotina de acompanhamento." }, { status: 500 });
        }
      },
    },
  },
});
