CREATE TABLE public.google_oauth_client (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret_ciphertext TEXT NOT NULL,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.google_oauth_client TO service_role;

ALTER TABLE public.google_oauth_client ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_google_oauth_client_updated_at
BEFORE UPDATE ON public.google_oauth_client
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();