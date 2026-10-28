-- ==============================================================================
-- schema-dev-v9-review.sql — revisão estática de schema-dev-v8-review.sql
-- Branch: bolt-migration-test   Data: 2026-10-28
-- ------------------------------------------------------------------------------
-- AVISO IMPORTANTE — LEIA ANTES DE EXECUTAR
--   Este script NÃO é destinado à produção. É exclusivamente para inicializar um
--   projeto Supabase de DESENVOLVIMENTO (IACRA-DEV) em banco vazio.
--   - Não execute em um banco que já contenha dados ou políticas preexistentes.
--   - Não execute contra o projeto de produção.
--   - A sintaxe SQL deste arquivo NÃO foi validada em um ambiente PostgreSQL
--     isolado. Antes de aplicar, valide-a em um sandbox. Esta versão incorpora
--     correções adicionais identificadas na revisão estática, mas ainda NÃO está aprovada para execução.
--   - Cada `CREATE POLICY` é precedido por `DROP POLICY IF EXISTS` SOMENTE para
--     idempotência em banco vazio. Em um banco com políticas preexistentes, o
--     DROP substituiria essas políticas silenciosamente — por isso o script é
--     destinado apenas a inicialização de DEV vazio.
--
-- CORREÇÕES MANTIDAS DA v8 E DESTA REVISÃO (v9 vs. v8)
--   1. Mantidos os delimitadores corrigidos dos blocos de FKs e Realtime.
--   2. Mantidos os privilégios padrão globais e de public para objetos futuros de
--      postgres, com o efeito em outros schemas do projeto DEV documentado abaixo.
--   3. A função admin_reset_user_password continua sem redefinir senhas e retorna
--      erro explícito; a implementação real permanece reservada à Auth Admin API.
--   4. Mantido o acesso por colunas seguras a teacher_google_accounts, sem escrita
--      direta de authenticated; tokens são responsabilidade do backend.
--   5. Mantida a política que limita class_google_events aos eventos do próprio professor.
--   6. choir_collaborators, choir_monthly_closings e
--      choir_monthly_closing_items ficam acessíveis exclusivamente a Super Admin.
--   7. As RPCs de fechamento/reabertura mensal do coral também exigem Super Admin.
--   8. Mantidas revogações de privilégios existentes antes dos grants explícitos.
--   9. is_active_super_admin recebeu REVOKE/GRANT EXECUTE explícitos, acompanhando
--      as ACLs dos demais helpers e evitando depender do EXECUTE padrão de PUBLIC.
--
-- CARACTERÍSTICAS HERDADAS DA v3 (ainda precisam ser confirmadas contra o app)
--   * Funções auxiliares SECURITY DEFINER para reduzir recursão RLS em profiles.
--   * Verificação de papel e status ativo nas RPCs administrativas.
--   * Prospects restrito a administradores; políticas próprias por tabela.
--   * FKs adicionais para classes.group_id e choir_collaborators.teacher_id.
--   * IDs text em módulos cuja compatibilidade com o app precisa ser preservada.
--   * Grants CRUD explícitos, sem grant CRUD padrão para tabelas futuras.
--
-- OBJETOS QUE NÃO PODEM SER CONFIRMADOS A PARTIR DO REPOSITÓRIO
--   - Matrícula Digital (docs/digital-enrollment/20261019_*.sql): rascunho em
--     docs/, não em supabase/migrations/; excluído desta revisão.
--   - Migração 20261004 (UUIDs/email de produção): excluída por design.
--   - Tabelas/colunas não presentes no schema e migrations disponíveis não foram
--     inventadas. Ver “Limitações e pendências” no final.
-- ==============================================================================


-- ==============================================================================
-- 1. EXTENSÕES
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ==============================================================================
-- 2. TABELAS BASE (PK text, colunas consolidadas das migrações)
-- ==============================================================================

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

