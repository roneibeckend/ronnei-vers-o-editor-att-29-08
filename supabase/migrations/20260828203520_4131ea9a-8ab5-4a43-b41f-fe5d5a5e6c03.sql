SELECT cron.schedule(
  'expire-consultation-holds',
  '*/5 * * * *',
  $$ SELECT public.expire_consultation_holds(); $$
);