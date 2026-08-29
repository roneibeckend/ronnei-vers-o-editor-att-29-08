ALTER TABLE public.fidelize_provisioning_logs
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_plan text,
  ADD COLUMN IF NOT EXISTS migrated_to_fidelize boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_canceled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.fidelize_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE,
  event_type text NOT NULL,
  user_id uuid,
  provisioning_log_id uuid REFERENCES public.fidelize_provisioning_logs(id) ON DELETE SET NULL,
  tenant_id text,
  email text,
  previous_plan text,
  new_plan text,
  subscription_id text,
  subscription_canceled boolean NOT NULL DEFAULT false,
  cancel_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processed',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fidelize_lifecycle_events TO authenticated;
GRANT ALL ON public.fidelize_lifecycle_events TO service_role;

ALTER TABLE public.fidelize_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver eventos de ciclo de vida Fidelize"
  ON public.fidelize_lifecycle_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Aluno ve seus proprios eventos Fidelize"
  ON public.fidelize_lifecycle_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS fidelize_lifecycle_events_user_idx ON public.fidelize_lifecycle_events (user_id, created_at DESC);

CREATE TRIGGER update_fidelize_lifecycle_events_updated_at
  BEFORE UPDATE ON public.fidelize_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();