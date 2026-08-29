CREATE TABLE public.course_module_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  course_id uuid,
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  file_name text,
  file_size bigint,
  mime_type text,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_module_materials_module ON public.course_module_materials(module_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_module_materials TO authenticated;
GRANT ALL ON public.course_module_materials TO service_role;

ALTER TABLE public.course_module_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage module materials"
ON public.course_module_materials FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Enrolled students read module materials"
ON public.course_module_materials FOR SELECT TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.course_modules m
    JOIN public.course_enrollments e ON e.course_id = m.course_id
    WHERE m.id = course_module_materials.module_id
      AND e.user_id = auth.uid()
  )
);

CREATE TRIGGER trg_course_module_materials_updated_at
BEFORE UPDATE ON public.course_module_materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();