-- profiles: temp_password mantido como coluna (compatibilidade com o app), mas
-- a função admin_reset_user_password NÃO grava senha em texto puro nele.
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher')),
  teacher_id text,
  temp_password text,
  access_status text NOT NULL DEFAULT 'active' CHECK (access_status IN ('active', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

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

CREATE TABLE IF NOT EXISTS public.groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  teacher_id text,
  schedule text,
  max_students integer,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

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

CREATE TABLE IF NOT EXISTS public.class_students (
  class_id text,
  student_id text,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id text PRIMARY KEY,
  type text CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL,
  description text NOT NULL,
  date date NOT NULL,
  status text CHECK (status IN ('pending', 'completed')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

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

CREATE TABLE IF NOT EXISTS public.choir_voice_types (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (name IN ('Soprano', 'Contralto', 'Tenor', 'Barítono')),
  max_slots integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.choir_registrations (
  id text PRIMARY KEY,
  student_id text,
  voice_type_id text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  monthly_fee numeric NOT NULL,
  is_internal_student boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.teacher_choir_payments (
  id text PRIMARY KEY,
  teacher_id text,
  role text NOT NULL CHECK (role IN ('regente', 'pianista_fixo', 'preparador')),
  payment_type text NOT NULL CHECK (payment_type IN ('free', 'hourly', 'per_rehearsal')),
  payment_value numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

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

CREATE TABLE IF NOT EXISTS public.choir_rehearsals (
  id text PRIMARY KEY,
  date text NOT NULL,
  time text DEFAULT '19:30',
  title text DEFAULT 'Ensaio Quinzenal do Coral',
  notes text,
  attendance text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

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
-- Cada FK é criada somente se não existir, com verificação explícita em
-- pg_constraint. Erros inesperados (exceto "já existe") são propagados.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_student_id_fkey' AND conrelid = 'public.enrollments'::regclass) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_plan_id_fkey' AND conrelid = 'public.enrollments'::regclass) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.financial_plans(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_teacher_id_fkey' AND conrelid = 'public.enrollments'::regclass) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_group_id_fkey' AND conrelid = 'public.enrollments'::regclass) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_students_class_id_fkey' AND conrelid = 'public.class_students'::regclass) THEN
    ALTER TABLE public.class_students ADD CONSTRAINT class_students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_students_student_id_fkey' AND conrelid = 'public.class_students'::regclass) THEN
    ALTER TABLE public.class_students ADD CONSTRAINT class_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_teacher_id_fkey' AND conrelid = 'public.classes'::regclass) THEN
    ALTER TABLE public.classes ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_choir_payments_teacher_id_fkey' AND conrelid = 'public.teacher_choir_payments'::regclass) THEN
    ALTER TABLE public.teacher_choir_payments ADD CONSTRAINT teacher_choir_payments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'choir_registrations_student_id_fkey' AND conrelid = 'public.choir_registrations'::regclass) THEN
    ALTER TABLE public.choir_registrations ADD CONSTRAINT choir_registrations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'choir_registrations_voice_type_id_fkey' AND conrelid = 'public.choir_registrations'::regclass) THEN
    ALTER TABLE public.choir_registrations ADD CONSTRAINT choir_registrations_voice_type_id_fkey FOREIGN KEY (voice_type_id) REFERENCES public.choir_voice_types(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_discount_rules_trigger_plan_id_fkey' AND conrelid = 'public.financial_discount_rules'::regclass) THEN
    ALTER TABLE public.financial_discount_rules ADD CONSTRAINT financial_discount_rules_trigger_plan_id_fkey FOREIGN KEY (trigger_plan_id) REFERENCES public.financial_plans(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_discount_rules_target_plan_id_fkey' AND conrelid = 'public.financial_discount_rules'::regclass) THEN
    ALTER TABLE public.financial_discount_rules ADD CONSTRAINT financial_discount_rules_target_plan_id_fkey FOREIGN KEY (target_plan_id) REFERENCES public.financial_plans(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_teacher_id_fkey' AND conrelid = 'public.groups'::regclass) THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_plans_exclusive_teacher_id_fkey' AND conrelid = 'public.financial_plans'::regclass) THEN
    ALTER TABLE public.financial_plans ADD CONSTRAINT financial_plans_exclusive_teacher_id_fkey FOREIGN KEY (exclusive_teacher_id) REFERENCES public.teachers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_teacher_id_fkey' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'choir_voice_types_name_key' AND conrelid = 'public.choir_voice_types'::regclass) THEN
    ALTER TABLE public.choir_voice_types ADD CONSTRAINT choir_voice_types_name_key UNIQUE (name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_group_id_fkey' AND conrelid = 'public.classes'::regclass) THEN
    ALTER TABLE public.classes ADD CONSTRAINT classes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'choir_collaborators_teacher_id_fkey' AND conrelid = 'public.choir_collaborators'::regclass) THEN
    ALTER TABLE public.choir_collaborators ADD CONSTRAINT choir_collaborators_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;
  END IF;
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
-- 5. MÓDULO DE AFILIADOS (20260909)
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_affiliate_id_fkey' AND conrelid = 'public.enrollments'::regclass) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_affiliate_id_fkey FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE SET NULL;
  END IF;
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


-- ==============================================================================
-- 6. COMPETENCE BILLINGS (20260911) — student_id/teacher_id text
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


-- ==============================================================================
-- 7. GOOGLE CALENDAR (20260916 + 20261005)
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_class_google_events_calendar_event' AND conrelid = 'public.class_google_events'::regclass) THEN
    ALTER TABLE public.class_google_events ADD CONSTRAINT uq_class_google_events_calendar_event UNIQUE (google_calendar_id, google_event_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_class_google_events_teacher ON public.class_google_events(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_google_events_status ON public.class_google_events(sync_status);
CREATE INDEX IF NOT EXISTS idx_class_google_events_event_id ON public.class_google_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_class_google_events_recurring_id ON public.class_google_events(recurring_event_id);


-- ==============================================================================
-- 8. CREDITS (20260924) — teacher_id/student_id text
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


-- ==============================================================================
-- 9. TEACHER PIX KEYS (20261010) — teacher_id text
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


-- ==============================================================================
-- 10. CHOIR MONTHLY CLOSINGS (schema.sql seção 7)
--    collaborator_id reconciliado como text + FK para choir_collaborators
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.choir_monthly_closings (
  id text PRIMARY KEY,
  competence varchar(7) NOT NULL CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_current boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  total_rehearsals_count int NOT NULL DEFAULT 0 CHECK (total_rehearsals_count >= 0),
  total_payouts numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (total_payouts >= 0),
  rehearsals_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by text,
  closed_by_name text NOT NULL,
  reopened_at timestamptz,
  reopened_by text,
  reopened_by_name text,
  reopen_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_choir_closings_competence_version' AND conrelid = 'public.choir_monthly_closings'::regclass) THEN
    ALTER TABLE public.choir_monthly_closings ADD CONSTRAINT uq_choir_closings_competence_version UNIQUE (competence, version);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_choir_closings_current_competence
  ON public.choir_monthly_closings (competence) WHERE (is_current = true);

CREATE TABLE IF NOT EXISTS public.choir_monthly_closing_items (
  id text PRIMARY KEY,
  closing_id text NOT NULL REFERENCES public.choir_monthly_closings(id) ON DELETE RESTRICT,
  collaborator_id text NOT NULL REFERENCES public.choir_collaborators(id) ON DELETE RESTRICT,
  collaborator_name_snapshot text NOT NULL,
  collaborator_role_snapshot text NOT NULL,
  remuneration_type_snapshot varchar(30) NOT NULL,
  remuneration_value_snapshot numeric(10,2) NOT NULL DEFAULT 0.00,
  present_count int NOT NULL DEFAULT 0 CHECK (present_count >= 0),
  absent_count int NOT NULL DEFAULT 0 CHECK (absent_count >= 0),
  amount_due numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (amount_due >= 0),
  calculation_rule_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_choir_closing_collaborator' AND conrelid = 'public.choir_monthly_closing_items'::regclass) THEN
    ALTER TABLE public.choir_monthly_closing_items ADD CONSTRAINT uq_choir_closing_collaborator UNIQUE (closing_id, collaborator_id);
  END IF;
END $$;


-- ==============================================================================
-- 11. FUNÇÃO AUXILIAR DE PAPEL (evita recursão de RLS em profiles)
-- ==============================================================================
-- SECURITY DEFINER: executa com privilégios do dono (superuser do schema),
-- search_path fixo, objetos qualificados. Retorna true se o usuário atual é
-- admin/super_admin E tem access_status='active'. Negativo para blocked.

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()::text
      AND p.role IN ('super_admin', 'admin')
      AND p.access_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()::text
      AND p.role = 'super_admin'
      AND p.access_status = 'active'
  );
$$;

-- A função helper também recebe ACL explícita: políticas e RPCs precisam executá-la,
-- mas usuários anon/PUBLIC não devem receber EXECUTE por concessão padrão.
REVOKE EXECUTE ON FUNCTION public.is_active_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_super_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_active_teacher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()::text
      AND p.role = 'teacher'
      AND p.access_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.teacher_id FROM public.profiles p WHERE p.id = auth.uid()::text AND p.access_status = 'active';
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_active_teacher() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_teacher() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_teacher_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_teacher_id() TO authenticated, service_role;


-- ==============================================================================
-- 12. FUNÇÕES RPC ADMINISTRATIVAS
-- ==============================================================================

-- ATENÇÃO: esta RPC é mantida temporariamente para compatibilidade de assinatura,
-- mas NÃO redefine a senha e não deve receber a senha nova. A operação real deve
-- usar uma Edge Function/backend protegido com service_role e Auth Admin API.
-- Até essa função existir e ser integrada ao frontend, retorna erro explícito.
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
BEGIN
  IF NOT public.is_active_admin() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Permissão negada. Apenas administradores ativos podem solicitar redefinição de senhas.');
  END IF;
  SELECT p.role INTO caller_role FROM public.profiles p WHERE p.id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role <> 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'Apenas Super Admin pode solicitar redefinição de senha.');
  END IF;
  RETURN jsonb_build_object('success', false, 'code', 'AUTH_ADMIN_API_REQUIRED', 'message', 'Redefinição não implementada nesta RPC. Use uma Edge Function segura com Auth Admin API; não envie a senha para esta RPC.');
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
  IF NOT public.is_active_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas administradores ativos podem alterar o status de acesso de usuários.');
  END IF;
  SELECT p.role INTO caller_role FROM public.profiles p WHERE p.id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Administradores podem alterar o status de acesso de usuários.');
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
  IF NOT public.is_active_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas administradores ativos podem consultar status do Auth.');
  END IF;
  SELECT p.role INTO caller_role FROM public.profiles p WHERE p.id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Administradores podem consultar status do Auth.');
  END IF;
  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID de usuário inválido.');
  END;
  SELECT p.email INTO user_email FROM public.profiles p WHERE p.id = target_user_id;
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
  IF NOT public.is_active_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas administradores ativos podem inativar ou reativar professores.');
  END IF;
  SELECT p.role INTO caller_role FROM public.profiles p WHERE p.id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Administradores podem inativar ou reativar professores.');
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

-- close_choir_monthly_competence (schema.sql) — adaptado para text IDs
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
  v_new_closing_id text;
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
  IF NOT public.is_active_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Admin ativo pode realizar o fechamento mensal.';
  END IF;
  SELECT p.role, COALESCE(p.email, 'Administrador') INTO v_user_role, v_user_name
  FROM public.profiles p WHERE p.id = auth.uid()::text;
  PERFORM pg_advisory_xact_lock(hashtext('CHOIR_COMPETENCE_' || p_competence));
  SELECT id, version, status INTO v_current_closing
  FROM public.choir_monthly_closings WHERE competence = p_competence AND is_current = true;
  IF FOUND THEN
    IF v_current_closing.status = 'closed' THEN
      RAISE EXCEPTION 'A competência % já possui fechamento ativo (versão %). Reabra antes de gerar um novo.', p_competence, v_current_closing.version;
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
  v_new_closing_id := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.choir_monthly_closings (id, competence, version, is_current, status, total_rehearsals_count, total_payouts, rehearsals_snapshot, closed_at, closed_by, closed_by_name)
  VALUES (v_new_closing_id, p_competence, v_new_version, true, 'closed', v_total_rehearsals, 0.00, v_rehearsals_snapshot, now(), auth.uid()::text, v_user_name);
  FOR v_collab IN
    SELECT DISTINCT ON (COALESCE(NULLIF(LOWER(TRIM(email)), ''), id)) id, name, role, remuneration_type, remuneration_value
    FROM public.choir_collaborators
    WHERE COALESCE(remuneration_value, 0) > 0 AND active = true
    ORDER BY COALESCE(NULLIF(LOWER(TRIM(email)), ''), id), created_at DESC
  LOOP
    SELECT
      COUNT(DISTINCT r.id) FILTER (WHERE att.elem->>'type' = 'collaborator' AND att.elem->>'status' = 'present'),
      COUNT(DISTINCT r.id) FILTER (WHERE att.elem->>'type' = 'collaborator' AND att.elem->>'status' = 'absent')
    INTO v_present_count, v_absent_count
    FROM public.choir_rehearsals r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN r.attendance IS NOT NULL AND trim(r.attendance) != '' AND jsonb_typeof(r.attendance::jsonb) = 'array' THEN r.attendance::jsonb ELSE '[]'::jsonb END
    ) AS att(elem)
    WHERE r.date >= v_start_date AND r.date < v_next_month_date AND att.elem->>'person_id' = v_collab.id;
    v_present_count := COALESCE(v_present_count, 0);
    v_absent_count := COALESCE(v_absent_count, 0);
    v_amount_due := ROUND(v_present_count * COALESCE(v_collab.remuneration_value, 0.00), 2);
    v_calc_rule := v_present_count || ' presença(s) x R$ ' || to_char(COALESCE(v_collab.remuneration_value, 0.00), 'FM999G990D00') || ' por ensaio';
    INSERT INTO public.choir_monthly_closing_items (id, closing_id, collaborator_id, collaborator_name_snapshot, collaborator_role_snapshot, remuneration_type_snapshot, remuneration_value_snapshot, present_count, absent_count, amount_due, calculation_rule_snapshot)
    VALUES (replace(gen_random_uuid()::text, '-', ''), v_new_closing_id, v_collab.id, trim(v_collab.name), COALESCE(v_collab.role, 'Assistente de Naipe'), COALESCE(v_collab.remuneration_type, 'per_rehearsal'), COALESCE(v_collab.remuneration_value, 0.00), v_present_count, v_absent_count, v_amount_due, v_calc_rule);
    v_total_payouts := v_total_payouts + v_amount_due;
  END LOOP;
  UPDATE public.choir_monthly_closings SET total_payouts = v_total_payouts WHERE id = v_new_closing_id;
  RETURN jsonb_build_object('success', true, 'closing_id', v_new_closing_id, 'competence', p_competence, 'version', v_new_version, 'total_rehearsals', v_total_rehearsals, 'total_payouts', v_total_payouts);
END;
$$;

-- reopen_choir_monthly_competence (schema.sql) — adaptado para text IDs
CREATE OR REPLACE FUNCTION public.reopen_choir_monthly_competence(
  p_closing_id text,
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
  IF NOT public.is_active_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Admin ativo pode reabrir competências.';
  END IF;
  SELECT p.role, COALESCE(p.email, 'Administrador') INTO v_user_role, v_user_name
  FROM public.profiles p WHERE p.id = auth.uid()::text;
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
  SET status = 'reopened', reopened_at = now(), reopened_by = auth.uid()::text, reopened_by_name = v_user_name, reopen_reason = trim(p_reason)
  WHERE id = p_closing_id;
  RETURN jsonb_build_object('success', true, 'closing_id', p_closing_id, 'competence', v_closing.competence, 'version', v_closing.version, 'status', 'reopened');
END;
$$;

-- Grants das funções RPC
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

REVOKE EXECUTE ON FUNCTION public.reopen_choir_monthly_competence(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_choir_monthly_competence(text, text) TO authenticated, service_role;


-- ==============================================================================
-- 13. RLS — HABILITAÇÃO EM TODAS AS TABELAS
-- ==============================================================================

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
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_closing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competence_billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_google_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_pix_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_monthly_closing_items ENABLE ROW LEVEL SECURITY;


-- ==============================================================================
-- 14. POLÍTICAS RLS
-- ==============================================================================
-- NOTA: cada CREATE POLICY é precedido por DROP POLICY IF EXISTS para
-- idempotência EM BANCO VAZIO de DEV. Em banco com políticas preexistentes,
-- o DROP as substituirá silenciosamente — por isso este script é destinado
-- apenas à inicialização de DEV vazio (ver AVISO no cabeçalho).
--
-- Princípios:
--   - Perfis com access_status='blocked' são negados (via is_active_admin/
--     is_active_teacher que verificam access_status='active').
--   - Admins ativos: acesso total a tabelas administrativas.
--   - Professores ativos: leitura apenas de dados vinculados a si (suas aulas,
--     seus alunos via enrollments, seus créditos, seus grupos). Sem acesso a
--     dados financeiros sensíveis (transactions, competence_billings,
--     affiliate_*, teacher_pix_keys de outros).
--   - profiles: leitura do próprio perfil ou admin; escrita admin-only.

-- ---------- profiles ----------
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid()::text = id OR public.is_active_admin());
DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid()::text = id OR public.is_active_admin())
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- students (admin full; teacher leitura dos seus) ----------
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = students.id AND e.teacher_id = public.current_teacher_id()
    ))
  );
DROP POLICY IF EXISTS "students_insert_admin" ON public.students;
CREATE POLICY "students_insert_admin" ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "students_update_admin" ON public.students;
CREATE POLICY "students_update_admin" ON public.students FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "students_delete_admin" ON public.students;
CREATE POLICY "students_delete_admin" ON public.students FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- teachers (admin full; teacher leitura de todos os professores) ----------
DROP POLICY IF EXISTS "teachers_select" ON public.teachers;
CREATE POLICY "teachers_select" ON public.teachers FOR SELECT TO authenticated
  USING (public.is_active_admin() OR public.is_active_teacher());
DROP POLICY IF EXISTS "teachers_insert_admin" ON public.teachers;
CREATE POLICY "teachers_insert_admin" ON public.teachers FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "teachers_update_admin" ON public.teachers;
CREATE POLICY "teachers_update_admin" ON public.teachers FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "teachers_delete_admin" ON public.teachers;
CREATE POLICY "teachers_delete_admin" ON public.teachers FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- classes (admin full; teacher leitura das suas aulas) ----------
DROP POLICY IF EXISTS "classes_select" ON public.classes;
CREATE POLICY "classes_select" ON public.classes FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND classes.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "classes_insert_admin" ON public.classes;
CREATE POLICY "classes_insert_admin" ON public.classes FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "classes_update_admin" ON public.classes;
CREATE POLICY "classes_update_admin" ON public.classes FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "classes_delete_admin" ON public.classes;
CREATE POLICY "classes_delete_admin" ON public.classes FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- enrollments (admin full; teacher leitura das suas matrículas) ----------
DROP POLICY IF EXISTS "enrollments_select" ON public.enrollments;
CREATE POLICY "enrollments_select" ON public.enrollments FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND enrollments.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "enrollments_insert_admin" ON public.enrollments;
CREATE POLICY "enrollments_insert_admin" ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "enrollments_update_admin" ON public.enrollments;
CREATE POLICY "enrollments_update_admin" ON public.enrollments FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "enrollments_delete_admin" ON public.enrollments;
CREATE POLICY "enrollments_delete_admin" ON public.enrollments FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- class_students (admin full; teacher leitura das suas aulas) ----------
DROP POLICY IF EXISTS "class_students_select" ON public.class_students;
CREATE POLICY "class_students_select" ON public.class_students FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND EXISTS (
      SELECT 1 FROM public.classes c WHERE c.id = class_students.class_id AND c.teacher_id = public.current_teacher_id()
    ))
  );
DROP POLICY IF EXISTS "class_students_insert_admin" ON public.class_students;
CREATE POLICY "class_students_insert_admin" ON public.class_students FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "class_students_update_admin" ON public.class_students;
CREATE POLICY "class_students_update_admin" ON public.class_students FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "class_students_delete_admin" ON public.class_students;
CREATE POLICY "class_students_delete_admin" ON public.class_students FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- transactions (admin full; teacher sem acesso) ----------
DROP POLICY IF EXISTS "transactions_select_admin" ON public.transactions;
CREATE POLICY "transactions_select_admin" ON public.transactions FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "transactions_insert_admin" ON public.transactions;
CREATE POLICY "transactions_insert_admin" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "transactions_update_admin" ON public.transactions;
CREATE POLICY "transactions_update_admin" ON public.transactions FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "transactions_delete_admin" ON public.transactions;
CREATE POLICY "transactions_delete_admin" ON public.transactions FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- groups (admin full; teacher leitura dos seus grupos) ----------
DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND groups.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "groups_insert_admin" ON public.groups;
CREATE POLICY "groups_insert_admin" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "groups_update_admin" ON public.groups;
CREATE POLICY "groups_update_admin" ON public.groups FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "groups_delete_admin" ON public.groups;
CREATE POLICY "groups_delete_admin" ON public.groups FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- financial_plans (admin full; teacher leitura de planos ativos) ----------
DROP POLICY IF EXISTS "financial_plans_select" ON public.financial_plans;
CREATE POLICY "financial_plans_select" ON public.financial_plans FOR SELECT TO authenticated
  USING (public.is_active_admin() OR (public.is_active_teacher() AND is_active = true));
DROP POLICY IF EXISTS "financial_plans_insert_admin" ON public.financial_plans;
CREATE POLICY "financial_plans_insert_admin" ON public.financial_plans FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "financial_plans_update_admin" ON public.financial_plans;
CREATE POLICY "financial_plans_update_admin" ON public.financial_plans FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "financial_plans_delete_admin" ON public.financial_plans;
CREATE POLICY "financial_plans_delete_admin" ON public.financial_plans FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- financial_discount_rules (admin only) ----------
DROP POLICY IF EXISTS "financial_discount_rules_select_admin" ON public.financial_discount_rules;
CREATE POLICY "financial_discount_rules_select_admin" ON public.financial_discount_rules FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "financial_discount_rules_insert_admin" ON public.financial_discount_rules;
CREATE POLICY "financial_discount_rules_insert_admin" ON public.financial_discount_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "financial_discount_rules_update_admin" ON public.financial_discount_rules;
CREATE POLICY "financial_discount_rules_update_admin" ON public.financial_discount_rules FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "financial_discount_rules_delete_admin" ON public.financial_discount_rules;
CREATE POLICY "financial_discount_rules_delete_admin" ON public.financial_discount_rules FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- choir_voice_types (leitura authenticated; escrita admin) ----------
DROP POLICY IF EXISTS "choir_voice_types_select" ON public.choir_voice_types;
CREATE POLICY "choir_voice_types_select" ON public.choir_voice_types FOR SELECT TO authenticated
  USING (public.is_active_admin() OR public.is_active_teacher());
DROP POLICY IF EXISTS "choir_voice_types_insert_admin" ON public.choir_voice_types;
CREATE POLICY "choir_voice_types_insert_admin" ON public.choir_voice_types FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "choir_voice_types_update_admin" ON public.choir_voice_types;
CREATE POLICY "choir_voice_types_update_admin" ON public.choir_voice_types FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "choir_voice_types_delete_admin" ON public.choir_voice_types;
CREATE POLICY "choir_voice_types_delete_admin" ON public.choir_voice_types FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- choir_registrations (admin full; teacher leitura) ----------
DROP POLICY IF EXISTS "choir_registrations_select" ON public.choir_registrations;
CREATE POLICY "choir_registrations_select" ON public.choir_registrations FOR SELECT TO authenticated
  USING (public.is_active_admin() OR public.is_active_teacher());
DROP POLICY IF EXISTS "choir_registrations_insert_admin" ON public.choir_registrations;
CREATE POLICY "choir_registrations_insert_admin" ON public.choir_registrations FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "choir_registrations_update_admin" ON public.choir_registrations;
CREATE POLICY "choir_registrations_update_admin" ON public.choir_registrations FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "choir_registrations_delete_admin" ON public.choir_registrations;
CREATE POLICY "choir_registrations_delete_admin" ON public.choir_registrations FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- teacher_choir_payments (admin full; teacher leitura dos seus) ----------
DROP POLICY IF EXISTS "teacher_choir_payments_select" ON public.teacher_choir_payments;
CREATE POLICY "teacher_choir_payments_select" ON public.teacher_choir_payments FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND teacher_choir_payments.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "teacher_choir_payments_insert_admin" ON public.teacher_choir_payments;
CREATE POLICY "teacher_choir_payments_insert_admin" ON public.teacher_choir_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "teacher_choir_payments_update_admin" ON public.teacher_choir_payments;
CREATE POLICY "teacher_choir_payments_update_admin" ON public.teacher_choir_payments FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "teacher_choir_payments_delete_admin" ON public.teacher_choir_payments;
CREATE POLICY "teacher_choir_payments_delete_admin" ON public.teacher_choir_payments FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- choir_collaborators (exclusivo para Super Admin) ----------
-- Nenhum professor nem perfil admin padrão pode consultar ou alterar estes dados.
DROP POLICY IF EXISTS "choir_collaborators_select" ON public.choir_collaborators;
CREATE POLICY "choir_collaborators_select" ON public.choir_collaborators FOR SELECT TO authenticated
  USING (public.is_active_super_admin());
DROP POLICY IF EXISTS "choir_collaborators_insert_admin" ON public.choir_collaborators;
CREATE POLICY "choir_collaborators_insert_admin" ON public.choir_collaborators FOR INSERT TO authenticated
  WITH CHECK (public.is_active_super_admin());
DROP POLICY IF EXISTS "choir_collaborators_update_admin" ON public.choir_collaborators;
CREATE POLICY "choir_collaborators_update_admin" ON public.choir_collaborators FOR UPDATE TO authenticated
  USING (public.is_active_super_admin()) WITH CHECK (public.is_active_super_admin());
DROP POLICY IF EXISTS "choir_collaborators_delete_admin" ON public.choir_collaborators;
CREATE POLICY "choir_collaborators_delete_admin" ON public.choir_collaborators FOR DELETE TO authenticated
  USING (public.is_active_super_admin());

-- ---------- choir_rehearsals (admin full; teacher leitura) ----------
DROP POLICY IF EXISTS "choir_rehearsals_select" ON public.choir_rehearsals;
CREATE POLICY "choir_rehearsals_select" ON public.choir_rehearsals FOR SELECT TO authenticated
  USING (public.is_active_admin() OR public.is_active_teacher());
DROP POLICY IF EXISTS "choir_rehearsals_insert_admin" ON public.choir_rehearsals;
CREATE POLICY "choir_rehearsals_insert_admin" ON public.choir_rehearsals FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "choir_rehearsals_update_admin" ON public.choir_rehearsals;
CREATE POLICY "choir_rehearsals_update_admin" ON public.choir_rehearsals FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "choir_rehearsals_delete_admin" ON public.choir_rehearsals;
CREATE POLICY "choir_rehearsals_delete_admin" ON public.choir_rehearsals FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- academic_calendar (leitura authenticated; escrita admin) ----------
DROP POLICY IF EXISTS "academic_calendar_select" ON public.academic_calendar;
CREATE POLICY "academic_calendar_select" ON public.academic_calendar FOR SELECT TO authenticated
  USING (public.is_active_admin() OR public.is_active_teacher());
DROP POLICY IF EXISTS "academic_calendar_insert_admin" ON public.academic_calendar;
CREATE POLICY "academic_calendar_insert_admin" ON public.academic_calendar FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "academic_calendar_update_admin" ON public.academic_calendar;
CREATE POLICY "academic_calendar_update_admin" ON public.academic_calendar FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "academic_calendar_delete_admin" ON public.academic_calendar;
CREATE POLICY "academic_calendar_delete_admin" ON public.academic_calendar FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- prospects (admin only; sem acesso de professores) ----------
DROP POLICY IF EXISTS "prospects_select_admin" ON public.prospects;
CREATE POLICY "prospects_select_admin" ON public.prospects FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "prospects_insert_admin" ON public.prospects;
CREATE POLICY "prospects_insert_admin" ON public.prospects FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "prospects_update_admin" ON public.prospects;
CREATE POLICY "prospects_update_admin" ON public.prospects FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "prospects_delete_admin" ON public.prospects;
CREATE POLICY "prospects_delete_admin" ON public.prospects FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- afiliados (admin only) ----------
DROP POLICY IF EXISTS "affiliates_select_admin" ON public.affiliates;
CREATE POLICY "affiliates_select_admin" ON public.affiliates FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "affiliates_insert_admin" ON public.affiliates;
CREATE POLICY "affiliates_insert_admin" ON public.affiliates FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliates_update_admin" ON public.affiliates;
CREATE POLICY "affiliates_update_admin" ON public.affiliates FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliates_delete_admin" ON public.affiliates;
CREATE POLICY "affiliates_delete_admin" ON public.affiliates FOR DELETE TO authenticated
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "affiliate_referrals_select_admin" ON public.affiliate_referrals;
CREATE POLICY "affiliate_referrals_select_admin" ON public.affiliate_referrals FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_referrals_insert_admin" ON public.affiliate_referrals;
CREATE POLICY "affiliate_referrals_insert_admin" ON public.affiliate_referrals FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_referrals_update_admin" ON public.affiliate_referrals;
CREATE POLICY "affiliate_referrals_update_admin" ON public.affiliate_referrals FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_referrals_delete_admin" ON public.affiliate_referrals;
CREATE POLICY "affiliate_referrals_delete_admin" ON public.affiliate_referrals FOR DELETE TO authenticated
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "affiliate_commission_rules_select_admin" ON public.affiliate_commission_rules;
CREATE POLICY "affiliate_commission_rules_select_admin" ON public.affiliate_commission_rules FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_commission_rules_insert_admin" ON public.affiliate_commission_rules;
CREATE POLICY "affiliate_commission_rules_insert_admin" ON public.affiliate_commission_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_commission_rules_update_admin" ON public.affiliate_commission_rules;
CREATE POLICY "affiliate_commission_rules_update_admin" ON public.affiliate_commission_rules FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_commission_rules_delete_admin" ON public.affiliate_commission_rules;
CREATE POLICY "affiliate_commission_rules_delete_admin" ON public.affiliate_commission_rules FOR DELETE TO authenticated
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "affiliate_monthly_closings_select_admin" ON public.affiliate_monthly_closings;
CREATE POLICY "affiliate_monthly_closings_select_admin" ON public.affiliate_monthly_closings FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_monthly_closings_insert_admin" ON public.affiliate_monthly_closings;
CREATE POLICY "affiliate_monthly_closings_insert_admin" ON public.affiliate_monthly_closings FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_monthly_closings_update_admin" ON public.affiliate_monthly_closings;
CREATE POLICY "affiliate_monthly_closings_update_admin" ON public.affiliate_monthly_closings FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_monthly_closings_delete_admin" ON public.affiliate_monthly_closings;
CREATE POLICY "affiliate_monthly_closings_delete_admin" ON public.affiliate_monthly_closings FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "affiliate_closing_items_select_admin" ON public.affiliate_closing_items;
CREATE POLICY "affiliate_closing_items_select_admin" ON public.affiliate_closing_items FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_closing_items_insert_admin" ON public.affiliate_closing_items;
CREATE POLICY "affiliate_closing_items_insert_admin" ON public.affiliate_closing_items FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_closing_items_update_admin" ON public.affiliate_closing_items;
CREATE POLICY "affiliate_closing_items_update_admin" ON public.affiliate_closing_items FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "affiliate_closing_items_delete_admin" ON public.affiliate_closing_items;
CREATE POLICY "affiliate_closing_items_delete_admin" ON public.affiliate_closing_items FOR DELETE TO authenticated
  USING (false);

-- ---------- competence_billings (admin only; teacher sem acesso) ----------
DROP POLICY IF EXISTS "competence_billings_select_admin" ON public.competence_billings;
CREATE POLICY "competence_billings_select_admin" ON public.competence_billings FOR SELECT TO authenticated
  USING (public.is_active_admin());
DROP POLICY IF EXISTS "competence_billings_insert_admin" ON public.competence_billings;
CREATE POLICY "competence_billings_insert_admin" ON public.competence_billings FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "competence_billings_update_admin" ON public.competence_billings;
CREATE POLICY "competence_billings_update_admin" ON public.competence_billings FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "competence_billings_delete_admin" ON public.competence_billings;
CREATE POLICY "competence_billings_delete_admin" ON public.competence_billings FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- teacher_google_accounts (metadados somente; tokens via backend) ----------
DROP POLICY IF EXISTS "teacher_google_accounts_select" ON public.teacher_google_accounts;
CREATE POLICY "teacher_google_accounts_select" ON public.teacher_google_accounts FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND teacher_google_accounts.teacher_id = public.current_teacher_id())
  );
-- Não criar políticas de INSERT/UPDATE/DELETE para authenticated nesta tabela.
-- O backend com service_role é responsável por gravar/remover tokens OAuth.

-- ---------- class_google_events (admin full; teacher leitura/escrita dos seus; authenticated select) ----------
DROP POLICY IF EXISTS "class_google_events_select" ON public.class_google_events;
CREATE POLICY "class_google_events_select" ON public.class_google_events FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND class_google_events.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "class_google_events_insert" ON public.class_google_events;
CREATE POLICY "class_google_events_insert" ON public.class_google_events FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_admin()
    OR (public.is_active_teacher() AND class_google_events.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "class_google_events_update" ON public.class_google_events;
CREATE POLICY "class_google_events_update" ON public.class_google_events FOR UPDATE TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND class_google_events.teacher_id = public.current_teacher_id())
  )
  WITH CHECK (
    public.is_active_admin()
    OR (public.is_active_teacher() AND class_google_events.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "class_google_events_delete" ON public.class_google_events;
CREATE POLICY "class_google_events_delete" ON public.class_google_events FOR DELETE TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND class_google_events.teacher_id = public.current_teacher_id())
  );

