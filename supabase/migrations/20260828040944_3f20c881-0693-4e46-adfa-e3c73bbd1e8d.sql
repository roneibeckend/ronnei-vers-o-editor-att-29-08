ALTER TYPE public.consultation_status ADD VALUE IF NOT EXISTS 'awaiting_payment';

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS payment_link_id text,
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS consultations_hold_expires_idx
  ON public.consultations (hold_expires_at)
  WHERE hold_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultations_payment_id_idx
  ON public.consultations (payment_id);

-- Libera automaticamente os horários de reservas não pagas expiradas.
CREATE OR REPLACE FUNCTION public.expire_consultation_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  WITH expired AS (
    UPDATE public.consultations
       SET status = 'cancelled',
           cancel_reason = COALESCE(cancel_reason, 'Reserva expirada sem pagamento'),
           hold_expires_at = NULL,
           updated_at = now()
     WHERE status = 'awaiting_payment'
       AND hold_expires_at IS NOT NULL
       AND hold_expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO affected FROM expired;

  RETURN COALESCE(affected, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_consultation_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_consultation_holds() TO service_role;