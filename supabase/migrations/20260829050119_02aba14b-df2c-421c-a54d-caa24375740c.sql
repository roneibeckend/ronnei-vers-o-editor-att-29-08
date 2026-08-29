DROP VIEW IF EXISTS public.course_feedback_public;

CREATE POLICY "Public can view approved feedback"
ON public.course_feedback
FOR SELECT TO anon
USING (status = 'approved');

GRANT SELECT (id, rating, comment, created_at) ON public.course_feedback TO anon;