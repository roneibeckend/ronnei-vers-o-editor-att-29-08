alter table public.email_templates
  add column if not exists is_production_override boolean not null default false;

comment on column public.email_templates.is_production_override is
  'Quando true, este template do banco tem prioridade sobre o template de mesmo nome definido em código.';

create index if not exists email_templates_production_override_idx
  on public.email_templates (name)
  where is_production_override = true;
