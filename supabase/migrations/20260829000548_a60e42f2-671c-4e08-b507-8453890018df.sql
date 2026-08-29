DROP POLICY IF EXISTS consultation_blocks_auth_read ON public.consultation_blocks;

CREATE POLICY consultation_blocks_staff_read
ON public.consultation_blocks
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_module_access(auth.uid(), 'consultorias')
);