
-- Helper: is the current executor privileged (service role / staff)?
CREATE OR REPLACE FUNCTION public.is_privileged_writer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) IN ('service_role', 'postgres') OR current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'agent')
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_privileged_writer() FROM anon;

-- 1. affiliate_links: remove blanket ALL policy, block click tampering
DROP POLICY IF EXISTS "Affiliates can manage their own links" ON public.affiliate_links;

CREATE POLICY "Affiliates view their own links"
ON public.affiliate_links FOR SELECT TO authenticated
USING (affiliate_id = auth.uid());

CREATE POLICY "Affiliates create their own links"
ON public.affiliate_links FOR INSERT TO authenticated
WITH CHECK (affiliate_id = auth.uid() AND clicks = 0);

CREATE POLICY "Affiliates delete their own links"
ON public.affiliate_links FOR DELETE TO authenticated
USING (affiliate_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_affiliate_links_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF NEW.clicks IS DISTINCT FROM OLD.clicks
     OR NEW.affiliate_id IS DISTINCT FROM OLD.affiliate_id THEN
    RAISE EXCEPTION 'Alteração não permitida em affiliate_links';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_affiliate_links_update ON public.affiliate_links;
CREATE TRIGGER guard_affiliate_links_update
BEFORE UPDATE ON public.affiliate_links
FOR EACH ROW EXECUTE FUNCTION public.guard_affiliate_links_update();

-- 2. affiliates: block self escalation of status/commission/balance
CREATE OR REPLACE FUNCTION public.guard_affiliates_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.balance IS DISTINCT FROM OLD.balance
     OR NEW.total_earnings IS DISTINCT FROM OLD.total_earnings
     OR NEW.referrer_id IS DISTINCT FROM OLD.referrer_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Apenas a administração pode alterar status, comissão ou saldo do afiliado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_affiliates_self_update ON public.affiliates;
CREATE TRIGGER guard_affiliates_self_update
BEFORE UPDATE ON public.affiliates
FOR EACH ROW EXECUTE FUNCTION public.guard_affiliates_self_update();

-- 3. progress_tracking: block self-awarded points
CREATE OR REPLACE FUNCTION public.guard_progress_tracking_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.points_awarded := 0;
    NEW.last_milestone := 0;
    RETURN NEW;
  END IF;
  NEW.points_awarded := OLD.points_awarded;
  NEW.last_milestone := OLD.last_milestone;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_progress_tracking_points ON public.progress_tracking;
CREATE TRIGGER guard_progress_tracking_points
BEFORE INSERT OR UPDATE ON public.progress_tracking
FOR EACH ROW EXECUTE FUNCTION public.guard_progress_tracking_points();

-- 4. support_tickets: users may only edit subject/category
CREATE OR REPLACE FUNCTION public.guard_support_tickets_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;
  NEW.status := OLD.status;
  NEW.priority := OLD.priority;
  NEW.assigned_to := OLD.assigned_to;
  NEW.closed_at := OLD.closed_at;
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_support_tickets_update ON public.support_tickets;
CREATE TRIGGER guard_support_tickets_update
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.guard_support_tickets_update();

-- 5. validate_coupon is only invoked server-side with elevated privileges
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, text, text, numeric, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, text, text, numeric, uuid, text) FROM anon;
