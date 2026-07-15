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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Classes
CREATE TABLE IF NOT EXISTS public.classes (
  id text PRIMARY KEY,
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
-- 4. ROW LEVEL SECURITY (RLS) & POLICIES
-- ==========================================

-- Enable RLS on all tables if they exist
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
ALTER TABLE IF EXISTS public.academic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for authenticated users)
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.students;
CREATE POLICY "Allow all for authenticated" ON public.students FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.teachers;
CREATE POLICY "Allow all for authenticated" ON public.teachers FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.classes;
CREATE POLICY "Allow all for authenticated" ON public.classes FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.enrollments;
CREATE POLICY "Allow all for authenticated" ON public.enrollments FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.class_students;
CREATE POLICY "Allow all for authenticated" ON public.class_students FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.transactions;
CREATE POLICY "Allow all for authenticated" ON public.transactions FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.groups;
CREATE POLICY "Allow all for authenticated" ON public.groups FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.financial_plans;
CREATE POLICY "Allow all for authenticated" ON public.financial_plans FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.financial_discount_rules;
CREATE POLICY "Allow all for authenticated" ON public.financial_discount_rules FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.choir_voice_types;
CREATE POLICY "Allow all for authenticated" ON public.choir_voice_types FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.choir_registrations;
CREATE POLICY "Allow all for authenticated" ON public.choir_registrations FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.teacher_choir_payments;
CREATE POLICY "Allow all for authenticated" ON public.teacher_choir_payments FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.academic_calendar;
CREATE POLICY "Allow all for authenticated" ON public.academic_calendar FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated on prospects" ON public.prospects;
CREATE POLICY "Allow all for authenticated on prospects" ON public.prospects FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow all for authenticated on profiles" ON public.profiles;
CREATE POLICY "Allow all for authenticated on profiles" ON public.profiles FOR ALL USING (auth.role() = 'authenticated');


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

-- Migration to add CPF columns to existing tables
ALTER TABLE IF EXISTS public.students ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE IF EXISTS public.teachers ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE IF EXISTS public.teachers ADD COLUMN IF NOT EXISTS schedule jsonb;

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
