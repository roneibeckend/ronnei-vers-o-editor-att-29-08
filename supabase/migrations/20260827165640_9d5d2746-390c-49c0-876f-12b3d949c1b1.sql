-- Credenciais Google (server-only)
CREATE TABLE public.google_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_email TEXT,
  account_name TEXT,
  refresh_token_ciphertext TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected',
  last_refresh_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  connected_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.google_credentials TO service_role;
ALTER TABLE public.google_credentials ENABLE ROW LEVEL SECURITY;

-- Configurações da integração (admins leem/editam)
CREATE TABLE public.google_integration_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  default_duration_minutes INTEGER NOT NULL DEFAULT 60,
  drive_recordings_folder_id TEXT,
  create_meet_links BOOLEAN NOT NULL DEFAULT true,
  send_calendar_invites BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.google_integration_settings TO authenticated;
GRANT ALL ON public.google_integration_settings TO service_role;
ALTER TABLE public.google_integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam configurações Google"
ON public.google_integration_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.google_integration_settings (calendar_id) VALUES ('primary');

-- States de OAuth (server-only, uso único)
CREATE TABLE public.google_oauth_states (
  state TEXT NOT NULL PRIMARY KEY,
  created_by UUID,
  redirect_uri TEXT NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.google_oauth_states TO service_role;
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;

-- Logs das chamadas ao Google
CREATE TABLE public.google_api_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  duration_ms INTEGER,
  error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX google_api_logs_created_at_idx ON public.google_api_logs (created_at DESC);

GRANT SELECT ON public.google_api_logs TO authenticated;
GRANT ALL ON public.google_api_logs TO service_role;
ALTER TABLE public.google_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins visualizam logs Google"
ON public.google_api_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_google_credentials_updated_at
BEFORE UPDATE ON public.google_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_google_integration_settings_updated_at
BEFORE UPDATE ON public.google_integration_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();