-- ---------- credits (admin full; teacher leitura dos seus) ----------
DROP POLICY IF EXISTS "credits_select" ON public.credits;
CREATE POLICY "credits_select" ON public.credits FOR SELECT TO authenticated
  USING (
    public.is_active_admin()
    OR (public.is_active_teacher() AND credits.teacher_id = public.current_teacher_id())
  );
DROP POLICY IF EXISTS "credits_insert_admin" ON public.credits;
CREATE POLICY "credits_insert_admin" ON public.credits FOR INSERT TO authenticated
  WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "credits_update_admin" ON public.credits;
CREATE POLICY "credits_update_admin" ON public.credits FOR UPDATE TO authenticated
  USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());
DROP POLICY IF EXISTS "credits_delete_admin" ON public.credits;
CREATE POLICY "credits_delete_admin" ON public.credits FOR DELETE TO authenticated
  USING (public.is_active_admin());

-- ---------- teacher_pix_keys (admin only) ----------
DROP POLICY IF EXISTS "teacher_pix_keys_admin" ON public.teacher_pix_keys;
CREATE POLICY "teacher_pix_keys_admin" ON public.teacher_pix_keys FOR ALL TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- ---------- choir_monthly_closings (exclusivo para Super Admin) ----------
DROP POLICY IF EXISTS "choir_monthly_closings_select" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_select" ON public.choir_monthly_closings FOR SELECT TO authenticated
  USING (public.is_active_super_admin());
