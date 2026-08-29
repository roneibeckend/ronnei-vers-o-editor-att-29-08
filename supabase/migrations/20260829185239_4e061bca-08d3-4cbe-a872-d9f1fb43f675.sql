DROP POLICY IF EXISTS "Users can update their own affiliate profile" ON public.affiliates;

CREATE POLICY "Users can update their own affiliate profile"
ON public.affiliates
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND EXISTS (
    SELECT 1 FROM public.affiliates a
    WHERE a.id = affiliates.id
      AND a.status IS NOT DISTINCT FROM affiliates.status
      AND a.commission_rate IS NOT DISTINCT FROM affiliates.commission_rate
      AND a.balance IS NOT DISTINCT FROM affiliates.balance
      AND a.total_earnings IS NOT DISTINCT FROM affiliates.total_earnings
      AND a.referrer_id IS NOT DISTINCT FROM affiliates.referrer_id
  )
);