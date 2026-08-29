CREATE TABLE IF NOT EXISTS public.fidelize_provisioning_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan TEXT NOT NULL,
  tenant_id TEXT,
  fidelize_user_id TEXT,
  login_url TEXT,
  slug TEXT,
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fidelize_provisioning_logs_order_idx
  ON public.fidelize_provisioning_logs (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fidelize_provisioning_logs_user_idx
  ON public.fidelize_provisioning_logs (user_id, created_at DESC);

GRANT SELECT ON public.fidelize_provisioning_logs TO authenticated;
GRANT ALL ON public.fidelize_provisioning_logs TO service_role;

ALTER TABLE public.fidelize_provisioning_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fidelize provisioning"
ON public.fidelize_provisioning_logs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_fidelize_provisioning_logs_updated_at
BEFORE UPDATE ON public.fidelize_provisioning_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();