import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processContentEmailCampaignBatch } from "@/lib/content-email-campaign.server";

const JOB = "content_email_campaigns";
const LOCK_MINUTES = 1;

export const Route = createFileRoute("/api/public/content-email-campaigns")({
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

        const db = supabaseAdmin as any;
        const nowIso = new Date().toISOString();
        const { data: job } = await db
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

        const lockedUntil = new Date(
          Date.now() + LOCK_MINUTES * 60_000,
        ).toISOString();

        await db.from("ops_job_runs").upsert(
          {
            job: JOB,
            locked_until: lockedUntil,
            last_run_at: nowIso,
            last_status: "running",
          },
          { onConflict: "job" },
        );

        try {
          const result = await processContentEmailCampaignBatch(20);

          await db
            .from("ops_job_runs")
            .update({
              locked_until: null,
              last_status: "success",
              last_error: null,
              last_run_at: new Date().toISOString(),
            })
            .eq("job", JOB);

          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error: any) {
          await db
            .from("ops_job_runs")
            .update({
              locked_until: null,
              last_status: "error",
              last_error: error?.message || "Erro desconhecido",
            })
            .eq("job", JOB);

          console.error("[content-email-campaigns] Falha:", error);

          return new Response(
            JSON.stringify({ ok: false, error: "Falha ao processar campanha de e-mail." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
