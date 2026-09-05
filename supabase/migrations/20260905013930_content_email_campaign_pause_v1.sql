alter table public.content_email_campaigns
  add column if not exists next_run_at timestamptz;

create index if not exists content_email_campaigns_next_run_idx
  on public.content_email_campaigns (status, next_run_at, created_at);

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
    and (c.next_run_at is null or c.next_run_at <= now())
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
      next_run_at = null,
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
