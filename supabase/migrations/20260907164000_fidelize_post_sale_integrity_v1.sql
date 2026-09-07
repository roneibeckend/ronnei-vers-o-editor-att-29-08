-- Integridade do pós-venda Fidelize.
-- Esta migration de dados também foi aplicada de forma controlada em produção
-- durante o incidente para normalizar registros já afetados.

update public.fidelize_provisioning_logs
set login_url = replace(login_url, 'http://localhost:8080', 'https://afidelize.app'),
    updated_at = now()
where login_url like 'http://localhost:8080/%';

update public.fidelize_provisioning_logs
set response_payload = coalesce(response_payload, '{}'::jsonb)
  - 'temporary_password'
  - 'autologin_token'
  - 'autologin_url'
  - 'login_url',
    updated_at = now()
where response_payload ?| array['temporary_password','autologin_token','autologin_url','login_url'];

update public.system_logs
set details = jsonb_set(
  details,
  '{response,body}',
  to_jsonb('[redacted sensitive Fidelize response]'::text),
  false
)
where source = 'fidelize'
  and details #>> '{response,body}' is not null
  and (details #>> '{response,body}') ~* '(temporary_password|autologin_token|autologin_url|login_url)';

update public.email_logs e
set status = 'ignored',
    resolved_at = coalesce(e.resolved_at, now()),
    next_retry_at = null
where e.template_name = 'fidelize_access'
  and e.status in ('error','failed')
  and e.retry_payload is null
  and e.resolved_at is null
  and exists (
    select 1
    from public.email_logs s
    where s.recipient_email = e.recipient_email
      and s.template_name = 'fidelize_access'
      and s.status = 'sent'
      and s.created_at >= e.created_at
      and s.created_at <= e.created_at + interval '10 minutes'
  );

update public.payment_reconciliations r
set status = 'ignored',
    resolved_at = coalesce(r.resolved_at, now()),
    details = coalesce(r.details, '{}'::jsonb) || jsonb_build_object(
      'resolution_reason', 'fidelize_provisioned_successfully'
    ),
    updated_at = now()
where r.status = 'pending'
  and r.product_type = 'fidelize'
  and exists (
    select 1
    from public.fidelize_provisioning_logs f
    where f.user_id = r.user_id
      and f.plan = r.product_id
      and f.status = 'success'
  );

update public.ops_alerts
set status = 'resolved',
    updated_at = now()
where status = 'open'
  and resolved_at is not null;

update public.ops_alerts a
set status = 'resolved',
    resolved_at = coalesce(a.resolved_at, now()),
    updated_at = now()
where a.status = 'open'
  and a.type = 'payment_without_access'
  and not exists (
    select 1
    from jsonb_array_elements_text(coalesce(a.details->'items', '[]'::jsonb)) item
    join public.payment_reconciliations r
      on r.external_id = item.value
    where r.status = 'pending'
  );
