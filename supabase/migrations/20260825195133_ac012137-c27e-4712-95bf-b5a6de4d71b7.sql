-- 1. Impede que afiliados alterem campos financeiros do próprio perfil
CREATE OR REPLACE FUNCTION public.protect_affiliate_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.balance := OLD.balance;
  NEW.total_earnings := OLD.total_earnings;
  NEW.commission_rate := OLD.commission_rate;
  NEW.status := OLD.status;
  NEW.referrer_id := OLD.referrer_id;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_affiliate_financials() FROM anon, authenticated;

DROP TRIGGER IF EXISTS protect_affiliate_financials_trg ON public.affiliates;
CREATE TRIGGER protect_affiliate_financials_trg
BEFORE UPDATE ON public.affiliates
FOR EACH ROW EXECUTE FUNCTION public.protect_affiliate_financials();

-- 2. Vídeos de receitas: leitura pública apenas de receitas publicadas
DROP POLICY IF EXISTS "recipe_videos_read" ON storage.objects;

CREATE POLICY "recipe_videos_read_published"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'recipe-videos'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.is_published = true
        AND r.video_url IS NOT NULL
        AND r.video_url LIKE '%' || storage.objects.name
    )
  )
);