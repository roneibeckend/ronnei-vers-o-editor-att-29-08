ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS booking_group uuid,
  ADD COLUMN IF NOT EXISTS session_index integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sessions_total integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS consultations_booking_group_idx ON public.consultations (booking_group);