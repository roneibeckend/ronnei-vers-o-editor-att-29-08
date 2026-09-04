create or replace function public.save_financial_config_v2(
  p_expected_version timestamptz default null,
  p_costs jsonb default '[]'::jsonb,
  p_partners jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings_id constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_current_version timestamptz;
  v_new_version timestamptz := clock_timestamp();
  v_item jsonb;
  v_id_text text;
  v_id uuid;
  v_label text;
  v_value numeric;
  v_name text;
  v_percent numeric;
  v_partner_user_id uuid;
  v_keep_cost_ids uuid[] := array[]::uuid[];
  v_keep_partner_ids uuid[] := array[]::uuid[];
begin
  if v_user_id is null
     or not public.has_role(v_user_id, 'admin'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_costs, '[]'::jsonb)) <> 'array' then
    raise exception 'COSTS_MUST_BE_ARRAY' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_partners, '[]'::jsonb)) <> 'array' then
    raise exception 'PARTNERS_MUST_BE_ARRAY' using errcode = '22023';
  end if;

  insert into public.financial_settings (id, manual_revenue, updated_at)
  values (v_settings_id, 0, v_new_version)
  on conflict (id) do nothing;

  select updated_at
  into v_current_version
  from public.financial_settings
  where id = v_settings_id
  for update;

  if p_expected_version is not null
     and v_current_version is distinct from p_expected_version then
    raise exception 'FINANCIAL_CONFIG_CONFLICT' using errcode = '40001';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb))
  loop
    v_label := btrim(coalesce(v_item ->> 'label', ''));

    if v_label = '' or length(v_label) > 120 then
      raise exception 'INVALID_COST_LABEL' using errcode = '22023';
    end if;

    begin
      v_value := coalesce((v_item ->> 'value')::numeric, 0);
    exception when others then
      raise exception 'INVALID_COST_VALUE' using errcode = '22023';
    end;

    if v_value < 0 or v_value > 999999999.99 then
      raise exception 'INVALID_COST_VALUE' using errcode = '22023';
    end if;

    -- Gerenciado automaticamente pelo webhook Asaas.
    if lower(v_label) = 'taxas de gateway' then
      continue;
    end if;

    v_id := null;
    v_id_text := nullif(v_item ->> 'id', '');

    if v_id_text is not null
       and v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id := v_id_text::uuid;
    end if;

    if v_id is not null and exists (
      select 1
      from public.financial_costs
      where id = v_id
        and lower(btrim(label)) <> 'taxas de gateway'
    ) then
      update public.financial_costs
      set
        label = v_label,
        value = v_value,
        updated_at = v_new_version
      where id = v_id;
    else
      insert into public.financial_costs (label, value, updated_at)
      values (v_label, v_value, v_new_version)
      returning id into v_id;
    end if;

    v_keep_cost_ids := array_append(v_keep_cost_ids, v_id);
  end loop;

  delete from public.financial_costs
  where lower(btrim(label)) <> 'taxas de gateway'
    and not (id = any(v_keep_cost_ids));

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_partners, '[]'::jsonb))
  loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));

    if v_name = '' or length(v_name) > 120 then
      raise exception 'INVALID_PARTNER_NAME' using errcode = '22023';
    end if;

    begin
      v_percent := coalesce((v_item ->> 'percent')::numeric, 0);
    exception when others then
      raise exception 'INVALID_PARTNER_PERCENT' using errcode = '22023';
    end;

    if v_percent < 0 or v_percent > 100 then
      raise exception 'INVALID_PARTNER_PERCENT' using errcode = '22023';
    end if;

    v_partner_user_id := null;

    if nullif(v_item ->> 'user_id', '') is not null then
      begin
        v_partner_user_id := (v_item ->> 'user_id')::uuid;
      exception when others then
        raise exception 'INVALID_PARTNER_USER' using errcode = '22023';
      end;
    end if;

    v_id := null;
    v_id_text := nullif(v_item ->> 'id', '');

    if v_id_text is not null
       and v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id := v_id_text::uuid;
    end if;

    if v_id is not null and exists (
      select 1
      from public.financial_partners
      where id = v_id
    ) then
      update public.financial_partners
      set
        name = v_name,
        percent = v_percent,
        user_id = v_partner_user_id,
        updated_at = v_new_version
      where id = v_id;
    else
      insert into public.financial_partners
        (name, percent, user_id, updated_at)
      values
        (v_name, v_percent, v_partner_user_id, v_new_version)
      returning id into v_id;
    end if;

    v_keep_partner_ids :=
      array_append(v_keep_partner_ids, v_id);
  end loop;

  delete from public.financial_partners
  where not (id = any(v_keep_partner_ids));

  update public.financial_settings
  set updated_at = v_new_version
  where id = v_settings_id;

  return jsonb_build_object(
    'version', v_new_version,

    'costs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'label', label,
          'value', value
        )
        order by created_at, id
      )
      from public.financial_costs
    ), '[]'::jsonb),

    'partners', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'percent', percent,
          'user_id', user_id
        )
        order by created_at, id
      )
      from public.financial_partners
    ), '[]'::jsonb)
  );
end;
$$;

revoke all
on function public.save_financial_config_v2(timestamptz, jsonb, jsonb)
from public;

grant execute
on function public.save_financial_config_v2(timestamptz, jsonb, jsonb)
to authenticated;

grant execute
on function public.save_financial_config_v2(timestamptz, jsonb, jsonb)
to service_role;
