-- 1. certificate_templates: restrict reads to admins (student/public views use server admin client)
DROP POLICY IF EXISTS "Users can view active templates" ON public.certificate_templates;
CREATE POLICY "Admins can view certificate templates"
ON public.certificate_templates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. course_lessons: consolidate overlapping SELECT policies into one
DROP POLICY IF EXISTS "Staff can view course lessons" ON public.course_lessons;
DROP POLICY IF EXISTS "Users can view lessons of enrolled courses or free lessons" ON public.course_lessons;
CREATE POLICY "Lesson read access"
ON public.course_lessons FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'manager'::app_role, 'agent'::app_role])
  )
  OR is_free = true
  OR EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.course_enrollments e ON e.course_id = m.course_id
    WHERE m.id = course_lessons.module_id AND e.user_id = auth.uid()
  )
);

-- 3. storage recipe videos: authenticated only (no anonymous access)
DROP POLICY IF EXISTS "recipe_videos_read_published" ON storage.objects;
CREATE POLICY "recipe_videos_read_published"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'recipe-videos'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.is_published = true
        AND r.video_url IS NOT NULL
        AND r.video_url LIKE ('%' || storage.objects.name)
    )
  )
);