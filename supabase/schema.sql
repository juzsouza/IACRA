-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. BASE TABLES (DEPENDENCY-FREE DEFINITIONS TO PREVENT TYPE MISMATCHES ON CREATION)
-- ==========================================

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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Teachers
CREATE TABLE IF NOT EXISTS public.teachers (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  cpf text,
  specialties text[],
  birth_date date,
  schedule jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Prospects (no dependencies)
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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher')),
  teacher_id text,
  temp_password text,
  access_status text NOT NULL DEFAULT 'active' CHECK (access_status IN ('active', 'blocked')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.profiles ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active' CHECK (access_status IN ('active', 'blocked'));

-- Classes
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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Groups
CREATE TABLE IF NOT EXISTS public.groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  teacher_id text,
  schedule text,
  max_students integer,
  status text DEFAULT 'active',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enrollments
CREATE TABLE IF NOT EXISTS public.enrollments (
  id text PRIMARY KEY,
  student_id text,
  plan_id text,
  teacher_id text,
  group_id text,
  custom_price numeric,
  start_date date,
  enrollment_date date,
  status text CHECK (status IN ('active', 'inactive', 'cancelled')),
  due_day integer,
  due_date_day integer,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Class Students Join Table
CREATE TABLE IF NOT EXISTS public.class_students (
  class_id text,
  student_id text,
  PRIMARY KEY (class_id, student_id)
);

-- Transactions (no dependencies)
CREATE TABLE IF NOT EXISTS public.transactions (
  id text PRIMARY KEY,
  type text CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL,
  description text NOT NULL,
  date date NOT NULL,
  status text CHECK (status IN ('pending', 'completed')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Choir Voice Types (no dependencies)
CREATE TABLE IF NOT EXISTS public.choir_voice_types (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (name IN ('Soprano', 'Contralto', 'Tenor', 'Barítono')),
  max_slots integer NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Choir Registrations
CREATE TABLE IF NOT EXISTS public.choir_registrations (
  id text PRIMARY KEY,
  student_id text,
  voice_type_id text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  monthly_fee numeric NOT NULL,
  is_internal_student boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Teacher Choir Payments
CREATE TABLE IF NOT EXISTS public.teacher_choir_payments (
  id text PRIMARY KEY,
  teacher_id text,
  role text NOT NULL CHECK (role IN ('regente', 'pianista_fixo', 'preparador')),
  payment_type text NOT NULL CHECK (payment_type IN ('free', 'hourly', 'per_rehearsal')),
  payment_value numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Choir Collaborators
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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Choir Rehearsals
CREATE TABLE IF NOT EXISTS public.choir_rehearsals (
  id text PRIMARY KEY,
  date text NOT NULL,
  time text DEFAULT '19:30',
  title text DEFAULT 'Ensaio Quinzenal do Coral',
  notes text,
  attendance text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Academic Calendar (no dependencies)
CREATE TABLE IF NOT EXISTS public.academic_calendar (
  id text PRIMARY KEY,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('holiday', 'recess', 'return', 'end')),
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==========================================
-- 2. SCHEMAS & TYPES IDEMPOTENT MIGRATIONS
-- ==========================================

DO $$
BEGIN
  -- Drop foreign keys first to allow type alteration if needed
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments DROP CONSTRAINT IF EXISTS enrollments_plan_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments DROP CONSTRAINT IF EXISTS enrollments_teacher_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments DROP CONSTRAINT IF EXISTS enrollments_group_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students DROP CONSTRAINT IF EXISTS class_students_class_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students DROP CONSTRAINT IF EXISTS class_students_student_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.classes DROP CONSTRAINT IF EXISTS classes_teacher_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.teacher_choir_payments DROP CONSTRAINT IF EXISTS teacher_choir_payments_teacher_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations DROP CONSTRAINT IF EXISTS choir_registrations_student_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations DROP CONSTRAINT IF EXISTS choir_registrations_voice_type_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules DROP CONSTRAINT IF EXISTS financial_discount_rules_trigger_plan_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules DROP CONSTRAINT IF EXISTS financial_discount_rules_target_plan_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.groups DROP CONSTRAINT IF EXISTS groups_teacher_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_plans DROP CONSTRAINT IF EXISTS financial_plans_exclusive_teacher_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_plans DROP CONSTRAINT IF EXISTS fk_exclusive_teacher'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.profiles DROP CONSTRAINT IF EXISTS profiles_teacher_id_fkey'; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Alter columns to text (to support both UUID and custom string IDs seamlessly)
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.students ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.teachers ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.classes ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.classes ALTER COLUMN teacher_id TYPE text USING teacher_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_plans ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_plans ALTER COLUMN exclusive_teacher_id TYPE text USING exclusive_teacher_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ALTER COLUMN student_id TYPE text USING student_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ALTER COLUMN plan_id TYPE text USING plan_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ALTER COLUMN teacher_id TYPE text USING teacher_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ALTER COLUMN group_id TYPE text USING group_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.profiles ALTER COLUMN teacher_id TYPE text USING teacher_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students ALTER COLUMN class_id TYPE text USING class_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students ALTER COLUMN student_id TYPE text USING student_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.transactions ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules ALTER COLUMN trigger_plan_id TYPE text USING trigger_plan_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules ALTER COLUMN target_plan_id TYPE text USING target_plan_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_voice_types ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations ALTER COLUMN student_id TYPE text USING student_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations ALTER COLUMN voice_type_id TYPE text USING voice_type_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.teacher_choir_payments ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.teacher_choir_payments ALTER COLUMN teacher_id TYPE text USING teacher_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.academic_calendar ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.groups ALTER COLUMN id TYPE text USING id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.groups ALTER COLUMN teacher_id TYPE text USING teacher_id::text'; EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Recreate foreign keys (guaranteeing type compatibility)
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT enrollments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.financial_plans(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT enrollments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.enrollments ADD CONSTRAINT enrollments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students ADD CONSTRAINT class_students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.class_students ADD CONSTRAINT class_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.classes ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.teacher_choir_payments ADD CONSTRAINT teacher_choir_payments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations ADD CONSTRAINT choir_registrations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.choir_registrations ADD CONSTRAINT choir_registrations_voice_type_id_fkey FOREIGN KEY (voice_type_id) REFERENCES public.choir_voice_types(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules ADD CONSTRAINT financial_discount_rules_trigger_plan_id_fkey FOREIGN KEY (trigger_plan_id) REFERENCES public.financial_plans(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_discount_rules ADD CONSTRAINT financial_discount_rules_target_plan_id_fkey FOREIGN KEY (target_plan_id) REFERENCES public.financial_plans(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.groups ADD CONSTRAINT groups_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.financial_plans ADD CONSTRAINT financial_plans_exclusive_teacher_id_fkey FOREIGN KEY (exclusive_teacher_id) REFERENCES public.teachers(id)'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN EXECUTE 'ALTER TABLE IF EXISTS public.profiles ADD CONSTRAINT profiles_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;


-- ==========================================
-- 3. SEED INITIAL DATA
-- ==========================================

-- Insert initial data for choir_voice_types (using standard valid UUID formats)
INSERT INTO public.choir_voice_types (id, name, max_slots) VALUES
('11111111-1111-1111-1111-111111111111', 'Soprano', 25),
('22222222-2222-2222-2222-222222222222', 'Contralto', 20),
('33333333-3333-3333-3333-333333333333', 'Tenor', 15),
('44444444-4444-4444-4444-444444444444', 'Barítono', 10)
ON CONFLICT (id) DO NOTHING;


-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS) & PERMISSIVE POLICIES
-- ==========================================

-- Enable RLS on all public tables
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_voice_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teacher_choir_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_rehearsals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.academic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper to safely drop and recreate universal policies on all tables
DO $$
DECLARE
  tbl_name text;
  pol_name text;
  tables text[] := ARRAY[
    'students', 'teachers', 'classes', 'enrollments', 'class_students',
    'transactions', 'groups', 'financial_plans', 'financial_discount_rules',
    'choir_voice_types', 'choir_registrations', 'teacher_choir_payments',
    'choir_collaborators', 'choir_rehearsals', 'academic_calendar',
    'prospects', 'profiles'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY tables LOOP
    -- Drop all existing policies on this table to prevent conflicting/restrictive rules
    FOR pol_name IN (
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl_name
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, tbl_name);
    END LOOP;

    -- Create universal permissive CRUD policy for all authenticated and anon users
    EXECUTE format('CREATE POLICY "Allow all" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl_name);
  END LOOP;
END $$;

-- Explicitly grant full permissions to both authenticated (teachers/admins) and anon roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;


-- ==========================================
-- 5. CLEANUP & ADDITIONAL MIGRATIONS
-- ==========================================

-- Cleanup duplicate choir_voice_types and enforce unique name
DO $$
BEGIN
  -- Update registrations to point to the canonical IDs based on the name of their current voice type
  BEGIN
    UPDATE public.choir_registrations cr
    SET voice_type_id = 
      CASE (SELECT name FROM public.choir_voice_types WHERE id = cr.voice_type_id)
        WHEN 'Soprano' THEN '11111111-1111-1111-1111-111111111111'
        WHEN 'Contralto' THEN '22222222-2222-2222-2222-222222222222'
        WHEN 'Tenor' THEN '33333333-3333-3333-3333-333333333333'
        WHEN 'Barítono' THEN '44444444-4444-4444-4444-444444444444'
        ELSE cr.voice_type_id
      END;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Delete all voice types that are not the canonical ones
  BEGIN
    DELETE FROM public.choir_voice_types 
    WHERE id NOT IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Add unique constraint if it doesn't exist
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'choir_voice_types_name_key'
    ) THEN
      ALTER TABLE IF EXISTS public.choir_voice_types ADD CONSTRAINT choir_voice_types_name_key UNIQUE (name);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Migration to add columns to existing tables
ALTER TABLE IF EXISTS public.students ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE IF EXISTS public.teachers ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE IF EXISTS public.teachers ADD COLUMN IF NOT EXISTS schedule jsonb;
ALTER TABLE IF EXISTS public.teachers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(status);
ALTER TABLE IF EXISTS public.classes ADD COLUMN IF NOT EXISTS group_id text;
ALTER TABLE IF EXISTS public.classes ADD COLUMN IF NOT EXISTS report text;
ALTER TABLE IF EXISTS public.classes ADD COLUMN IF NOT EXISTS vocal_routine text;
ALTER TABLE IF EXISTS public.classes ADD COLUMN IF NOT EXISTS attendance jsonb;

-- Migration to add columns to enrollments table for existing databases
ALTER TABLE IF EXISTS public.enrollments ADD COLUMN IF NOT EXISTS teacher_id text;
ALTER TABLE IF EXISTS public.enrollments ADD COLUMN IF NOT EXISTS group_id text;
ALTER TABLE IF EXISTS public.enrollments ADD COLUMN IF NOT EXISTS custom_price numeric;
ALTER TABLE IF EXISTS public.enrollments ADD COLUMN IF NOT EXISTS enrollment_date date;
ALTER TABLE IF EXISTS public.enrollments ADD COLUMN IF NOT EXISTS due_date_day integer;

-- Data migration for existing enrollments
DO $$
BEGIN
  -- If enrollment_date is null but start_date exists and has value, migrate it
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='start_date') THEN
    UPDATE public.enrollments SET enrollment_date = start_date WHERE enrollment_date IS NULL;
  END IF;

  -- If due_date_day is null but due_day exists and has value, migrate it
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='due_day') THEN
    UPDATE public.enrollments SET due_date_day = due_day WHERE due_date_day IS NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Migration to add temp_password to profiles
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS temp_password text;

-- ==========================================
-- 6. CORAL, REGISTRO DE AULAS & FINANCIAL INTEGRITY CLEANUP
-- ==========================================

DO $$
BEGIN
  -- 1. Remove any ghost system backup records from choir_voice_types
  DELETE FROM public.choir_voice_types 
  WHERE id IN ('sys_rehearsals_backup', 'sys_collaborators_backup')
     OR id LIKE 'sys_%';

  -- 2. Inactivate enrollments of inactive or non-eligible students
  UPDATE public.enrollments e
  SET status = 'inactive'
  FROM public.students s
  WHERE e.student_id = s.id
    AND (s.status = 'inactive' OR s.instrument LIKE '%// INELIGIBLE:%')
    AND e.status = 'active';

  -- 3. Delete orphaned class_students where class or student no longer exists
  DELETE FROM public.class_students
  WHERE class_id NOT IN (SELECT id FROM public.classes)
     OR student_id NOT IN (SELECT id FROM public.students);

  -- 4. Delete orphaned choir registrations where student no longer exists
  DELETE FROM public.choir_registrations
  WHERE student_id NOT IN (SELECT id FROM public.students);

  -- 5. Deduplicate choir_rehearsals by date keeping the latest created/most complete
  DELETE FROM public.choir_rehearsals a
  USING public.choir_rehearsals b
  WHERE a.date = b.date
    AND a.created_at < b.created_at;

EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Indexes for high performance and fast query execution
CREATE INDEX IF NOT EXISTS idx_classes_date ON public.classes(date);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON public.class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON public.class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_choir_rehearsals_date ON public.choir_rehearsals(date);
CREATE INDEX IF NOT EXISTS idx_choir_registrations_student ON public.choir_registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status ON public.enrollments(student_id, status);

-- RPC function to allow Super Admins to securely reset user passwords directly
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
  -- 1. Check if the caller is authenticated and is a super_admin
  SELECT role INTO caller_role 
  FROM public.profiles 
  WHERE id = auth.uid()::text;

  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Admins podem redefinir senhas diretamente.');
  END IF;

  -- 2. Convert target_user_id text to uuid
  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID de usuário inválido.');
  END;

  -- 3. Update password in auth.users using crypt and gen_salt from pgcrypto (inherent to Supabase)
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf', 10))
  WHERE id = uuid_target;

  -- 4. Update the temp_password in profiles table so super admins can view/audit it if needed
  UPDATE public.profiles
  SET temp_password = new_password
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Senha redefinida diretamente com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- RPC: Bloquear ou Liberar acesso de usuário (SOMENTE SUPER ADMIN)
CREATE OR REPLACE FUNCTION public.admin_toggle_user_access(
  target_user_id text,
  target_access_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
BEGIN
  -- 1. Validar se o solicitante é super_admin
  SELECT role INTO caller_role 
  FROM public.profiles 
  WHERE id = auth.uid()::text;

  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Permissão negada. Apenas Super Administradores podem bloquear ou liberar o acesso de usuários.'
    );
  END IF;

  -- 2. Validar o parâmetro de status
  IF target_access_status NOT IN ('active', 'blocked') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Valor inválido. Utilize "active" ou "blocked".'
    );
  END IF;

  -- 3. Atualizar o registro em public.profiles
  UPDATE public.profiles
  SET access_status = target_access_status
  WHERE id = target_user_id;

  -- 4. Suspender ou reativar em auth.users para revogação nativa de token no Supabase Auth
  BEGIN
    uuid_target := target_user_id::uuid;
    IF target_access_status = 'blocked' THEN
      UPDATE auth.users 
      SET banned_until = '3000-01-01 00:00:00+00' 
      WHERE id = uuid_target;
    ELSE
      UPDATE auth.users 
      SET banned_until = NULL 
      WHERE id = uuid_target;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Status de acesso atualizado com sucesso.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_user_access(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_access(text, text) TO service_role;

-- RPC: Inativar ou Reativar status operacional de professor (SOMENTE SUPER ADMIN)
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
  -- 1. Validar se o solicitante é super_admin
  SELECT role INTO caller_role 
  FROM public.profiles 
  WHERE id = auth.uid()::text;

  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Permissão negada. Apenas Super Administradores podem inativar ou reativar professores.'
    );
  END IF;

  -- 2. Validar status
  IF target_status NOT IN ('active', 'inactive') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Status inválido. Utilize "active" ou "inactive".'
    );
  END IF;

  -- 3. Atualizar status na tabela teachers
  UPDATE public.teachers
  SET status = target_status
  WHERE id = target_teacher_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Status operacional do professor atualizado com sucesso.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_teacher_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_teacher_status(text, text) TO service_role;

-- ==========================================
-- 7. CHOIR MONTHLY CLOSINGS & AUDITABLE SNAPSHOTS (FASE 2)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.choir_monthly_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competence VARCHAR(7) NOT NULL CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_current BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  total_rehearsals_count INT NOT NULL DEFAULT 0 CHECK (total_rehearsals_count >= 0),
  total_payouts NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_payouts >= 0),
  rehearsals_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by UUID,
  closed_by_name TEXT NOT NULL,
  reopened_at TIMESTAMPTZ,
  reopened_by UUID,
  reopened_by_name TEXT,
  reopen_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_choir_closings_competence_version UNIQUE (competence, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_choir_closings_current_competence 
  ON public.choir_monthly_closings (competence) 
  WHERE (is_current = true);

CREATE TABLE IF NOT EXISTS public.choir_monthly_closing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id UUID NOT NULL REFERENCES public.choir_monthly_closings(id) ON DELETE RESTRICT,
  collaborator_id UUID NOT NULL,
  collaborator_name_snapshot TEXT NOT NULL,
  collaborator_role_snapshot TEXT NOT NULL,
  remuneration_type_snapshot VARCHAR(30) NOT NULL,
  remuneration_value_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  present_count INT NOT NULL DEFAULT 0 CHECK (present_count >= 0),
  absent_count INT NOT NULL DEFAULT 0 CHECK (absent_count >= 0),
  amount_due NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (amount_due >= 0),
  calculation_rule_snapshot TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_choir_closing_collaborator UNIQUE (closing_id, collaborator_id)
);

ALTER TABLE public.choir_monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_monthly_closing_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "choir_monthly_closings_select" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_select"
  ON public.choir_monthly_closings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()::text
        AND p.role IN ('super_admin', 'admin', 'teacher')
    )
  );

DROP POLICY IF EXISTS "choir_monthly_closings_insert" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_insert"
  ON public.choir_monthly_closings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()::text
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "choir_monthly_closings_update" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_update"
  ON public.choir_monthly_closings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()::text
        AND p.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()::text
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "choir_monthly_closings_delete" ON public.choir_monthly_closings;
CREATE POLICY "choir_monthly_closings_delete"
  ON public.choir_monthly_closings
  FOR DELETE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "choir_monthly_closing_items_select" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_select"
  ON public.choir_monthly_closing_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()::text
        AND p.role IN ('super_admin', 'admin', 'teacher')
    )
  );

DROP POLICY IF EXISTS "choir_monthly_closing_items_insert" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_insert"
  ON public.choir_monthly_closing_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()::text
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "choir_monthly_closing_items_update" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_update"
  ON public.choir_monthly_closing_items
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "choir_monthly_closing_items_delete" ON public.choir_monthly_closing_items;
CREATE POLICY "choir_monthly_closing_items_delete"
  ON public.choir_monthly_closing_items
  FOR DELETE
  TO authenticated
  USING (false);

-- RPC: close_choir_monthly_competence
CREATE OR REPLACE FUNCTION public.close_choir_monthly_competence(
  p_competence VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role TEXT;
  v_user_name TEXT;
  v_current_closing RECORD;
  v_new_version INT := 1;
  v_new_closing_id UUID;
  v_start_date TEXT;
  v_next_month_date TEXT;
  v_rehearsals_snapshot JSONB := '[]'::jsonb;
  v_total_rehearsals INT := 0;
  v_total_payouts NUMERIC(10,2) := 0.00;
  v_collab RECORD;
  v_present_count INT;
  v_absent_count INT;
  v_amount_due NUMERIC(10,2);
  v_calc_rule TEXT;
BEGIN
  -- 1. Validação de Formato da Competência
  IF p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Formato de competência inválido: %. Esperado YYYY-MM.', p_competence;
  END IF;

  -- 2. Validação de Autorização
  SELECT role, COALESCE(email, 'Administrador')
  INTO v_user_role, v_user_name
  FROM public.profiles
  WHERE id = auth.uid()::text;

  IF v_user_role IS NULL OR v_user_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar o fechamento mensal.';
  END IF;

  -- 3. Lock Transacional por Competência
  PERFORM pg_advisory_xact_lock(hashtext('CHOIR_COMPETENCE_' || p_competence));

  -- 4. Validação de Estado Atual da Competência e Versionamento
  SELECT id, version, status
  INTO v_current_closing
  FROM public.choir_monthly_closings
  WHERE competence = p_competence AND is_current = true;

  IF FOUND THEN
    IF v_current_closing.status = 'closed' THEN
      RAISE EXCEPTION 'A competência % já possui fechamento ativo (versão %). É necessário reabrir antes de gerar um novo fechamento.', p_competence, v_current_closing.version;
    ELSIF v_current_closing.status = 'reopened' THEN
      UPDATE public.choir_monthly_closings
      SET is_current = false
      WHERE id = v_current_closing.id;

      v_new_version := v_current_closing.version + 1;
    END IF;
  ELSE
    SELECT COALESCE(MAX(version), 0) + 1
    INTO v_new_version
    FROM public.choir_monthly_closings
    WHERE competence = p_competence;
  END IF;

  -- 5. Limites do Mês
  v_start_date := p_competence || '-01';
  v_next_month_date := to_char((to_date(v_start_date, 'YYYY-MM-DD') + interval '1 month'), 'YYYY-MM-DD');

  -- 6. Snapshot dos Ensaios do Mês
  SELECT 
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'date', r.date,
          'time', r.time,
          'title', r.title,
          'notes', r.notes
        ) ORDER BY r.date ASC
      ),
      '[]'::jsonb
    ),
    COUNT(*)
  INTO v_rehearsals_snapshot, v_total_rehearsals
  FROM public.choir_rehearsals r
  WHERE r.date >= v_start_date AND r.date < v_next_month_date;

  -- 7. Criar Cabeçalho do Fechamento
  INSERT INTO public.choir_monthly_closings (
    competence,
    version,
    is_current,
    status,
    total_rehearsals_count,
    total_payouts,
    rehearsals_snapshot,
    closed_at,
    closed_by,
    closed_by_name
  ) VALUES (
    p_competence,
    v_new_version,
    true,
    'closed',
    v_total_rehearsals,
    0.00,
    v_rehearsals_snapshot,
    now(),
    auth.uid(),
    v_user_name
  )
  RETURNING id INTO v_new_closing_id;

  -- 8. Iterar sobre Colaboradores Canônicos Ativos
  FOR v_collab IN
    SELECT DISTINCT ON (COALESCE(NULLIF(LOWER(TRIM(email)), ''), id::text))
      id,
      name,
      role,
      remuneration_type,
      remuneration_value
    FROM public.choir_collaborators
    WHERE COALESCE(remuneration_value, 0) > 0
    ORDER BY COALESCE(NULLIF(LOWER(TRIM(email)), ''), id::text), created_at DESC
  LOOP
    -- Presenças e Faltas (COUNT DISTINCT r.id)
    SELECT 
      COUNT(DISTINCT r.id) FILTER (
        WHERE att.elem->>'type' = 'collaborator' 
          AND att.elem->>'status' = 'present'
      ),
      COUNT(DISTINCT r.id) FILTER (
        WHERE att.elem->>'type' = 'collaborator' 
          AND att.elem->>'status' = 'absent'
      )
    INTO v_present_count, v_absent_count
    FROM public.choir_rehearsals r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE 
        WHEN r.attendance IS NOT NULL AND trim(r.attendance) != '' AND jsonb_typeof(r.attendance::jsonb) = 'array' 
        THEN r.attendance::jsonb
        ELSE '[]'::jsonb
      END
    ) AS att(elem)
    WHERE r.date >= v_start_date 
      AND r.date < v_next_month_date
      AND att.elem->>'person_id' = v_collab.id::text;

    v_present_count := COALESCE(v_present_count, 0);
    v_absent_count := COALESCE(v_absent_count, 0);

    -- Valor Devido
    v_amount_due := ROUND(v_present_count * COALESCE(v_collab.remuneration_value, 0.00), 2);
    v_calc_rule := v_present_count || ' presença(s) x R$ ' || to_char(COALESCE(v_collab.remuneration_value, 0.00), 'FM999G990D00') || ' por ensaio';

    -- Inserir Snapshot do Item
    INSERT INTO public.choir_monthly_closing_items (
      closing_id,
      collaborator_id,
      collaborator_name_snapshot,
      collaborator_role_snapshot,
      remuneration_type_snapshot,
      remuneration_value_snapshot,
      present_count,
      absent_count,
      amount_due,
      calculation_rule_snapshot
    ) VALUES (
      v_new_closing_id,
      v_collab.id,
      trim(v_collab.name),
      COALESCE(v_collab.role, 'Assistente de Naipe'),
      COALESCE(v_collab.remuneration_type, 'per_rehearsal'),
      COALESCE(v_collab.remuneration_value, 0.00),
      v_present_count,
      v_absent_count,
      v_amount_due,
      v_calc_rule
    );

    v_total_payouts := v_total_payouts + v_amount_due;
  END LOOP;

  -- 9. Atualizar Total Consolidado
  UPDATE public.choir_monthly_closings
  SET total_payouts = v_total_payouts
  WHERE id = v_new_closing_id;

  RETURN jsonb_build_object(
    'success', true,
    'closing_id', v_new_closing_id,
    'competence', p_competence,
    'version', v_new_version,
    'total_rehearsals', v_total_rehearsals,
    'total_payouts', v_total_payouts
  );
END;
$$;

-- RPC: reopen_choir_monthly_competence
CREATE OR REPLACE FUNCTION public.reopen_choir_monthly_competence(
  p_closing_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_role TEXT;
  v_user_name TEXT;
  v_closing RECORD;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A justificativa de reabertura é obrigatória.';
  END IF;

  SELECT role, COALESCE(email, 'Administrador')
  INTO v_user_role, v_user_name
  FROM public.profiles
  WHERE id = auth.uid()::text;

  IF v_user_role IS NULL OR v_user_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem reabrir competências.';
  END IF;

  SELECT id, competence, version, status, is_current
  INTO v_closing
  FROM public.choir_monthly_closings
  WHERE id = p_closing_id;

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
  SET 
    status = 'reopened',
    reopened_at = now(),
    reopened_by = auth.uid(),
    reopened_by_name = v_user_name,
    reopen_reason = trim(p_reason)
  WHERE id = p_closing_id;

  RETURN jsonb_build_object(
    'success', true,
    'closing_id', p_closing_id,
    'competence', v_closing.competence,
    'version', v_closing.version,
    'status', 'reopened'
  );
END;
$$;

-- ==========================================
-- 8. MÓDULO DE AFILIADOS E INDICAÇÕES
-- ==========================================

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

ALTER TABLE IF EXISTS public.enrollments 
ADD COLUMN IF NOT EXISTS affiliate_id text REFERENCES public.affiliates(id) ON DELETE SET NULL;

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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competence varchar(7) NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  total_valid_referrals int NOT NULL DEFAULT 0,
  total_payout_amount numeric(10,2) NOT NULL DEFAULT 0.00,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_by_name text,
  reopened_at timestamptz,
  reopen_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliate_closing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.affiliate_monthly_closings(id) ON DELETE CASCADE,
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

-- ==========================================
-- 21. COMPETENCE BILLINGS (FINANCIAL SNAPSHOT)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.competence_billings (
  id text PRIMARY KEY,
  competence varchar(7) NOT NULL,
  category text NOT NULL,
  enrollment_id text,
  choir_registration_id text,
  group_id text,
  student_id uuid,
  teacher_id uuid,
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

  CONSTRAINT chk_competence_billings_competence 
    CHECK (competence ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT chk_competence_billings_category 
    CHECK (category IN ('individual', 'group', 'choir')),
  CONSTRAINT chk_competence_billings_status 
    CHECK (status IN ('pending', 'paid', 'waived', 'closed')),
  CONSTRAINT chk_competence_billings_origin CHECK (
    (category = 'individual' AND enrollment_id IS NOT NULL AND group_id IS NULL AND choir_registration_id IS NULL) OR
    (category = 'group' AND group_id IS NOT NULL AND enrollment_id IS NULL AND choir_registration_id IS NULL) OR
    (category = 'choir' AND choir_registration_id IS NOT NULL AND enrollment_id IS NULL AND group_id IS NULL)
  ),

  CONSTRAINT fk_competence_billings_enrollment 
    FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_choir_registration 
    FOREIGN KEY (choir_registration_id) REFERENCES public.choir_registrations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_group 
    FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_student 
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_teacher 
    FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_competence_billings_transaction 
    FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL,
  CONSTRAINT fk_competence_billings_frozen_by 
    FOREIGN KEY (frozen_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ==============================================================================
-- Google Calendar Integration (Unidirectional: Platform -> Google Calendar)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.teacher_google_accounts (
  teacher_id text PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  refresh_token text NOT NULL,
  access_token text,
  token_expires_at timestamptz,
  connection_status text NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected', 'disconnected', 'error')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.class_google_events (
  platform_class_id text PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id text REFERENCES public.teachers(id) ON DELETE SET NULL,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  google_event_id text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed')),
  last_error text
);

-- ==============================================================================
-- Credits by Cancellation (public.credits)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.credits (
  id text PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
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
ON public.credits(source_class_id) 
WHERE source_class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credits_teacher_id ON public.credits(teacher_id);
CREATE INDEX IF NOT EXISTS idx_credits_status ON public.credits(status);
CREATE INDEX IF NOT EXISTS idx_credits_competency_month ON public.credits(competency_month);
CREATE INDEX IF NOT EXISTS idx_credits_student_id ON public.credits(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credits_group_id ON public.credits(group_id) WHERE group_id IS NOT NULL;

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to credits" ON public.credits;
CREATE POLICY "Admins full access to credits" ON public.credits
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE (id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE (id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can read their credits" ON public.credits;
CREATE POLICY "Teachers can read their credits" ON public.credits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE (id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND role = 'teacher'
        AND teacher_id = credits.teacher_id::text
    )
  );


