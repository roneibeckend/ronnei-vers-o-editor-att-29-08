-- 1) course_feedback: remover leitura anon direta da tabela e expor apenas colunas seguras via view
DROP POLICY IF EXISTS "Public can view approved feedback" ON public.course_feedback;
REVOKE SELECT ON public.course_feedback FROM anon;

CREATE OR REPLACE VIEW public.course_feedback_public
WITH (security_barrier = true) AS
SELECT id, rating, comment, created_at
FROM public.course_feedback
WHERE status = 'approved';

GRANT SELECT ON public.course_feedback_public TO anon, authenticated;
GRANT SELECT ON public.course_feedback_public TO service_role;

-- 2) knowledge_feedback: permitir leitura por admins
CREATE POLICY "Admins can read knowledge feedback"
ON public.knowledge_feedback
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3) Revogar EXECUTE de funções SECURITY DEFINER internas (chamadas apenas por service role, cron ou triggers)
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'acquire_asaas_webhook_claim(text,text,text,jsonb,interval)',
    'acquire_ops_job(text,interval)',
    'award_points(uuid,integer)',
    'complete_coupon_redemption(uuid,text,text)',
    'distribute_partner_profits(numeric,uuid)',
    'expire_consultation_holds()',
    'increment_affiliate_earnings(uuid,numeric)',
    'increment_partner_withdrawn(uuid,numeric)',
    'log_system_event(text,text,text,jsonb)',
    'prune_system_logs(integer,interval)',
    'save_assistant_response(uuid,text)',
    'trigger_consultation_recordings()',
    'trigger_consultation_reminders()',
    'trigger_daily_report()',
    'trigger_fidelize_health()',
    'trigger_ops_recovery()',
    'update_expired_live_classes()',
    -- trigger functions (nunca chamadas diretamente)
    'check_progress_milestones()',
    'enforce_affiliate_field_restrictions()',
    'enforce_support_ticket_field_restrictions()',
    'guard_affiliate_links_update()',
    'guard_affiliates_self_update()',
    'guard_consultation_owner_update()',
    'guard_payout_sensitive_fields()',
    'guard_progress_tracking_points()',
    'guard_support_tickets_update()',
    'handle_item_completion()',
    'handle_new_user()',
    'notify_new_feedback()',
    'promote_to_student()',
    'protect_affiliate_financials()',
    'protect_payout_insert_fields()',
    'protect_profile_privileged_fields()',
    'protect_progress_points()',
    'protect_support_ticket_staff_fields()',
    'sync_report_cron()',
    'system_logs_autoprune()',
    'update_ticket_timestamp()',
    'normalize_profile_cpf()',
    'validate_coupon_fields()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'função não encontrada: %', fn;
    END;
  END LOOP;
END $$;