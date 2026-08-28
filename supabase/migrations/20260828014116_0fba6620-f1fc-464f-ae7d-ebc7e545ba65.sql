CREATE OR REPLACE FUNCTION public.trigger_consultation_reminders()
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
    url := 'https://project--19870d22-c8ea-4f04-9619-f074c2594e7b.lovable.app/api/public/consultation-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_consultation_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_consultation_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_consultation_reminders() TO postgres, service_role;

INSERT INTO public.ops_job_runs (job)
VALUES ('consultation_reminders')
ON CONFLICT (job) DO NOTHING;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('consultation_reminders');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule('consultation_reminders', '*/15 * * * *', 'SELECT public.trigger_consultation_reminders()');
END;
$$;