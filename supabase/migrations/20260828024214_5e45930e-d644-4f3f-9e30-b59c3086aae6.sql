REVOKE EXECUTE ON FUNCTION public.trigger_consultation_recordings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_consultation_recordings() TO postgres, service_role;