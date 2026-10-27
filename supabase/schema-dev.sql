-- ==============================================================================
-- schema-dev.sql — Estrutura consolidada para o projeto Supabase IACRA-DEV
-- Branch: bolt-migration-test
-- Data: 2026-10-27
-- ------------------------------------------------------------------------------
-- OBJETIVO
--   Inicializar um banco Supabase vazio (IACRA-DEV) com a estrutura completa do
--   EAVRA, consolidando as migrações estruturais existentes em supabase/migrations/
--   e a estrutura base de supabase/schema.sql, SEM comandos destrutivos, SEM dados
--   pessoais, SEM credenciais e SEM a migração 20261004 (dados de produção).
--
-- PRINCÍPIOS
--   * Somente aditivo e idempotente (CREATE ... IF NOT EXISTS).
--   * Sem DELETE, DROP de colunas, TRUNCATE, ALTER TYPE destrutivos ou limpeza.
--   * Sem BEGIN/COMMIT/ROLLBACK de top-level (apenas DO $$ ... END $$ internos).
--   * Sem dados pessoais, senhas, tokens, emails ou UUIDs de produção.
--   * Chaves primárias das entidades centrais (students, teachers, prospects,
--     profiles, classes, groups, financial_plans, enrollments, etc.) são `text`,
--     conforme schema.sql e confirmado pelo rascunho de matrícula digital
--     (docs/digital-enrollment, 2026-10-19).
--   * Divergência de tipos RESOLVIDA: credits, competence_billings e
--     teacher_pix_keys originalmente declaravam FKs `uuid` para tabelas cuja PK
--     é `text`. Aqui foram ajustadas para `text`, garantindo integridade.
--   * RLS habilitada em TODAS as tabelas. Políticas por verbo (SELECT/INSERT/
--     UPDATE/DELETE), restritas a `authenticated` com checagem de perfil.
--   * Nenhum grant para `anon` em tabelas de dados (o app exige login).
--   * `service_role` recebe grants apenas nas tabelas tocadas por Edge Functions.
--   * Seeds não-pessoais: choir_voice_types (4 naipes) e
--     affiliate_commission_rules (10 faixas de comissão — valores públicos).
--
-- ORIGEM DAS SEÇÕES
--   Seções 1-4:  schema.sql (base) + migrações 20260825, 20260911_groups,
--               20260917_teachers_status, 20260917_user_access_status,
--               20261005 (classes.needs_student_link), 20261006 (specialties).
--   Seção 5:    20260909_affiliates_module (tabelas, RLS, seed de comissão).
--   Seção 6:    20260911_competence_billings (tabela, 6 índices, RLS).
--   Seção 7:    20260916 + 20261005 (Google Calendar, inbound sync).
--   Seção 8:    20260924_create_credits_table.
--   Seção 9:    20261010_teacher_pix_keys.
--   Seção 10:   schema.sql (choir_monthly_closings + items + 2 RPCs).
--   Seção 11:   RPCs administrativas (20260917, 20260918, schema.sql).
--   Seção 12:   RLS + políticas das tabelas base (substitui "Allow all").
--   Seção 13:   Grants.
--   Seção 14:   Seeds.
--
-- EXCLUÍDO
--   * 20261004_fix_superadmin_profile_id (UUIDs/email de produção, BEGIN/COMMIT).
--   * Seções 2, 4, 5, 6 destrutivas do schema.sql (conversão text, "Allow all",
--     DELETEs de limpeza, GRANT ALL TO anon).
--   * Módulo de Matrícula Digital (docs/digital-enrollment/20261019_*.sql):
--     rascunho em docs/, não em supabase/migrations/ — não é migração oficial.
-- ==============================================================================


-- ==============================================================================
-- 1. EXTENSÕES
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ==============================================================================
-- 2. TABELAS BASE (PK text, colunas consolidadas das migrações)
-- ==============================================================================

