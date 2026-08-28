ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendance_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_marked_by uuid,
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reschedule_fee_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_reschedule_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_reschedule_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_reschedule_payment_id text,
  ADD COLUMN IF NOT EXISTS pending_reschedule_payment_url text,
  ADD COLUMN IF NOT EXISTS pending_reschedule_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_consultations_attendance_pending
  ON public.consultations (scheduled_at)
  WHERE status = 'scheduled' AND attendance_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_consultations_pending_reschedule_payment
  ON public.consultations (pending_reschedule_payment_id)
  WHERE pending_reschedule_payment_id IS NOT NULL;