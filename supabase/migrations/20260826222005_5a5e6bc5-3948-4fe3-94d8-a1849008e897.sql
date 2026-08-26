ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text;

CREATE OR REPLACE FUNCTION public.normalize_profile_cpf()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  IF NEW.cpf IS NULL THEN
    RETURN NEW;
  END IF;

  digits := regexp_replace(NEW.cpf, '[^0-9]', '', 'g');

  IF digits = '' THEN
    NEW.cpf := NULL;
    RETURN NEW;
  END IF;

  IF length(digits) <> 11 THEN
    RAISE EXCEPTION 'CPF inválido: informe 11 dígitos';
  END IF;

  NEW.cpf := digits;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_profile_cpf_trigger ON public.profiles;
CREATE TRIGGER normalize_profile_cpf_trigger
BEFORE INSERT OR UPDATE OF cpf ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_cpf();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique_idx ON public.profiles (cpf) WHERE cpf IS NOT NULL;