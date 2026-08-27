REVOKE SELECT ON public.course_feedback FROM anon;
GRANT SELECT (id, rating, comment, created_at, admin_reply, course_id, ebook_id, status) ON public.course_feedback TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_feedback TO authenticated;
GRANT ALL ON public.course_feedback TO service_role;