DROP POLICY IF EXISTS "choir_monthly_closings_insert_admin" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_insert_admin" ON public.choir_monthly_closings FOR INSERT TO authenticated
  WITH CHECK (public.is_active_super_admin());
DROP POLICY IF EXISTS "choir_monthly_closings_update_admin" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_update_admin" ON public.choir_monthly_closings FOR UPDATE TO authenticated
  USING (public.is_active_super_admin()) WITH CHECK (public.is_active_super_admin());
-- Exclusão continua bloqueada até existir um procedimento administrativo seguro.
DROP POLICY IF EXISTS "choir_monthly_closings_delete_admin" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_delete_admin" ON public.choir_monthly_closings FOR DELETE TO authenticated
  USING (false);

-- ---------- choir_monthly_closing_items (exclusivo para Super Admin) ----------
DROP POLICY IF EXISTS "choir_monthly_closing_items_select" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_select" ON public.choir_monthly_closing_items FOR SELECT TO authenticated
  USING (public.is_active_super_admin());
DROP POLICY IF EXISTS "choir_monthly_closing_items_insert_admin" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_insert_admin" ON public.choir_monthly_closing_items FOR INSERT TO authenticated
  WITH CHECK (public.is_active_super_admin());
-- Itens históricos não podem ser editados/excluídos diretamente.
DROP POLICY IF EXISTS "choir_monthly_closing_items_update_admin" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_update_admin" ON public.choir_monthly_closing_items FOR UPDATE TO authenticated
  USING (false);
