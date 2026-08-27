-- 1) Afiliados: restringe UPDATE a colunas não financeiras
REVOKE UPDATE, DELETE ON public.affiliates FROM authenticated;
REVOKE UPDATE, DELETE, INSERT ON public.affiliates FROM anon;
GRANT UPDATE (pix_key, bank_info, updated_at) ON public.affiliates TO authenticated;
GRANT ALL ON public.affiliates TO service_role;

-- 2) Saques: criação apenas via request_payout_atomic; nenhuma escrita direta do usuário
DROP POLICY IF EXISTS "Users can create their own payout requests" ON public.payout_requests;
REVOKE INSERT, UPDATE, DELETE ON public.payout_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, SELECT ON public.payout_requests FROM anon;
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;

-- 3) Defesa extra: bloqueia mudança de campos sensíveis em UPDATE de saques
CREATE OR REPLACE FUNCTION public.guard_payout_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.amount := OLD.amount;
  NEW.user_id := OLD.user_id;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.admin_notes := OLD.admin_notes;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.asaas_payment_id := OLD.asaas_payment_id;
  NEW.metadata := OLD.metadata;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payout_sensitive_fields ON public.payout_requests;
CREATE TRIGGER trg_guard_payout_sensitive_fields
BEFORE UPDATE ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_payout_sensitive_fields();

REVOKE ALL ON FUNCTION public.guard_payout_sensitive_fields() FROM PUBLIC, anon, authenticated;
