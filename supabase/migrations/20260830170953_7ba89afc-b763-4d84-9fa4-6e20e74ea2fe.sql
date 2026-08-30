DROP POLICY IF EXISTS "Active courses are viewable by authenticated users" ON public.courses;
CREATE POLICY "Active courses are viewable by authenticated users"
ON public.courses FOR SELECT TO authenticated
USING (
  COALESCE(status, 'draft') IN ('active','coming_soon')
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'agent'::app_role)
  OR EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.course_id = courses.id AND ce.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Active ebooks are viewable by authenticated users" ON public.ebooks;
CREATE POLICY "Active ebooks are viewable by authenticated users"
ON public.ebooks FOR SELECT TO authenticated
USING (
  COALESCE(status, 'draft') IN ('active','coming_soon')
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'agent'::app_role)
  OR EXISTS (SELECT 1 FROM ebook_enrollments ee WHERE ee.ebook_id = ebooks.id AND ee.user_id = auth.uid())
);