DROP POLICY IF EXISTS "choir_monthly_closing_items_delete_admin" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_delete_admin" ON public.choir_monthly_closing_items FOR DELETE TO authenticated
  USING (false);

-- ==============================================================================
-- 15. GRANTS E REVOKE
-- ==============================================================================
-- Allowlist explícita. Remove privilégios antigos/deferidos nas tabelas do schema
-- antes dos GRANTs abaixo, inclusive grants deixados por uma execução parcial.
-- Acesso efetivo continua dependendo também das políticas RLS.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- anon não acessa tabelas de dados; authenticated recebe apenas os grants listados
-- abaixo; service_role recebe os grants necessários ao backend.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Tabelas operacionais
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.students, public.teachers, public.classes, public.enrollments,
  public.class_students, public.groups, public.financial_plans,
  public.choir_voice_types, public.choir_registrations,
  public.teacher_choir_payments, public.choir_collaborators,
  public.choir_rehearsals, public.academic_calendar,
  public.prospects, public.profiles
TO authenticated;

-- Tabelas administrativas (RLS admin-only restringe efetivamente)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.transactions, public.financial_discount_rules,
  public.affiliates, public.affiliate_referrals,
  public.affiliate_commission_rules, public.affiliate_monthly_closings,
  public.affiliate_closing_items, public.competence_billings,
  public.choir_monthly_closings, public.choir_monthly_closing_items,
  public.credits
