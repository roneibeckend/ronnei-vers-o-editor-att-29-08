CREATE OR REPLACE FUNCTION public.trigger_consultation_followups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
BEGIN
  SELECT cron_token INTO v_token FROM public.report_settings LIMIT 1;
  IF v_token IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://project--073728f2-82a9-4bf5-8d82-91d16c0d19c4.lovable.app/api/public/consultation-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_consultation_followups() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('consultation_followups', '0 15 * * *', 'SELECT public.trigger_consultation_followups()');