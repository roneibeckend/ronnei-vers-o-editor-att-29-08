create or replace function public.trigger_fidelize_health()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_token text;
  v_request_id bigint;
begin
  select rs.cron_token
    into v_token
  from public.report_settings rs
  where rs.cron_token is not null
    and pg_catalog.btrim(rs.cron_token) <> ''
  limit 1;

  if v_token is null then
    return;
  end if;

  select net.http_post(
    url := 'https://ronneinaveia.com.br/api/public/fidelize-health',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_request_id;
end;
$function$;

create or replace function public.trigger_consultation_reminders()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_token text;
  v_request_id bigint;
begin
  select rs.cron_token
    into v_token
  from public.report_settings rs
  where rs.cron_token is not null
    and pg_catalog.btrim(rs.cron_token) <> ''
  limit 1;

  if v_token is null then
    return;
  end if;

  select net.http_post(
    url := 'https://ronneinaveia.com.br/api/public/consultation-reminders',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_request_id;
end;
$function$;

create or replace function public.trigger_consultation_recordings()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_token text;
  v_request_id bigint;
begin
  select rs.cron_token
    into v_token
  from public.report_settings rs
  where rs.cron_token is not null
    and pg_catalog.btrim(rs.cron_token) <> ''
  limit 1;

  if v_token is null then
    return;
  end if;

  select net.http_post(
    url := 'https://ronneinaveia.com.br/api/public/consultation-recordings',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_request_id;
end;
$function$;

create or replace function public.trigger_consultation_followups()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_token text;
  v_request_id bigint;
begin
  select rs.cron_token
    into v_token
  from public.report_settings rs
  where rs.cron_token is not null
    and pg_catalog.btrim(rs.cron_token) <> ''
  limit 1;

  if v_token is null then
    return;
  end if;

  select net.http_post(
    url := 'https://ronneinaveia.com.br/api/public/consultation-followups',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_request_id;
end;
$function$;

create or replace function public.trigger_daily_report()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_token text;
  v_enabled boolean;
  v_request_id bigint;
begin
  select rs.cron_token, coalesce(rs.enabled, true)
    into v_token, v_enabled
  from public.report_settings rs
  limit 1;

  if v_token is null
     or pg_catalog.btrim(v_token) = ''
     or v_enabled is false then
    return;
  end if;

  select net.http_post(
    url := 'https://ronneinaveia.com.br/api/public/daily-financial-report',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_request_id;
end;
$function$;

do $do$
declare
  v_jobid bigint;
  v_command text;
begin
  select j.jobid
    into v_jobid
  from cron.job j
  where j.jobname = 'daily-updates-report'
  limit 1;

  if v_jobid is not null then
    v_command := $cmd$
      select net.http_post(
        url := 'https://ronneinaveia.com.br/api/public/daily-updates-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' ||
            (select cron_token from public.report_settings limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      ) as request_id;
    $cmd$;

    perform cron.alter_job(
      job_id := v_jobid,
      command := v_command
    );
  end if;
end;
$do$;

update public.asaas_webhook_events e
set
  status = 'ignored',
  processed_at = coalesce(e.processed_at, now()),
  last_error = 'Evento encerrado sem alerta: reconciliação já arquivada ou corrigida.'
where e.status = 'failed'
  and exists (
    select 1
    from public.payment_reconciliations r
    where r.external_id = e.payment_id
      and r.status in ('ignored', 'fixed')
  );

update public.ops_alerts a
set resolved_at = coalesce(a.resolved_at, now())
where a.type = 'webhook_failed'
  and a.resolved_at is null
  and exists (
    select 1
    from public.asaas_webhook_events e
    join public.payment_reconciliations r
      on r.external_id = e.payment_id
    where a.dedup_key = 'webhook_failed:' || e.event_id
      and r.status in ('ignored', 'fixed')
  );

update public.admin_notifications n
set
  read = true,
  read_at = coalesce(n.read_at, now())
where n.dedup_key like 'ops:webhook_failed:%'
  and exists (
    select 1
    from public.asaas_webhook_events e
    join public.payment_reconciliations r
      on r.external_id = e.payment_id
    where n.dedup_key = 'ops:webhook_failed:' || e.event_id
      and r.status in ('ignored', 'fixed')
  );
