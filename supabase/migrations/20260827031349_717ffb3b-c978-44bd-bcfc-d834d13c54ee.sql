-- 1) Notificações administrativas
CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'system',
  severity text NOT NULL DEFAULT 'info',
  entity_type text,
  entity_id text,
  link text,
  dedup_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_notifications_created_idx ON public.admin_notifications (created_at DESC);
CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications (read, created_at DESC);
CREATE INDEX admin_notifications_dedup_idx ON public.admin_notifications (dedup_key, created_at DESC);

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read admin notifications"
ON public.admin_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can mark admin notifications as read"
ON public.admin_notifications FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- 2) Dispositivos push dos admins
CREATE TABLE public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_push_subscriptions_user_idx ON public.admin_push_subscriptions (user_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_push_subscriptions TO service_role;
ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own push devices"
ON public.admin_push_subscriptions FOR ALL TO authenticated
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

-- 3) Auditoria de entregas
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.admin_notifications(id) ON DELETE SET NULL,
  user_id uuid,
  delivery_method text NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_logs_created_idx ON public.notification_logs (created_at DESC);

GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read notification logs"
ON public.notification_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4) Preferências por categoria (linha única global)
CREATE TABLE public.admin_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales boolean NOT NULL DEFAULT true,
  affiliates boolean NOT NULL DEFAULT true,
  payouts boolean NOT NULL DEFAULT true,
  support boolean NOT NULL DEFAULT true,
  emails boolean NOT NULL DEFAULT true,
  finance boolean NOT NULL DEFAULT true,
  security boolean NOT NULL DEFAULT true,
  system boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.admin_notification_settings TO authenticated;
GRANT ALL ON public.admin_notification_settings TO service_role;
ALTER TABLE public.admin_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage notification settings"
ON public.admin_notification_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.admin_notification_settings (id) VALUES (gen_random_uuid());

CREATE TRIGGER admin_notification_settings_updated_at
BEFORE UPDATE ON public.admin_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;