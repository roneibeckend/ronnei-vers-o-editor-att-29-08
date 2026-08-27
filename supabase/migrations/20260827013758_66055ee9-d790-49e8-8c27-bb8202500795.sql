
REVOKE ALL ON FUNCTION public.is_privileged_writer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_affiliate_links_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_affiliates_self_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_progress_tracking_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_support_tickets_update() FROM PUBLIC, anon, authenticated;
