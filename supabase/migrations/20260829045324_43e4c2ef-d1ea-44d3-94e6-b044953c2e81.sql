ALTER TABLE public.course_module_materials
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.course_lessons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_course_module_materials_lesson_id
  ON public.course_module_materials(lesson_id);