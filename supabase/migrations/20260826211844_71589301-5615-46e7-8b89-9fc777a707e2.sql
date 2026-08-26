-- 1. Fila de reenvio de e-mails
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_payload jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS email_logs_retry_idx
  ON public.email_logs (status, next_retry_at)
  WHERE resolved_at IS NULL;

-- 2. Alertas operacionais
CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  dedup_key text NOT NULL,
  severity text NOT NULL DEFAULT 'critical',
  title text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_alerts_dedup_idx ON public.ops_alerts (dedup_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ops_alerts_status_idx ON public.ops_alerts (status, created_at DESC);

GRANT SELECT, UPDATE ON public.ops_alerts TO authenticated;
GRANT ALL ON public.ops_alerts TO service_role;
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ops alerts" ON public.ops_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can resolve ops alerts" ON public.ops_alerts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ops_alerts_updated_at BEFORE UPDATE ON public.ops_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Reconciliação de pagamentos
CREATE TABLE IF NOT EXISTS public.payment_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  user_id uuid,
  customer_email text,
  customer_name text,
  product_id text,
  product_type text,
  amount numeric NOT NULL DEFAULT 0,
  payment_status text,
  issue text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_attempt_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_reconciliations_status_idx
  ON public.payment_reconciliations (status, created_at DESC);

GRANT SELECT ON public.payment_reconciliations TO authenticated;
GRANT ALL ON public.payment_reconciliations TO service_role;
ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reconciliations" ON public.payment_reconciliations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payment_reconciliations_updated_at BEFORE UPDATE ON public.payment_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Controle de execução das rotinas (single-flight + pausa)
CREATE TABLE IF NOT EXISTS public.ops_job_runs (
  job text PRIMARY KEY,
  locked_until timestamptz,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ops_job_runs TO authenticated;
GRANT ALL ON public.ops_job_runs TO service_role;
ALTER TABLE public.ops_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ops jobs" ON public.ops_job_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ops_job_runs_updated_at BEFORE UPDATE ON public.ops_job_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Lease de execução única
CREATE OR REPLACE FUNCTION public.acquire_ops_job(p_job text, p_lease interval DEFAULT interval '10 minutes')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  INSERT INTO public.ops_job_runs (job, locked_until, last_run_at, last_status)
  VALUES (p_job, now() + p_lease, now(), 'running')
  ON CONFLICT (job) DO UPDATE
    SET locked_until = now() + p_lease,
        last_run_at = now(),
        last_status = 'running'
    WHERE public.ops_job_runs.paused IS FALSE
      AND (public.ops_job_runs.locked_until IS NULL OR public.ops_job_runs.locked_until < now())
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_ops_job(text, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_ops_job(text, interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_ops_job(text, interval) TO service_role;

-- 6. Agendamento: rotina de recuperação a cada 15 minutos
CREATE OR REPLACE FUNCTION public.trigger_ops_recovery()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT cron_token INTO v_token FROM public.report_settings LIMIT 1;
  IF v_token IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://skewer-success-engine.lovable.app/api/public/ops-recovery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_ops_recovery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_ops_recovery() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_ops_recovery() TO service_role;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('ops_recovery');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule('ops_recovery', '*/15 * * * *', 'SELECT public.trigger_ops_recovery()');
END;
$$;