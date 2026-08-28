ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS action_plan TEXT;

CREATE TABLE public.consultation_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  web_view_link TEXT,
  drive_created_time TIMESTAMP WITH TIME ZONE,
  size_bytes BIGINT,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  match_reason TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP WITH TIME ZONE,
  shared_at TIMESTAMP WITH TIME ZONE,
  notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.consultation_recordings TO authenticated;
GRANT ALL ON public.consultation_recordings TO service_role;

ALTER TABLE public.consultation_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view recordings registry"
ON public.consultation_recordings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_consultation_recordings_status ON public.consultation_recordings(status, next_attempt_at);
CREATE INDEX idx_consultation_recordings_consultation ON public.consultation_recordings(consultation_id);

CREATE TRIGGER update_consultation_recordings_updated_at
BEFORE UPDATE ON public.consultation_recordings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.trigger_consultation_recordings()
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
    url := 'https://project--19870d22-c8ea-4f04-9619-f074c2594e7b.lovable.app/api/public/consultation-recordings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule('consultation_recordings', '7 * * * *', 'SELECT public.trigger_consultation_recordings()');