TO authenticated;

-- Google Calendar
-- Revogação explícita na tabela sensível para impedir qualquer grant de tabela
-- que possa dar acesso indireto às colunas de tokens. authenticated só lê
-- metadados permitidos; escrita de tokens precisa passar pelo backend.
REVOKE ALL ON TABLE public.teacher_google_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT (teacher_id, google_email, google_calendar_id, connection_status, next_sync_token, last_inbound_sync_at, connected_at, updated_at) ON public.teacher_google_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_google_events TO authenticated;

-- teacher_pix_keys: REVOKE explícito de PUBLIC/anon; grants authenticated
REVOKE ALL ON TABLE public.teacher_pix_keys FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_pix_keys TO authenticated;

-- service_role em todas as tabelas
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.students, public.teachers, public.classes, public.enrollments,
  public.class_students, public.transactions, public.groups,
  public.financial_plans, public.financial_discount_rules,
  public.choir_voice_types, public.choir_registrations,
  public.teacher_choir_payments, public.choir_collaborators,
  public.choir_rehearsals, public.academic_calendar,
  public.prospects, public.profiles,
  public.affiliates, public.affiliate_referrals,
  public.affiliate_commission_rules, public.affiliate_monthly_closings,
  public.affiliate_closing_items,
  public.competence_billings, public.credits,
  public.choir_monthly_closings, public.choir_monthly_closing_items,
  public.teacher_google_accounts, public.class_google_events,
  public.teacher_pix_keys
