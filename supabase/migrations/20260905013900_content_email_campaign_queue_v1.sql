create table if not exists public.content_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('course','ebook')),
  content_id text not null,
  title text not null,
  event text not null check (event in ('new_course','new_ebook')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','completed_with_errors','cancelled')),
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  last_error text
);

create index if not exists content_email_campaigns_status_idx
  on public.content_email_campaigns (status, created_at);
create index if not exists content_email_campaigns_content_idx
  on public.content_email_campaigns (content_type, content_id, created_at desc);

create table if not exists public.content_email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.content_email_campaigns(id) on delete cascade,
  user_id uuid,
  email text not null,
  name text,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create unique index if not exists content_email_recipients_campaign_email_uidx
  on public.content_email_recipients (campaign_id, lower(trim(email)));
create index if not exists content_email_recipients_queue_idx
  on public.content_email_recipients (campaign_id, status, next_retry_at, created_at);

alter table public.content_email_campaigns enable row level security;
alter table public.content_email_recipients enable row level security;

grant select on public.content_email_campaigns to authenticated;
grant select on public.content_email_recipients to authenticated;
grant all on public.content_email_campaigns to service_role;
grant all on public.content_email_recipients to service_role;

drop policy if exists "Admins can view content email campaigns" on public.content_email_campaigns;
create policy "Admins can view content email campaigns"
  on public.content_email_campaigns
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can view content email recipients" on public.content_email_recipients;
create policy "Admins can view content email recipients"
  on public.content_email_recipients
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop trigger if exists content_email_campaigns_updated_at on public.content_email_campaigns;
create trigger content_email_campaigns_updated_at
  before update on public.content_email_campaigns
  for each row execute function public.update_updated_at_column();

drop trigger if exists content_email_recipients_updated_at on public.content_email_recipients;
create trigger content_email_recipients_updated_at
  before update on public.content_email_recipients
  for each row execute function public.update_updated_at_column();

create or replace function public.claim_content_email_recipients(p_limit integer default 20)
returns table (
  recipient_id uuid,
  campaign_id uuid,
  user_id uuid,
  email text,
  name text,
  attempts integer,
  event text,
  content_type text,
  content_id text,
  campaign_title text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  select c.id into v_campaign_id
  from public.content_email_campaigns c
  where c.status in ('queued','processing')
    and exists (
      select 1
      from public.content_email_recipients r
      where r.campaign_id = c.id
        and (
          r.status = 'queued'
          or (
            r.status = 'failed'
            and r.attempts < 3
            and (r.next_retry_at is null or r.next_retry_at <= now())
          )
        )
    )
  order by c.created_at asc
  for update skip locked
  limit 1;

  if v_campaign_id is null then
    return;
  end if;

  update public.content_email_campaigns
  set status = 'processing',
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = v_campaign_id;

  return query
  with picked as (
    select r.id
    from public.content_email_recipients r
    where r.campaign_id = v_campaign_id
      and (
        r.status = 'queued'
        or (
          r.status = 'failed'
          and r.attempts < 3
          and (r.next_retry_at is null or r.next_retry_at <= now())
        )
      )
    order by r.created_at asc
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.content_email_recipients r
    set status = 'processing',
        updated_at = now()
    from picked p
    where r.id = p.id
    returning r.*
  )
  select
    r.id,
    r.campaign_id,
    r.user_id,
    r.email,
    r.name,
    r.attempts,
    c.event,
    c.content_type,
    c.content_id,
    c.title,
    c.payload
  from claimed r
  join public.content_email_campaigns c on c.id = r.campaign_id;
end;
$$;

revoke all on function public.claim_content_email_recipients(integer) from public, anon, authenticated;
grant execute on function public.claim_content_email_recipients(integer) to service_role;

create or replace function public.trigger_content_email_campaigns()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select cron_token into v_token from public.report_settings limit 1;
  if v_token is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://ronneinaveia.com.br/api/public/content-email-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.trigger_content_email_campaigns() from public, anon, authenticated;
grant execute on function public.trigger_content_email_campaigns() to service_role;

do $$
begin
  begin
    perform cron.unschedule('content_email_campaigns');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'content_email_campaigns',
    '*/2 * * * *',
    'select public.trigger_content_email_campaigns()'
  );
end;
$$;
