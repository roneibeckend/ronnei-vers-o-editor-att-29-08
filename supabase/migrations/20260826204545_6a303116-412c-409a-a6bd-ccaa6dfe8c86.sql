REVOKE ALL ON FUNCTION public.protect_affiliate_financials() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_affiliate_financials() FROM anon;
REVOKE ALL ON FUNCTION public.protect_affiliate_financials() FROM authenticated;

DROP POLICY IF EXISTS "Users can insert messages to their tickets" ON public.support_messages;
DROP POLICY IF EXISTS "Users can insert messages to own tickets" ON public.support_messages;

CREATE POLICY "Users can insert messages to own tickets"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_type = 'student'::support_sender_type
  AND (sender_id IS NULL OR sender_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()
  )
);