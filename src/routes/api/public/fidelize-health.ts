import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const JOB = "fidelize_health";

async function isAuthorized(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);

  const internalSecret = process.env["REPORT_INTERNAL_SECRET"];
  if (internalSecret && token === internalSecret) return true;

  const { data: settings } = await supabaseAdmin
    .from("report_settings")
    .select("cron_token")
    .limit(1)
    .maybeSingle();
  if (settings?.cron_token && token === settings.cron_token) return true;

  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  if (userData?.user) {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleRow) return true;
  }
  return false;
}

export const Route = createFileRoute("/api/public/fidelize-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) {
          return new Response("Não autorizado", { status: 401 });
        }

        const { data: job } = await supabaseAdmin
          .from("ops_job_runs")
          .select("paused, pause_reason")
          .eq("job", JOB)
          .maybeSingle();

        if (job?.paused) {
          return Response.json({ skipped: true, reason: job.pause_reason || "Rotina pausada." });
        }

        try {
          const { runFidelizeHealthCheck } = await import("@/lib/fidelize.server");
          const result = await runFidelizeHealthCheck();

          await supabaseAdmin.from("ops_job_runs").upsert(
            {
              job: JOB,
              last_run_at: new Date().toISOString(),
              last_status: result.skipped ? "skipped" : result.success ? "success" : "error",
              last_error: result.skipped ? null : result.success ? null : `HTTP ${result.httpCode}`,
              locked_until: null,
            },
            { onConflict: "job" },
          );

          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = (err as Error)?.message || "Erro desconhecido";
          await supabaseAdmin
            .from("ops_job_runs")
            .update({ last_status: "error", last_error: message, locked_until: null })
            .eq("job", JOB);
          return Response.json({ ok: false, error: "Falha no health check da Fidelize." }, { status: 500 });
        }
      },
    },
  },
});
