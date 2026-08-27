ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS briefing_data jsonb;