-- Students
CREATE TABLE IF NOT EXISTS public.students (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  cpf text,
  instrument text,
  status text CHECK (status IN ('active', 'inactive')),
  enrollment_date date,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Teachers (specialties NOT NULL DEFAULT '{}' consolidado de 20261006;
--  status consolidado de 20260917_teachers_status)
CREATE TABLE IF NOT EXISTS public.teachers (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  cpf text,
  specialties text[] NOT NULL DEFAULT '{}'::text[],
  birth_date date,
  schedule jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Prospects
CREATE TABLE IF NOT EXISTS public.prospects (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  cpf text,
  instrument text,
  term_signed boolean DEFAULT false,
  approved boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Profiles (access_status + temp_password consolidados de 20260917/20260918)
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher')),
  teacher_id text,
  temp_password text,
  access_status text NOT NULL DEFAULT 'active' CHECK (access_status IN ('active', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Classes (group_id, report, vocal_routine, attendance, needs_student_link)
CREATE TABLE IF NOT EXISTS public.classes (
  id text PRIMARY KEY,
  group_id text,
  title text NOT NULL,
  teacher_id text,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  allow_makeup boolean DEFAULT false,
  makeup_scheduled boolean DEFAULT false,
  report text,
  vocal_routine text,
  attendance jsonb,
  needs_student_link boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Groups (status consolidado de 20260911_add_status_to_groups)
CREATE TABLE IF NOT EXISTS public.groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  teacher_id text,
  schedule text,
  max_students integer,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Financial Plans
CREATE TABLE IF NOT EXISTS public.financial_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('individual', 'group', 'coral', 'mentoria', 'mev', 'personalizado')),
  modality text NOT NULL CHECK (modality IN ('semanal', 'quinzenal', 'avulso', 'mensal', 'personalizado')),
  base_price numeric NOT NULL,
  duration_minutes integer NOT NULL,
  max_students integer NOT NULL,
  is_active boolean DEFAULT true,
  exclusive_teacher_id text,
  allow_early_discount boolean DEFAULT false,
  early_discount_value numeric DEFAULT 0,
  early_discount_deadline_day integer DEFAULT 5,
  secretary_fee_type text NOT NULL CHECK (secretary_fee_type IN ('fixed', 'per_student')),
  secretary_fee_value numeric NOT NULL,
  school_fee_type text NOT NULL CHECK (school_fee_type IN ('fixed', 'per_student')),
  school_fee_value numeric NOT NULL,
  teacher_fee_type text NOT NULL CHECK (teacher_fee_type IN ('fixed', 'per_student', 'percentage')),
  teacher_fee_value numeric NOT NULL,
  margin_value numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enrollments (affiliate_id consolidado de 20260909)
CREATE TABLE IF NOT EXISTS public.enrollments (
  id text PRIMARY KEY,
  student_id text,
  plan_id text,
  teacher_id text,
  group_id text,
  affiliate_id text,
  custom_price numeric,
  start_date date,
  enrollment_date date,
  status text CHECK (status IN ('active', 'inactive', 'cancelled')),
  due_day integer,
  due_date_day integer,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Class Students (join)
CREATE TABLE IF NOT EXISTS public.class_students (
  class_id text,
  student_id text,
  PRIMARY KEY (class_id, student_id)
);

-- Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id text PRIMARY KEY,
  type text CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL,
  description text NOT NULL,
  date date NOT NULL,
  status text CHECK (status IN ('pending', 'completed')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Financial Discount Rules
CREATE TABLE IF NOT EXISTS public.financial_discount_rules (
  id text PRIMARY KEY,
  trigger_plan_id text,
  target_plan_id text,
  discount_value numeric NOT NULL,
  applies_to text NOT NULL CHECK (applies_to IN ('school_share', 'total_price')),
  start_date date,
  end_date date,
  description text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Choir Voice Types
CREATE TABLE IF NOT EXISTS public.choir_voice_types (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (name IN ('Soprano', 'Contralto', 'Tenor', 'Barítono')),
  max_slots integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Choir Registrations
CREATE TABLE IF NOT EXISTS public.choir_registrations (
  id text PRIMARY KEY,
  student_id text,
  voice_type_id text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  monthly_fee numeric NOT NULL,
  is_internal_student boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Teacher Choir Payments
CREATE TABLE IF NOT EXISTS public.teacher_choir_payments (
  id text PRIMARY KEY,
  teacher_id text,
  role text NOT NULL CHECK (role IN ('regente', 'pianista_fixo', 'preparador')),
  payment_type text NOT NULL CHECK (payment_type IN ('free', 'hourly', 'per_rehearsal')),
  payment_value numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Choir Collaborators (active consolidado de 20260825)
CREATE TABLE IF NOT EXISTS public.choir_collaborators (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text DEFAULT 'Colaborador',
  teacher_id text,
  remuneration_type text DEFAULT 'per_rehearsal',
  remuneration_value numeric DEFAULT 0,
  phone text,
  email text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Choir Rehearsals
CREATE TABLE IF NOT EXISTS public.choir_rehearsals (
  id text PRIMARY KEY,
  date text NOT NULL,
  time text DEFAULT '19:30',
  title text DEFAULT 'Ensaio Quinzenal do Coral',
  notes text,
  attendance text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Academic Calendar
CREATE TABLE IF NOT EXISTS public.academic_calendar (
  id text PRIMARY KEY,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('holiday', 'recess', 'return', 'end')),
  description text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);


-- ==============================================================================
-- 3. FOREIGN KEYS DAS TABELAS BASE
-- ==============================================================================
-- Adicionadas separadamente (após todas as CREATE TABLE) para garantir que os
-- tipos das colunas referenciadas já existam.

DO $$
BEGIN
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT IF NOT EXISTS enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT IF NOT EXISTS enrollments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.financial_plans(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT IF NOT EXISTS enrollments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT IF NOT EXISTS enrollments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students ADD CONSTRAINT IF NOT EXISTS class_students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students ADD CONSTRAINT IF NOT EXISTS class_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.classes ADD CONSTRAINT IF NOT EXISTS classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.teacher_choir_payments ADD CONSTRAINT IF NOT EXISTS teacher_choir_payments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations ADD CONSTRAINT IF NOT EXISTS choir_registrations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations ADD CONSTRAINT IF NOT EXISTS choir_registrations_voice_type_id_fkey FOREIGN KEY (voice_type_id) REFERENCES public.choir_voice_types(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules ADD CONSTRAINT IF NOT EXISTS financial_discount_rules_trigger_plan_id_fkey FOREIGN KEY (trigger_plan_id) REFERENCES public.financial_plans(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules ADD CONSTRAINT IF NOT EXISTS financial_discount_rules_target_plan_id_fkey FOREIGN KEY (target_plan_id) REFERENCES public.financial_plans(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.groups ADD CONSTRAINT IF NOT EXISTS groups_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_plans ADD CONSTRAINT IF NOT EXISTS financial_plans_exclusive_teacher_id_fkey FOREIGN KEY (exclusive_teacher_id) REFERENCES public.teachers(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.profiles ADD CONSTRAINT IF NOT EXISTS profiles_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
  -- Unique constraint on choir_voice_types.name (consolidado de schema.sql seção 5)
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_voice_types ADD CONSTRAINT IF NOT EXISTS choir_voice_types_name_key UNIQUE (name)'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;


-- ==============================================================================
-- 4. ÍNDICES DAS TABELAS BASE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(status);
CREATE INDEX IF NOT EXISTS idx_profiles_access_status ON public.profiles(access_status);
CREATE INDEX IF NOT EXISTS idx_classes_date ON public.classes(date);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON public.class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON public.class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_choir_rehearsals_date ON public.choir_rehearsals(date);
CREATE INDEX IF NOT EXISTS idx_choir_registrations_student ON public.choir_registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status ON public.enrollments(student_id, status);


-- ==============================================================================
-- 5. MÓDULO DE AFILIADOS (20260909) — tabelas + RLS + seed
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.affiliates (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  cpf_cnpj text,
  pix_key text,
  pix_key_type text CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random', 'outro')),
  referral_code text UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK affiliate_id em enrollments
DO $$
BEGIN
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT IF NOT EXISTS enrollments_affiliate_id_fkey FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id text PRIMARY KEY,
  affiliate_id text NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  prospect_id text REFERENCES public.prospects(id) ON DELETE SET NULL,
  student_id text REFERENCES public.students(id) ON DELETE SET NULL,
  enrollment_id text REFERENCES public.enrollments(id) ON DELETE SET NULL,
  referred_name text NOT NULL,
  referred_phone text,
  referred_email text,
  referral_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'enrolled_pending_payment', 'converted', 'cancelled')),
  conversion_date date,
  conversion_competence varchar(7),
  first_transaction_id text REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_referrals_unique_converted_student
  ON public.affiliate_referrals(student_id)
  WHERE status = 'converted' AND student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_comp
  ON public.affiliate_referrals(affiliate_id, conversion_competence, status);

CREATE TABLE IF NOT EXISTS public.affiliate_commission_rules (
  id text PRIMARY KEY,
  tier_quantity int NOT NULL UNIQUE,
  total_commission_amount numeric(10,2),
  is_defined boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PK text para affiliate_monthly_closings (conforme migração 20260909)
CREATE TABLE IF NOT EXISTS public.affiliate_monthly_closings (
  id text PRIMARY KEY,
  competence varchar(7) NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  total_valid_referrals int NOT NULL DEFAULT 0,
  total_payout_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by text,
  closed_by_name text,
  reopened_at timestamptz,
  reopen_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_closings_competence
  ON public.affiliate_monthly_closings(competence, is_current);

CREATE TABLE IF NOT EXISTS public.affiliate_closing_items (
  id text PRIMARY KEY,
  closing_id text NOT NULL REFERENCES public.affiliate_monthly_closings(id) ON DELETE CASCADE,
  affiliate_id text NOT NULL REFERENCES public.affiliates(id),
  affiliate_name_snapshot text NOT NULL,
  affiliate_pix_snapshot text,
  valid_referrals_count int NOT NULL DEFAULT 0,
  tier_applied text NOT NULL,
  amount_due numeric(10,2),
  rule_status text NOT NULL DEFAULT 'defined' CHECK (rule_status IN ('defined', 'pending_definition')),
  payment_status varchar(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  paid_at timestamptz,
  payout_transaction_id text REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_closing_items_closing
  ON public.affiliate_closing_items(closing_id, affiliate_id);

-- RLS afiliados
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_closing_items ENABLE ROW LEVEL SECURITY;

-- Políticas afiliados (admin-only, por verbo)
DROP POLICY IF EXISTS "admins_select_affiliates" ON public.affiliates;
CREATE POLICY "admins_select_affiliates" ON public.affiliates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_insert_affiliates" ON public.affiliates;
CREATE POLICY "admins_insert_affiliates" ON public.affiliates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_affiliates" ON public.affiliates;
CREATE POLICY "admins_update_affiliates" ON public.affiliates FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_affiliates" ON public.affiliates;
CREATE POLICY "admins_delete_affiliates" ON public.affiliates FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));

DROP POLICY IF EXISTS "admins_select_affiliate_referrals" ON public.affiliate_referrals;
CREATE POLICY "admins_select_affiliate_referrals" ON public.affiliate_referrals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_insert_affiliate_referrals" ON public.affiliate_referrals;
CREATE POLICY "admins_insert_affiliate_referrals" ON public.affiliate_referrals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_affiliate_referrals" ON public.affiliate_referrals;
CREATE POLICY "admins_update_affiliate_referrals" ON public.affiliate_referrals FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_affiliate_referrals" ON public.affiliate_referrals;
CREATE POLICY "admins_delete_affiliate_referrals" ON public.affiliate_referrals FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));

DROP POLICY IF EXISTS "admins_select_affiliate_commission_rules" ON public.affiliate_commission_rules;
CREATE POLICY "admins_select_affiliate_commission_rules" ON public.affiliate_commission_rules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_insert_affiliate_commission_rules" ON public.affiliate_commission_rules;
CREATE POLICY "admins_insert_affiliate_commission_rules" ON public.affiliate_commission_rules FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_affiliate_commission_rules" ON public.affiliate_commission_rules;
CREATE POLICY "admins_update_affiliate_commission_rules" ON public.affiliate_commission_rules FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_affiliate_commission_rules" ON public.affiliate_commission_rules;
CREATE POLICY "admins_delete_affiliate_commission_rules" ON public.affiliate_commission_rules FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));

DROP POLICY IF EXISTS "admins_select_affiliate_monthly_closings" ON public.affiliate_monthly_closings;
CREATE POLICY "admins_select_affiliate_monthly_closings" ON public.affiliate_monthly_closings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_insert_affiliate_monthly_closings" ON public.affiliate_monthly_closings;
CREATE POLICY "admins_insert_affiliate_monthly_closings" ON public.affiliate_monthly_closings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_affiliate_monthly_closings" ON public.affiliate_monthly_closings;
CREATE POLICY "admins_update_affiliate_monthly_closings" ON public.affiliate_monthly_closings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_affiliate_monthly_closings" ON public.affiliate_monthly_closings;
CREATE POLICY "admins_delete_affiliate_monthly_closings" ON public.affiliate_monthly_closings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));

DROP POLICY IF EXISTS "admins_select_affiliate_closing_items" ON public.affiliate_closing_items;
CREATE POLICY "admins_select_affiliate_closing_items" ON public.affiliate_closing_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_insert_affiliate_closing_items" ON public.affiliate_closing_items;
CREATE POLICY "admins_insert_affiliate_closing_items" ON public.affiliate_closing_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_affiliate_closing_items" ON public.affiliate_closing_items;
CREATE POLICY "admins_update_affiliate_closing_items" ON public.affiliate_closing_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_affiliate_closing_items" ON public.affiliate_closing_items;
CREATE POLICY "admins_delete_affiliate_closing_items" ON public.affiliate_closing_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));


-- ==============================================================================
-- 6. COMPETENCE BILLINGS (20260911) — student_id/teacher_id ajustados para text
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.competence_billings (
  id text PRIMARY KEY,
  competence varchar(7) NOT NULL,
  category text NOT NULL,
  enrollment_id text,
  choir_registration_id text,
  group_id text,
  student_id text,
  teacher_id text,
  is_paying boolean NOT NULL DEFAULT true,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  final_price numeric(10,2) NOT NULL DEFAULT 0,
  teacher_fee_type text,
  teacher_fee_value numeric(10,2),
  teacher_share numeric(10,2) NOT NULL DEFAULT 0,
  school_share numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL,
  transaction_id text,
  is_frozen boolean NOT NULL DEFAULT false,
  frozen_at timestamptz,
  frozen_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_competence_billings_competence CHECK (competence ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT chk_competence_billings_category CHECK (category IN ('individual', 'group', 'choir')),
  CONSTRAINT chk_competence_billings_status CHECK (status IN ('pending', 'paid', 'waived', 'closed')),
  CONSTRAINT chk_competence_billings_origin CHECK (
    (category = 'individual' AND enrollment_id IS NOT NULL AND group_id IS NULL AND choir_registration_id IS NULL) OR
    (category = 'group' AND group_id IS NOT NULL AND enrollment_id IS NULL AND choir_registration_id IS NULL) OR
    (category = 'choir' AND choir_registration_id IS NOT NULL AND enrollment_id IS NULL AND group_id IS NULL)
  ),
  CONSTRAINT fk_competence_billings_enrollment FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_choir_registration FOREIGN KEY (choir_registration_id) REFERENCES public.choir_registrations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_group FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_teacher FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_transaction FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL,
  CONSTRAINT fk_competence_billings_frozen_by FOREIGN KEY (frozen_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competence_billings_uniq_enrollment
  ON public.competence_billings(competence, enrollment_id) WHERE enrollment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_competence_billings_uniq_choir
  ON public.competence_billings(competence, choir_registration_id) WHERE choir_registration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_competence_billings_uniq_group
  ON public.competence_billings(competence, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competence_billings_competence ON public.competence_billings(competence);
CREATE INDEX IF NOT EXISTS idx_competence_billings_category ON public.competence_billings(category);
CREATE INDEX IF NOT EXISTS idx_competence_billings_status ON public.competence_billings(status);
CREATE INDEX IF NOT EXISTS idx_competence_billings_student_id ON public.competence_billings(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competence_billings_teacher_id ON public.competence_billings(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competence_billings_transaction_id ON public.competence_billings(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competence_billings_frozen ON public.competence_billings(competence, is_frozen);

ALTER TABLE public.competence_billings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_competence_billings" ON public.competence_billings;
CREATE POLICY "admins_select_competence_billings" ON public.competence_billings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_insert_competence_billings" ON public.competence_billings;
CREATE POLICY "admins_insert_competence_billings" ON public.competence_billings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_competence_billings" ON public.competence_billings;
CREATE POLICY "admins_update_competence_billings" ON public.competence_billings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_competence_billings" ON public.competence_billings;
CREATE POLICY "admins_delete_competence_billings" ON public.competence_billings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));


-- ==============================================================================
-- 7. GOOGLE CALENDAR (20260916 + 20261005 inbound sync)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.teacher_google_accounts (
  teacher_id text PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  refresh_token text NOT NULL,
  access_token text,
  token_expires_at timestamptz,
  connection_status text NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'error')),
  next_sync_token text,
  last_inbound_sync_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_google_accounts_status
  ON public.teacher_google_accounts(connection_status);

CREATE TABLE IF NOT EXISTS public.class_google_events (
  platform_class_id text PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id text REFERENCES public.teachers(id) ON DELETE SET NULL,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  google_event_id text,
  origin text DEFAULT 'eavra' CHECK (origin IN ('eavra', 'google')),
  sync_direction text DEFAULT 'eavra_to_google' CHECK (sync_direction IN ('eavra_to_google', 'google_to_eavra')),
  etag text,
  recurring_event_id text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed')),
  last_error text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_class_google_events_calendar_event') THEN
    ALTER TABLE public.class_google_events
      ADD CONSTRAINT uq_class_google_events_calendar_event UNIQUE (google_calendar_id, google_event_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_class_google_events_teacher ON public.class_google_events(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_google_events_status ON public.class_google_events(sync_status);
CREATE INDEX IF NOT EXISTS idx_class_google_events_event_id ON public.class_google_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_class_google_events_recurring_id ON public.class_google_events(recurring_event_id);

ALTER TABLE public.teacher_google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_google_events ENABLE ROW LEVEL SECURITY;

-- teacher_google_accounts: admin full + teacher own-row
DROP POLICY IF EXISTS "admins_all_teacher_google_accounts" ON public.teacher_google_accounts;
CREATE POLICY "admins_all_teacher_google_accounts" ON public.teacher_google_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND p.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND p.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS "teachers_own_google_account" ON public.teacher_google_accounts;
CREATE POLICY "teachers_own_google_account" ON public.teacher_google_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND p.teacher_id = teacher_google_accounts.teacher_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND p.teacher_id = teacher_google_accounts.teacher_id));

-- class_google_events: admin full + teacher own events + authenticated select
DROP POLICY IF EXISTS "authenticated_select_class_google_events" ON public.class_google_events;
CREATE POLICY "authenticated_select_class_google_events" ON public.class_google_events FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admins_all_class_google_events" ON public.class_google_events;
CREATE POLICY "admins_all_class_google_events" ON public.class_google_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND p.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND p.role IN ('admin','super_admin')));

DROP POLICY IF EXISTS "teachers_own_class_google_events" ON public.class_google_events;
CREATE POLICY "teachers_own_class_google_events" ON public.class_google_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND (p.role IN ('admin','super_admin') OR p.teacher_id = class_google_events.teacher_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = auth.uid()::text AND (p.role IN ('admin','super_admin') OR p.teacher_id = class_google_events.teacher_id)));


-- ==============================================================================
-- 8. CREDITS (20260924) — teacher_id/student_id ajustados para text
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.credits (
  id text PRIMARY KEY,
  teacher_id text NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  student_id text REFERENCES public.students(id) ON DELETE SET NULL,
  enrollment_id text REFERENCES public.enrollments(id) ON DELETE SET NULL,
  group_id text REFERENCES public.groups(id) ON DELETE SET NULL,
  source_class_id text REFERENCES public.classes(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used', 'cancelled')),
  competency_month varchar(7) NOT NULL,
  used_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_credits_competency_month CHECK (competency_month ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credits_unique_source_class
  ON public.credits(source_class_id) WHERE source_class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credits_teacher_id ON public.credits(teacher_id);
CREATE INDEX IF NOT EXISTS idx_credits_status ON public.credits(status);
CREATE INDEX IF NOT EXISTS idx_credits_competency_month ON public.credits(competency_month);
CREATE INDEX IF NOT EXISTS idx_credits_student_id ON public.credits(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credits_group_id ON public.credits(group_id) WHERE group_id IS NOT NULL;

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to credits" ON public.credits;
CREATE POLICY "Admins full access to credits" ON public.credits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role IN ('super_admin','admin')));

DROP POLICY IF EXISTS "Teachers can read their credits" ON public.credits;
CREATE POLICY "Teachers can read their credits" ON public.credits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email') AND p.role = 'teacher' AND p.teacher_id = credits.teacher_id::text));


-- ==============================================================================
-- 9. TEACHER PIX KEYS (20261010) — teacher_id ajustado para text
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.teacher_pix_keys (
  teacher_id text PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE,
  pix_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teacher_pix_keys IS 'Armazenamento protegido de chaves Pix dos professores. Acesso restrito a administradores.';
COMMENT ON COLUMN public.teacher_pix_keys.teacher_id IS 'ID do professor vinculado em public.teachers (tipo text).';
COMMENT ON COLUMN public.teacher_pix_keys.pix_key IS 'Chave Pix (CPF, CNPJ, telefone, e-mail ou chave aleatória).';

ALTER TABLE public.teacher_pix_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.teacher_pix_keys FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_pix_keys TO authenticated;
GRANT ALL ON TABLE public.teacher_pix_keys TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'teacher_pix_keys' AND policyname = 'Admins can manage teacher_pix_keys'
  ) THEN
    CREATE POLICY "Admins can manage teacher_pix_keys"
      ON public.teacher_pix_keys FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id::text = auth.uid()::text OR profiles.email ILIKE auth.jwt()->>'email')
            AND profiles.role IN ('super_admin', 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE (profiles.id::text = auth.uid()::text OR profiles.email ILIKE auth.jwt()->>'email')
            AND profiles.role IN ('super_admin', 'admin')
        )
      );
  END IF;
END $$;


-- ==============================================================================
-- 10. CHOIR MONTHLY CLOSINGS (schema.sql seção 7) — uuid, RLS detalhada
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.choir_monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competence varchar(7) NOT NULL CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_current boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  total_rehearsals_count int NOT NULL DEFAULT 0 CHECK (total_rehearsals_count >= 0),
  total_payouts numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (total_payouts >= 0),
  rehearsals_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_by_name text NOT NULL,
  reopened_at timestamptz,
  reopened_by uuid,
  reopened_by_name text,
  reopen_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_choir_closings_competence_version UNIQUE (competence, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_choir_closings_current_competence
  ON public.choir_monthly_closings (competence) WHERE (is_current = true);

CREATE TABLE IF NOT EXISTS public.choir_monthly_closing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.choir_monthly_closings(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL,
  collaborator_name_snapshot text NOT NULL,
  collaborator_role_snapshot text NOT NULL,
  remuneration_type_snapshot varchar(30) NOT NULL,
  remuneration_value_snapshot numeric(10,2) NOT NULL DEFAULT 0.00,
  present_count int NOT NULL DEFAULT 0 CHECK (present_count >= 0),
  absent_count int NOT NULL DEFAULT 0 CHECK (absent_count >= 0),
  amount_due numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (amount_due >= 0),
  calculation_rule_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_choir_closing_collaborator UNIQUE (closing_id, collaborator_id)
);

ALTER TABLE public.choir_monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_monthly_closing_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "choir_monthly_closings_select" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_select" ON public.choir_monthly_closings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin','teacher')));
DROP POLICY IF EXISTS "choir_monthly_closings_insert" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_insert" ON public.choir_monthly_closings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "choir_monthly_closings_update" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_update" ON public.choir_monthly_closings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "choir_monthly_closings_delete" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_delete" ON public.choir_monthly_closings FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "choir_monthly_closing_items_select" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_select" ON public.choir_monthly_closing_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin','teacher')));
DROP POLICY IF EXISTS "choir_monthly_closing_items_insert" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_insert" ON public.choir_monthly_closing_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "choir_monthly_closing_items_update" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_update" ON public.choir_monthly_closing_items FOR UPDATE TO authenticated
  USING (false);
DROP POLICY IF EXISTS "choir_monthly_closing_items_delete" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_delete" ON public.choir_monthly_closing_items FOR DELETE TO authenticated
  USING (false);


-- ==============================================================================
-- 11. FUNÇÕES RPC ADMINISTRATIVAS
-- ==============================================================================

-- admin_reset_user_password (schema.sql)
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id text,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Admins podem redefinir senhas diretamente.');
  END IF;
  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID de usuário inválido.');
  END;
  UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf', 10)) WHERE id = uuid_target;
  UPDATE public.profiles SET temp_password = new_password WHERE id = target_user_id;
  RETURN jsonb_build_object('success', true, 'message', 'Senha redefinida diretamente com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- admin_toggle_user_access (versão FINAL de 20260918 — não toca auth.users)
CREATE OR REPLACE FUNCTION public.admin_toggle_user_access(
  target_user_id text,
  target_access_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas Super Administradores podem alterar o status de acesso de usuários.');
  END IF;
  IF target_access_status NOT IN ('active', 'blocked') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Status inválido. Deve ser active ou blocked.');
  END IF;
  IF auth.uid()::text = target_user_id AND target_access_status = 'blocked' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Operação não permitida: auto-bloqueio de Super Admin.');
  END IF;
  UPDATE public.profiles SET access_status = target_access_status WHERE id = target_user_id;
  RETURN jsonb_build_object('success', true, 'message', 'Perfil atualizado. Lembre-se que a suspensão de login deve ser executada pela Auth Admin API.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- admin_get_user_auth_status (20260917)
CREATE OR REPLACE FUNCTION public.admin_get_user_auth_status(
  target_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
  is_banned boolean;
  banned_date timestamptz;
  user_email text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas Super Administradores podem consultar status do Auth.');
  END IF;
  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID de usuário inválido.');
  END;
  SELECT email INTO user_email FROM public.profiles WHERE id = target_user_id;
  SELECT (banned_until IS NOT NULL AND banned_until > now()), banned_until
    INTO is_banned, banned_date
  FROM auth.users
  WHERE id = uuid_target OR (user_email IS NOT NULL AND lower(email) = lower(user_email))
  LIMIT 1;
  RETURN jsonb_build_object('success', true, 'is_banned', COALESCE(is_banned, false), 'banned_until', banned_date);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- admin_toggle_teacher_status (20260917)
CREATE OR REPLACE FUNCTION public.admin_toggle_teacher_status(
  target_teacher_id text,
  target_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas Super Administradores podem inativar ou reativar professores.');
  END IF;
  IF target_status NOT IN ('active', 'inactive') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Status inválido. Utilize "active" ou "inactive".');
  END IF;
  UPDATE public.teachers SET status = target_status WHERE id = target_teacher_id;
  RETURN jsonb_build_object('success', true, 'message', 'Status operacional do professor atualizado com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- close_choir_monthly_competence (schema.sql)
CREATE OR REPLACE FUNCTION public.close_choir_monthly_competence(
  p_competence varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role text;
  v_user_name text;
  v_current_closing record;
  v_new_version int := 1;
  v_new_closing_id uuid;
  v_start_date text;
  v_next_month_date text;
  v_rehearsals_snapshot jsonb := '[]'::jsonb;
  v_total_rehearsals int := 0;
  v_total_payouts numeric(10,2) := 0.00;
  v_collab record;
  v_present_count int;
  v_absent_count int;
  v_amount_due numeric(10,2);
  v_calc_rule text;
BEGIN
  IF p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Formato de competência inválido: %. Esperado YYYY-MM.', p_competence;
  END IF;
  SELECT role, COALESCE(email, 'Administrador') INTO v_user_role, v_user_name
  FROM public.profiles WHERE id = auth.uid()::text;
  IF v_user_role IS NULL OR v_user_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar o fechamento mensal.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('CHOIR_COMPETENCE_' || p_competence));
  SELECT id, version, status INTO v_current_closing
  FROM public.choir_monthly_closings WHERE competence = p_competence AND is_current = true;
  IF FOUND THEN
    IF v_current_closing.status = 'closed' THEN
      RAISE EXCEPTION 'A competência % já possui fechamento ativo (versão %). É necessário reabrir antes de gerar um novo fechamento.', p_competence, v_current_closing.version;
    ELSIF v_current_closing.status = 'reopened' THEN
      UPDATE public.choir_monthly_closings SET is_current = false WHERE id = v_current_closing.id;
      v_new_version := v_current_closing.version + 1;
    END IF;
  ELSE
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
    FROM public.choir_monthly_closings WHERE competence = p_competence;
  END IF;
  v_start_date := p_competence || '-01';
  v_next_month_date := to_char((to_date(v_start_date, 'YYYY-MM-DD') + interval '1 month'), 'YYYY-MM-DD');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'date', r.date, 'time', r.time, 'title', r.title, 'notes', r.notes) ORDER BY r.date ASC), '[]'::jsonb), COUNT(*)
    INTO v_rehearsals_snapshot, v_total_rehearsals
  FROM public.choir_rehearsals r
  WHERE r.date >= v_start_date AND r.date < v_next_month_date;
  INSERT INTO public.choir_monthly_closings (competence, version, is_current, status, total_rehearsals_count, total_payouts, rehearsals_snapshot, closed_at, closed_by, closed_by_name)
  VALUES (p_competence, v_new_version, true, 'closed', v_total_rehearsals, 0.00, v_rehearsals_snapshot, now(), auth.uid(), v_user_name)
  RETURNING id INTO v_new_closing_id;
  FOR v_collab IN
    SELECT DISTINCT ON (COALESCE(NULLIF(LOWER(TRIM(email)), ''), id::text)) id, name, role, remuneration_type, remuneration_value
    FROM public.choir_collaborators
    WHERE COALESCE(remuneration_value, 0) > 0
    ORDER BY COALESCE(NULLIF(LOWER(TRIM(email)), ''), id::text), created_at DESC
  LOOP
    SELECT
      COUNT(DISTINCT r.id) FILTER (WHERE att.elem->>'type' = 'collaborator' AND att.elem->>'status' = 'present'),
      COUNT(DISTINCT r.id) FILTER (WHERE att.elem->>'type' = 'collaborator' AND att.elem->>'status' = 'absent')
    INTO v_present_count, v_absent_count
    FROM public.choir_rehearsals r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN r.attendance IS NOT NULL AND trim(r.attendance) != '' AND jsonb_typeof(r.attendance::jsonb) = 'array' THEN r.attendance::jsonb ELSE '[]'::jsonb END
    ) AS att(elem)
    WHERE r.date >= v_start_date AND r.date < v_next_month_date AND att.elem->>'person_id' = v_collab.id::text;
    v_present_count := COALESCE(v_present_count, 0);
    v_absent_count := COALESCE(v_absent_count, 0);
    v_amount_due := ROUND(v_present_count * COALESCE(v_collab.remuneration_value, 0.00), 2);
    v_calc_rule := v_present_count || ' presença(s) x R$ ' || to_char(COALESCE(v_collab.remuneration_value, 0.00), 'FM999G990D00') || ' por ensaio';
    INSERT INTO public.choir_monthly_closing_items (closing_id, collaborator_id, collaborator_name_snapshot, collaborator_role_snapshot, remuneration_type_snapshot, remuneration_value_snapshot, present_count, absent_count, amount_due, calculation_rule_snapshot)
    VALUES (v_new_closing_id, v_collab.id, trim(v_collab.name), COALESCE(v_collab.role, 'Assistente de Naipe'), COALESCE(v_collab.remuneration_type, 'per_rehearsal'), COALESCE(v_collab.remuneration_value, 0.00), v_present_count, v_absent_count, v_amount_due, v_calc_rule);
    v_total_payouts := v_total_payouts + v_amount_due;
  END LOOP;
  UPDATE public.choir_monthly_closings SET total_payouts = v_total_payouts WHERE id = v_new_closing_id;
  RETURN jsonb_build_object('success', true, 'closing_id', v_new_closing_id, 'competence', p_competence, 'version', v_new_version, 'total_rehearsals', v_total_rehearsals, 'total_payouts', v_total_payouts);
END;
$$;

-- reopen_choir_monthly_competence (schema.sql)
CREATE OR REPLACE FUNCTION public.reopen_choir_monthly_competence(
  p_closing_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role text;
  v_user_name text;
  v_closing record;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A justificativa de reabertura é obrigatória.';
  END IF;
  SELECT role, COALESCE(email, 'Administrador') INTO v_user_role, v_user_name
  FROM public.profiles WHERE id = auth.uid()::text;
  IF v_user_role IS NULL OR v_user_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem reabrir competências.';
  END IF;
  SELECT id, competence, version, status, is_current INTO v_closing
  FROM public.choir_monthly_closings WHERE id = p_closing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento não encontrado (ID: %).', p_closing_id;
  END IF;
  IF NOT v_closing.is_current THEN
    RAISE EXCEPTION 'Apenas a versão ativa da competência % pode ser reaberta.', v_closing.competence;
  END IF;
  IF v_closing.status = 'reopened' THEN
    RAISE EXCEPTION 'A competência % (versão %) já se encontra reaberta.', v_closing.competence, v_closing.version;
  END IF;
  UPDATE public.choir_monthly_closings
  SET status = 'reopened', reopened_at = now(), reopened_by = auth.uid(), reopened_by_name = v_user_name, reopen_reason = trim(p_reason)
  WHERE id = p_closing_id;
  RETURN jsonb_build_object('success', true, 'closing_id', p_closing_id, 'competence', v_closing.competence, 'version', v_closing.version, 'status', 'reopened');
END;
$$;

-- Grants das funções RPC (restringir a authenticated + service_role)
REVOKE EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_toggle_user_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_access(text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_auth_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_auth_status(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_toggle_teacher_status(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_teacher_status(text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.close_choir_monthly_competence(varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_choir_monthly_competence(varchar) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reopen_choir_monthly_competence(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_choir_monthly_competence(uuid, text) TO authenticated, service_role;


-- ==============================================================================
-- 12. RLS DAS TABELAS BASE (substitui "Allow all" do schema.sql)
-- ==============================================================================
-- O app exige login (tela de Login). Políticas TO authenticated com checagem de
-- perfil válido. Professores leem dados operacionais; admins gerenciam tudo.
-- Nenhum grant para anon em tabelas de dados.

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_voice_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_choir_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_rehearsals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabelas operacionais: authenticated com perfil válido pode ler;
-- apenas admins podem inserir/atualizar/excluir.
-- Macro de checagem admin via subquery inline (Postgres não suporta macro real).

-- students
DROP POLICY IF EXISTS "auth_select_students" ON public.students;
CREATE POLICY "auth_select_students" ON public.students FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_students" ON public.students;
CREATE POLICY "admins_insert_students" ON public.students FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_students" ON public.students;
CREATE POLICY "admins_update_students" ON public.students FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_students" ON public.students;
CREATE POLICY "admins_delete_students" ON public.students FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- teachers
DROP POLICY IF EXISTS "auth_select_teachers" ON public.teachers;
CREATE POLICY "auth_select_teachers" ON public.teachers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_teachers" ON public.teachers;
CREATE POLICY "admins_insert_teachers" ON public.teachers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_teachers" ON public.teachers;
CREATE POLICY "admins_update_teachers" ON public.teachers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_teachers" ON public.teachers;
CREATE POLICY "admins_delete_teachers" ON public.teachers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- classes
DROP POLICY IF EXISTS "auth_select_classes" ON public.classes;
CREATE POLICY "auth_select_classes" ON public.classes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_classes" ON public.classes;
CREATE POLICY "admins_insert_classes" ON public.classes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_classes" ON public.classes;
CREATE POLICY "admins_update_classes" ON public.classes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_classes" ON public.classes;
CREATE POLICY "admins_delete_classes" ON public.classes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- enrollments
DROP POLICY IF EXISTS "auth_select_enrollments" ON public.enrollments;
CREATE POLICY "auth_select_enrollments" ON public.enrollments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_enrollments" ON public.enrollments;
CREATE POLICY "admins_insert_enrollments" ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_enrollments" ON public.enrollments;
CREATE POLICY "admins_update_enrollments" ON public.enrollments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_enrollments" ON public.enrollments;
CREATE POLICY "admins_delete_enrollments" ON public.enrollments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- class_students
DROP POLICY IF EXISTS "auth_select_class_students" ON public.class_students;
CREATE POLICY "auth_select_class_students" ON public.class_students FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_class_students" ON public.class_students;
CREATE POLICY "admins_insert_class_students" ON public.class_students FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_class_students" ON public.class_students;
CREATE POLICY "admins_update_class_students" ON public.class_students FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_class_students" ON public.class_students;
CREATE POLICY "admins_delete_class_students" ON public.class_students FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- transactions
DROP POLICY IF EXISTS "auth_select_transactions" ON public.transactions;
CREATE POLICY "auth_select_transactions" ON public.transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_transactions" ON public.transactions;
CREATE POLICY "admins_insert_transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_transactions" ON public.transactions;
CREATE POLICY "admins_update_transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_transactions" ON public.transactions;
CREATE POLICY "admins_delete_transactions" ON public.transactions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- groups
DROP POLICY IF EXISTS "auth_select_groups" ON public.groups;
CREATE POLICY "auth_select_groups" ON public.groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_groups" ON public.groups;
CREATE POLICY "admins_insert_groups" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_groups" ON public.groups;
CREATE POLICY "admins_update_groups" ON public.groups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_groups" ON public.groups;
CREATE POLICY "admins_delete_groups" ON public.groups FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- financial_plans
DROP POLICY IF EXISTS "auth_select_financial_plans" ON public.financial_plans;
CREATE POLICY "auth_select_financial_plans" ON public.financial_plans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_financial_plans" ON public.financial_plans;
CREATE POLICY "admins_insert_financial_plans" ON public.financial_plans FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_financial_plans" ON public.financial_plans;
CREATE POLICY "admins_update_financial_plans" ON public.financial_plans FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_financial_plans" ON public.financial_plans;
CREATE POLICY "admins_delete_financial_plans" ON public.financial_plans FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- financial_discount_rules
DROP POLICY IF EXISTS "auth_select_financial_discount_rules" ON public.financial_discount_rules;
CREATE POLICY "auth_select_financial_discount_rules" ON public.financial_discount_rules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_financial_discount_rules" ON public.financial_discount_rules;
CREATE POLICY "admins_insert_financial_discount_rules" ON public.financial_discount_rules FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_financial_discount_rules" ON public.financial_discount_rules;
CREATE POLICY "admins_update_financial_discount_rules" ON public.financial_discount_rules FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_financial_discount_rules" ON public.financial_discount_rules;
CREATE POLICY "admins_delete_financial_discount_rules" ON public.financial_discount_rules FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- choir_voice_types (leitura por authenticated; escrita admin)
DROP POLICY IF EXISTS "auth_select_choir_voice_types" ON public.choir_voice_types;
CREATE POLICY "auth_select_choir_voice_types" ON public.choir_voice_types FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_choir_voice_types" ON public.choir_voice_types;
CREATE POLICY "admins_insert_choir_voice_types" ON public.choir_voice_types FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_choir_voice_types" ON public.choir_voice_types;
CREATE POLICY "admins_update_choir_voice_types" ON public.choir_voice_types FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_choir_voice_types" ON public.choir_voice_types;
CREATE POLICY "admins_delete_choir_voice_types" ON public.choir_voice_types FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- choir_registrations
DROP POLICY IF EXISTS "auth_select_choir_registrations" ON public.choir_registrations;
CREATE POLICY "auth_select_choir_registrations" ON public.choir_registrations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_choir_registrations" ON public.choir_registrations;
CREATE POLICY "admins_insert_choir_registrations" ON public.choir_registrations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_choir_registrations" ON public.choir_registrations;
CREATE POLICY "admins_update_choir_registrations" ON public.choir_registrations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_choir_registrations" ON public.choir_registrations;
CREATE POLICY "admins_delete_choir_registrations" ON public.choir_registrations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- teacher_choir_payments
DROP POLICY IF EXISTS "auth_select_teacher_choir_payments" ON public.teacher_choir_payments;
CREATE POLICY "auth_select_teacher_choir_payments" ON public.teacher_choir_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_teacher_choir_payments" ON public.teacher_choir_payments;
CREATE POLICY "admins_insert_teacher_choir_payments" ON public.teacher_choir_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_teacher_choir_payments" ON public.teacher_choir_payments;
CREATE POLICY "admins_update_teacher_choir_payments" ON public.teacher_choir_payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_teacher_choir_payments" ON public.teacher_choir_payments;
CREATE POLICY "admins_delete_teacher_choir_payments" ON public.teacher_choir_payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- choir_collaborators
DROP POLICY IF EXISTS "auth_select_choir_collaborators" ON public.choir_collaborators;
CREATE POLICY "auth_select_choir_collaborators" ON public.choir_collaborators FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_choir_collaborators" ON public.choir_collaborators;
CREATE POLICY "admins_insert_choir_collaborators" ON public.choir_collaborators FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_choir_collaborators" ON public.choir_collaborators;
CREATE POLICY "admins_update_choir_collaborators" ON public.choir_collaborators FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_choir_collaborators" ON public.choir_collaborators;
CREATE POLICY "admins_delete_choir_collaborators" ON public.choir_collaborators FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- choir_rehearsals
DROP POLICY IF EXISTS "auth_select_choir_rehearsals" ON public.choir_rehearsals;
CREATE POLICY "auth_select_choir_rehearsals" ON public.choir_rehearsals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_choir_rehearsals" ON public.choir_rehearsals;
CREATE POLICY "admins_insert_choir_rehearsals" ON public.choir_rehearsals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_choir_rehearsals" ON public.choir_rehearsals;
CREATE POLICY "admins_update_choir_rehearsals" ON public.choir_rehearsals FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_choir_rehearsals" ON public.choir_rehearsals;
CREATE POLICY "admins_delete_choir_rehearsals" ON public.choir_rehearsals FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- academic_calendar
DROP POLICY IF EXISTS "auth_select_academic_calendar" ON public.academic_calendar;
CREATE POLICY "auth_select_academic_calendar" ON public.academic_calendar FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_academic_calendar" ON public.academic_calendar;
CREATE POLICY "admins_insert_academic_calendar" ON public.academic_calendar FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_academic_calendar" ON public.academic_calendar;
CREATE POLICY "admins_update_academic_calendar" ON public.academic_calendar FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_academic_calendar" ON public.academic_calendar;
CREATE POLICY "admins_delete_academic_calendar" ON public.academic_calendar FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- prospects
DROP POLICY IF EXISTS "auth_select_prospects" ON public.prospects;
CREATE POLICY "auth_select_prospects" ON public.prospects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text));
DROP POLICY IF EXISTS "admins_insert_prospects" ON public.prospects;
CREATE POLICY "admins_insert_prospects" ON public.prospects FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_prospects" ON public.prospects;
CREATE POLICY "admins_update_prospects" ON public.prospects FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_prospects" ON public.prospects;
CREATE POLICY "admins_delete_prospects" ON public.prospects FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));

-- profiles: usuário lê próprio perfil; admin lê todos; admin gerencia role/status
DROP POLICY IF EXISTS "auth_select_own_profile" ON public.profiles;
CREATE POLICY "auth_select_own_profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid()::text = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_insert_profiles" ON public.profiles;
CREATE POLICY "admins_insert_profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_update_profiles" ON public.profiles;
CREATE POLICY "admins_update_profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid()::text = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));
DROP POLICY IF EXISTS "admins_delete_profiles" ON public.profiles;
CREATE POLICY "admins_delete_profiles" ON public.profiles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role IN ('super_admin','admin')));


-- ==============================================================================
-- 13. GRANTS
-- ==============================================================================
-- Uso do schema para authenticated (app exige login). anon não recebe grants
-- em tabelas de dados. service_role recebe grants nas tabelas que Edge Functions
-- tocam (Google Calendar, pix keys, classes, class_students).

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Tabelas base: CRUD para authenticated (RLS filtra linhas)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.students, public.teachers, public.classes, public.enrollments,
  public.class_students, public.transactions, public.groups,
  public.financial_plans, public.financial_discount_rules,
  public.choir_voice_types, public.choir_registrations,
  public.teacher_choir_payments, public.choir_collaborators,
  public.choir_rehearsals, public.academic_calendar,
  public.prospects, public.profiles
TO authenticated;

-- Tabelas de afiliados: CRUD para authenticated (RLS admin-only)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.affiliates, public.affiliate_referrals,
  public.affiliate_commission_rules, public.affiliate_monthly_closings,
  public.affiliate_closing_items
TO authenticated;

-- competence_billings: CRUD para authenticated (RLS admin-only)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competence_billings TO authenticated;

-- choir closings: CRUD para authenticated (RLS admin/teacher)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.choir_monthly_closings, public.choir_monthly_closing_items
TO authenticated;

-- credits: CRUD para authenticated (RLS admin/teacher)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credits TO authenticated;

-- Google Calendar: authenticated + service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.teacher_google_accounts, public.class_google_events
TO authenticated, service_role;

-- classes + class_students: service_role (Edge Function inbound sync)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_students TO service_role;

-- service_role em todas as tabelas (bypassa RLS; usado por Edge Functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.students, public.teachers, public.enrollments, public.groups,
  public.financial_plans, public.transactions, public.prospects,
  public.profiles, public.choir_collaborators, public.choir_rehearsals,
  public.choir_registrations, public.teacher_choir_payments,
  public.choir_voice_types, public.academic_calendar,
  public.financial_discount_rules, public.affiliate_commission_rules,
  public.affiliate_monthly_closings, public.affiliate_closing_items,
  public.affiliates, public.affiliate_referrals,
  public.competence_billings, public.credits,
  public.choir_monthly_closings, public.choir_monthly_closing_items
TO service_role;

-- Privilégios padrão para futuras tabelas (mantém consistência)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;


-- ==============================================================================
-- 14. SEEDS NÃO-PESSOAIS
-- ==============================================================================

-- choir_voice_types (4 naipes — catálogo fixo, sem dados pessoais)
INSERT INTO public.choir_voice_types (id, name, max_slots) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Soprano', 25),
  ('22222222-2222-2222-2222-222222222222', 'Contralto', 20),
  ('33333333-3333-3333-3333-333333333333', 'Tenor', 15),
  ('44444444-4444-4444-4444-444444444444', 'Barítono', 10)
ON CONFLICT (id) DO NOTHING;

-- affiliate_commission_rules (10 faixas — valores públicos de comissão)
INSERT INTO public.affiliate_commission_rules (id, tier_quantity, total_commission_amount, is_defined, description)
VALUES
  ('tier_1', 1, 40.00, true, '1 indicação = R$ 40,00 total'),
  ('tier_2', 2, 80.00, true, '2 indicações = R$ 80,00 total'),
  ('tier_3', 3, 150.00, true, '3 indicações = R$ 150,00 total'),
  ('tier_4', 4, 200.00, true, '4 indicações = R$ 200,00 total'),
  ('tier_5', 5, 300.00, true, '5 indicações = R$ 300,00 total'),
  ('tier_6', 6, 360.00, true, '6 indicações = R$ 360,00 total'),
  ('tier_7', 7, 490.00, true, '7 indicações = R$ 490,00 total'),
  ('tier_8', 8, 560.00, true, '8 indicações = R$ 560,00 total'),
  ('tier_9', 9, 630.00, true, '9 indicações = R$ 630,00 total'),
  ('tier_10', 10, 700.00, true, '10 indicações = R$ 700,00 total')
ON CONFLICT (tier_quantity) DO UPDATE
SET total_commission_amount = EXCLUDED.total_commission_amount,
    is_defined = EXCLUDED.is_defined,
    description = EXCLUDED.description;


-- ==============================================================================
-- FIM DE schema-dev.sql
-- ==============================================================================
