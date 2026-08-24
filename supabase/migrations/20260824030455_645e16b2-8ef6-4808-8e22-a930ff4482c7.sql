CREATE OR REPLACE FUNCTION public.enroll_free_ebook(p_ebook_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT true INTO v_ok
  FROM public.ebooks
  WHERE id = p_ebook_id
    AND COALESCE(price, 0) = 0
    AND COALESCE(is_locked, false) = false
    AND COALESCE(status, 'published') IN ('published', 'active');

  IF NOT COALESCE(v_ok, false) THEN
    RETURN false;
  END IF;

  INSERT INTO public.ebook_enrollments (user_id, ebook_id)
  VALUES (v_user, p_ebook_id)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_free_ebook(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_free_ebook(text) TO authenticated;