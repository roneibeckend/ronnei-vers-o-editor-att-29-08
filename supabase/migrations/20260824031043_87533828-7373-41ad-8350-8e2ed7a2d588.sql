-- content_certificates: restringe leitura a matriculados/admins
DROP POLICY IF EXISTS "Users can view content certificates" ON public.content_certificates;

CREATE POLICY "Enrolled users can view content certificates"
ON public.content_certificates FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    COALESCE(is_enabled, false) = true
    AND (
      (content_type = 'course' AND EXISTS (
        SELECT 1 FROM public.course_enrollments ce
        WHERE ce.user_id = auth.uid() AND ce.course_id = content_certificates.content_id
      ))
      OR (content_type = 'ebook' AND EXISTS (
        SELECT 1 FROM public.ebook_enrollments ee
        WHERE ee.user_id = auth.uid() AND ee.ebook_id = content_certificates.content_id
      ))
    )
  )
);

-- ranking_campaigns: alunos só veem campanhas ativas
DROP POLICY IF EXISTS "ranking_campaigns_read_policy" ON public.ranking_campaigns;

CREATE POLICY "ranking_campaigns_read_policy"
ON public.ranking_campaigns FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR COALESCE(is_active, false) = true);

-- financial_partners: sócio vê o próprio registro
CREATE POLICY "Partners can view their own record"
ON public.financial_partners FOR SELECT TO authenticated
USING (user_id = auth.uid());