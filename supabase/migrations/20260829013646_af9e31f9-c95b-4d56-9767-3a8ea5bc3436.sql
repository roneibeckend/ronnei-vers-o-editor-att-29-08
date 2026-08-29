ALTER TABLE public.fidelize_provisioning_logs
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS endpoint TEXT;

CREATE INDEX IF NOT EXISTS idx_fidelize_logs_created_at ON public.fidelize_provisioning_logs (created_at DESC);

INSERT INTO public.ops_job_runs (job) VALUES ('fidelize_health') ON CONFLICT (job) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trigger_fidelize_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT cron_token INTO v_token FROM public.report_settings LIMIT 1;
  IF v_token IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://project--d1f36df5-e296-476a-9ac5-df68d64a889f.lovable.app/api/public/fidelize-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_fidelize_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_fidelize_health() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_fidelize_health() TO postgres, service_role;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('fidelize_health');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule('fidelize_health', '*/30 * * * *', 'SELECT public.trigger_fidelize_health()');
END;
$$;