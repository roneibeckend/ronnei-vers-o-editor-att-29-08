DROP POLICY IF EXISTS "consultation_blocks_public_read" ON public.consultation_blocks;

CREATE POLICY "consultation_blocks_auth_read"
ON public.consultation_blocks
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON public.consultation_blocks FROM anon;