TO service_role;

-- Privilégios padrão explícitos para objetos futuros criados pelo papel postgres.
-- PostgreSQL combina privilégios padrão globais com os específicos do schema; um
-- REVOKE apenas em public não remove uma concessão que exista no nível global.
-- Por isso, esta base DEV revoga ambos os níveis para anon/authenticated/service_role.
-- Novos objetos só serão acessíveis quando receberem GRANT explícito.
-- O papel postgres é o esperado para executar migrations no SQL Editor do Supabase.
-- Se outro papel criar objetos, seus default privileges precisarão ser revistos também.
-- Estes REVOKEs afetam objetos futuros, não substituem os GRANTs explícitos para
-- objetos existentes. O REVOKE global também afeta objetos futuros em outros schemas
-- criados por postgres; este script é exclusivamente para inicializar IACRA-DEV vazio.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

-- Também remove eventuais GRANTs padrão específicos do schema public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

-- EXECUTE é normalmente concedido a PUBLIC por padrão. Este REVOKE global remove
-- essa permissão para funções futuras criadas por postgres; conceder EXECUTE depois
-- somente às funções e aos papéis que realmente precisam.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ==============================================================================
-- 16. SUPABASE REALTIME
-- ==============================================================================
-- O app (src/App.tsx) assina `profiles` (canal
-- 'profile-access-watcher-<userId>', evento UPDATE) para revogação imediata
-- de acesso. Este bloco garante que `profiles` faça parte da publication.
-- Se `supabase_realtime` já contiver outras tabelas, este bloco NÃO as remove;
-- revisar a lista da publication separadamente antes de considerar o escopo fechado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'profiles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
  ELSE
    -- Se a role de execução não tiver privilégio para criar a publication,
    -- o erro será propagado em vez de ser ocultado.
    CREATE PUBLICATION supabase_realtime FOR TABLE public.profiles;
  END IF;
