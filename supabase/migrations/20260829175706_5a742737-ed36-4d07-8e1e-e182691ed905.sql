ALTER TABLE public.fidelize_provisioning_logs
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_id text,
  ADD COLUMN IF NOT EXISTS next_due_date date,
  ADD COLUMN IF NOT EXISTS overdue_since timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_fidelize_logs_user_created
  ON public.fidelize_provisioning_logs (user_id, created_at DESC);