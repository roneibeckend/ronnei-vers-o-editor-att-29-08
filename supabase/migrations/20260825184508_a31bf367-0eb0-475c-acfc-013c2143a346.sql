DROP POLICY IF EXISTS "Published courses are viewable by authenticated users" ON public.courses;
DROP POLICY IF EXISTS "Published ebooks are viewable by authenticated users" ON public.ebooks;
DROP POLICY IF EXISTS "Users can view courses" ON public.courses;
DROP POLICY IF EXISTS "Users can view ebooks" ON public.ebooks;

CREATE POLICY "Active courses are viewable by authenticated users"
ON public.courses
FOR SELECT
TO authenticated
USING (
  COALESCE(status, 'draft') = 'active'
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'agent')
  OR EXISTS (
    SELECT 1
    FROM public.course_enrollments ce
    WHERE ce.course_id = courses.id
      AND ce.user_id = auth.uid()
  )
);

CREATE POLICY "Active ebooks are viewable by authenticated users"
ON public.ebooks
FOR SELECT
TO authenticated
USING (
  COALESCE(status, 'draft') = 'active'
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'agent')
  OR EXISTS (
    SELECT 1
    FROM public.ebook_enrollments ee
    WHERE ee.ebook_id = ebooks.id
      AND ee.user_id = auth.uid()
  )
);