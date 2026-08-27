import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runConsultationReminders } from "@/lib/consultations.server";

const JOB = "consultation_reminders";
const LOCK_MINUTES = 5;

export const Route = createFileRoute("/api/public/consultation-reminders")({
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

        // ---- Trava de execução única ----
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
          const result = await runConsultationReminders();
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
          console.error("[consultation-reminders] Falha:", err);
          return Response.json({ ok: false, error: "Falha na rotina de lembretes." }, { status: 500 });
        }
      },
    },
  },
});
