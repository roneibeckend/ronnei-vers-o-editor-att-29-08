CREATE TABLE public.consultation_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  followup_date date NOT NULL,
  meeting_date timestamptz,
  ends_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'pending',
  google_event_id text,
  meet_link text,
  notified_at timestamptz,
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at timestamptz,
  attended boolean,
  method_implemented boolean,
  feedback_notes text,
  completed_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX consultation_followups_consultation_key
  ON public.consultation_followups (consultation_id);

CREATE INDEX consultation_followups_user_status_idx
  ON public.consultation_followups (user_id, status);

CREATE INDEX consultation_followups_due_idx
  ON public.consultation_followups (status, followup_date);

GRANT SELECT ON public.consultation_followups TO authenticated;
GRANT ALL ON public.consultation_followups TO service_role;

ALTER TABLE public.consultation_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own followups"
ON public.consultation_followups
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_consultation_followups_updated_at
BEFORE UPDATE ON public.consultation_followups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cria o acompanhamento automaticamente quando a consultoria vira "Realizada".
CREATE OR REPLACE FUNCTION public.create_consultation_followup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.consultation_followups (consultation_id, user_id, followup_date)
    VALUES (
      NEW.id,
      NEW.user_id,
      (COALESCE(NEW.completed_at, now()) + interval '30 days')::date
    )
    ON CONFLICT (consultation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER consultations_create_followup
AFTER INSERT OR UPDATE OF status ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.create_consultation_followup();