CREATE OR REPLACE FUNCTION public.trigger_ops_recovery()
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
    url := 'https://project--cac2b68e-b9e1-49c9-a49c-b3d048396221.lovable.app/api/public/ops-recovery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_ops_recovery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_ops_recovery() TO postgres, service_role;