END $$;


-- ==============================================================================
-- 17. SEEDS NÃO-PESSOAIS
-- ==============================================================================

INSERT INTO public.choir_voice_types (id, name, max_slots) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Soprano', 25),
  ('22222222-2222-2222-2222-222222222222', 'Contralto', 20),
  ('33333333-3333-3333-3333-333333333333', 'Tenor', 15),
  ('44444444-4444-4444-4444-444444444444', 'Barítono', 10)
ON CONFLICT (id) DO NOTHING;

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
-- 18. LIMITAÇÕES E PENDÊNCIAS ANTES DE QUALQUER EXECUÇÃO
-- ==============================================================================
-- 1. Este arquivo não foi executado nem validado por um parser PostgreSQL real.
-- 2. ALTER DEFAULT PRIVILEGES globais e para public foram configurados para postgres;
--    confirmar o papel real que criará objetos nas migrations do projeto. A configuração
--    global afeta objetos futuros em outros schemas criados por postgres no banco DEV.
-- 3. A RPC admin_reset_user_password retorna erro explícito. Criar e integrar
--    uma Edge Function protegida com Auth Admin API antes de reativar o fluxo.
-- 4. teacher_google_accounts agora não aceita escrita direta de authenticated.
--    Confirmar que OAuth, renovação e desconexão salvam/removem tokens por meio
--    de backend/Edge Function com service_role; caso contrário, a integração
--    de calendário precisará ser adaptada antes de aplicar este script.
-- 5. choir_collaborators, choir_monthly_closings e
--    choir_monthly_closing_items são acessíveis somente ao Super Admin via RLS;
--    as RPCs de fechamento/reabertura também fazem essa verificação.
-- 6. O frontend ainda precisa esconder a opção correspondente de todos os perfis
--    exceto Super Admin. RLS protege os dados, mas não controla visibilidade de botões.
-- 7. Confirmar que o vínculo profiles.role='super_admin' e access_status='active'
--    corresponde à regra oficial de autorização do aplicativo.
-- 8. O bloco Realtime adiciona profiles se necessário, mas não remove outras tabelas
--    que já possam estar na publication existente; inspecionar a publication no
--    ambiente isolado se for requisito publicar somente profiles.
-- 9. Confirmar o schema contra as migrations reais e o código atual do app.
--    O script é para banco IACRA-DEV vazio; não aplicar em produção nem em banco
--    que contenha dados/políticas importantes.
-- 10. O script não implementa Matrícula Digital nem salas/agendamento novo.
--    Esses módulos exigem desenho/migrations separadas após validação do schema.

-- ==============================================================================
-- FIM DE schema-dev-v9-review.sql (revisão estática; não validado em PostgreSQL)
-- ==============================================================================
