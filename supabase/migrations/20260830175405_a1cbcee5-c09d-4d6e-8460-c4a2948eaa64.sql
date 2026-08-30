CREATE TABLE public.consultation_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  product_title text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_id text,
  status text NOT NULL DEFAULT 'available',
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  booking_group uuid,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX consultation_credits_payment_product_key
  ON public.consultation_credits (payment_id, product_id, user_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX consultation_credits_user_status_idx
  ON public.consultation_credits (user_id, status);

GRANT SELECT ON public.consultation_credits TO authenticated;
GRANT ALL ON public.consultation_credits TO service_role;

ALTER TABLE public.consultation_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own consultation credits"
ON public.consultation_credits
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_consultation_credits_updated_at
BEFORE UPDATE ON public.consultation_credits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();