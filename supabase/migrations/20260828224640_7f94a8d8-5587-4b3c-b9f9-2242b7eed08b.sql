ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS no_show_excused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_notified_at timestamptz;