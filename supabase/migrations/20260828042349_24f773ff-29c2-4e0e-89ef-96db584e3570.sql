ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS prep_data jsonb,
  ADD COLUMN IF NOT EXISTS prep_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_summary text,
  ADD COLUMN IF NOT EXISTS client_report_sent_at timestamptz;