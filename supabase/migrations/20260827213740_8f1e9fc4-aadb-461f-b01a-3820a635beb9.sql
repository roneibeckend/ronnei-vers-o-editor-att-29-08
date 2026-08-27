-- ===== ENUMS =====
DO $$ BEGIN
  CREATE TYPE public.consultation_status AS ENUM ('pending_payment','scheduled','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== PRODUTOS DE CONSULTORIA =====
CREATE TABLE public.consultation_products (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  cover_url TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  briefing_required BOOLEAN NOT NULL DEFAULT true,
  affiliate_enabled BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.consultation_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultation_products TO authenticated;
GRANT ALL ON public.consultation_products TO service_role;
ALTER TABLE public.consultation_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultation_products_public_read" ON public.consultation_products
  FOR SELECT USING (status IN ('active','coming_soon'));
CREATE POLICY "consultation_products_admin_read" ON public.consultation_products
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "consultation_products_admin_write" ON public.consultation_products
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== DISPONIBILIDADE SEMANAL =====
CREATE TABLE public.consultation_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  weekday SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consultation_availability_weekday_range CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT consultation_availability_time_order CHECK (end_time > start_time)
);

GRANT SELECT ON public.consultation_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultation_availability TO authenticated;
GRANT ALL ON public.consultation_availability TO service_role;
ALTER TABLE public.consultation_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultation_availability_public_read" ON public.consultation_availability
  FOR SELECT USING (true);
CREATE POLICY "consultation_availability_admin_write" ON public.consultation_availability
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== BLOQUEIOS =====
CREATE TABLE public.consultation_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consultation_blocks_order CHECK (ends_at > starts_at)
);

GRANT SELECT ON public.consultation_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultation_blocks TO authenticated;
GRANT ALL ON public.consultation_blocks TO service_role;
ALTER TABLE public.consultation_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultation_blocks_public_read" ON public.consultation_blocks
  FOR SELECT USING (true);
CREATE POLICY "consultation_blocks_admin_write" ON public.consultation_blocks
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== CONSULTORIAS AGENDADAS =====
CREATE TABLE public.consultations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id TEXT REFERENCES public.consultation_products(id) ON DELETE SET NULL,
  product_title TEXT NOT NULL DEFAULT '',
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status public.consultation_status NOT NULL DEFAULT 'scheduled',
  briefing TEXT,
  briefing_submitted_at TIMESTAMPTZ,
  google_event_id TEXT,
  google_calendar_id TEXT,
  meet_link TEXT,
  calendar_html_link TEXT,
  recording_url TEXT,
  recording_file_id TEXT,
  drive_folder_id TEXT,
  payment_id UUID,
  amount NUMERIC(10,2),
  admin_notes TEXT,
  cancel_reason TEXT,
  confirmation_sent_at TIMESTAMPTZ,
  reminder_8h_sent_at TIMESTAMPTZ,
  reminder_1h_sent_at TIMESTAMPTZ,
  recording_sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX consultations_user_idx ON public.consultations(user_id, scheduled_at DESC);
CREATE INDEX consultations_schedule_idx ON public.consultations(scheduled_at);
CREATE INDEX consultations_status_idx ON public.consultations(status);

GRANT SELECT, INSERT, UPDATE ON public.consultations TO authenticated;
GRANT ALL ON public.consultations TO service_role;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultations_owner_read" ON public.consultations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "consultations_admin_read" ON public.consultations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "consultations_admin_write" ON public.consultations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Aluno pode atualizar somente o briefing das próprias consultorias futuras
CREATE POLICY "consultations_owner_update_briefing" ON public.consultations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending_payment','scheduled'))
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_consultation_owner_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.meet_link IS DISTINCT FROM OLD.meet_link
     OR NEW.google_event_id IS DISTINCT FROM OLD.google_event_id
     OR NEW.recording_url IS DISTINCT FROM OLD.recording_url
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.confirmation_sent_at IS DISTINCT FROM OLD.confirmation_sent_at
     OR NEW.reminder_8h_sent_at IS DISTINCT FROM OLD.reminder_8h_sent_at
     OR NEW.reminder_1h_sent_at IS DISTINCT FROM OLD.reminder_1h_sent_at THEN
    RAISE EXCEPTION 'Apenas o briefing pode ser alterado pelo aluno.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_consultations_owner_update
  BEFORE UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.guard_consultation_owner_update();

-- ===== AUDITORIA =====
CREATE TABLE public.consultation_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX consultation_audit_log_consultation_idx ON public.consultation_audit_log(consultation_id, created_at DESC);

GRANT SELECT ON public.consultation_audit_log TO authenticated;
GRANT ALL ON public.consultation_audit_log TO service_role;
ALTER TABLE public.consultation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultation_audit_admin_read" ON public.consultation_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ===== TRIGGERS updated_at =====
CREATE TRIGGER update_consultation_products_updated_at
  BEFORE UPDATE ON public.consultation_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_consultation_availability_updated_at
  BEFORE UPDATE ON public.consultation_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_consultations_updated_at
  BEFORE UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== DADOS INICIAIS =====
INSERT INTO public.consultation_products (id, title, subtitle, description, duration_minutes, price, status, briefing_required, sort_order) VALUES
  ('consultoria-30', 'Consultoria Express — 30 min', 'Tire dúvidas pontuais direto com o Ronnei', 'Sessão rápida e objetiva por videochamada para resolver dúvidas específicas do seu negócio de espetinhos: precificação, cortes, equipamentos ou delivery.', 30, 197.00, 'draft', true, 1),
  ('consultoria-60', 'Consultoria Completa — 1 hora', 'Diagnóstico do seu negócio ponta a ponta', 'Uma hora de análise profunda: CMV, precificação, operação, cardápio e plano de ação personalizado para o seu negócio.', 60, 347.00, 'draft', true, 2),
  ('consultoria-120', 'Mentoria Intensiva — 2 horas', 'Plano de crescimento completo', 'Duas horas de mentoria intensiva com diagnóstico completo, montagem de cardápio, estrutura de custos e plano de crescimento passo a passo.', 120, 597.00, 'draft', true, 3);

INSERT INTO public.consultation_availability (weekday, start_time, end_time, slot_interval_minutes, active) VALUES
  (1, '09:00', '12:00', 30, true),
  (2, '09:00', '12:00', 30, true),
  (3, '14:00', '18:00', 30, true),
  (4, '14:00', '18:00', 30, true),
  (5, '09:00', '12:00', 30, true);