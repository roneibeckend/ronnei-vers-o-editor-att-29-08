CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.email_verified_at := OLD.email_verified_at;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.has_any_enrollment(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.has_module_access(uuid, text) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.get_student_ranking(integer) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_coupon_redemption(uuid, text, text) FROM authenticated, anon, public;