-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Base tables
CREATE TABLE IF NOT EXISTS public.students (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  instrument text,
  status text CHECK (status IN ('active', 'inactive')),
  enrollment_date date,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  specialties text[],
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  title text NOT NULL,
  teacher_id uuid REFERENCES public.teachers(id),
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.class_students (
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  type text CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL,
  description text NOT NULL,
  date date NOT NULL,
  status text CHECK (status IN ('pending', 'completed')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  schedule text,
  max_students integer,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1. financial_plans
CREATE TABLE IF NOT EXISTS public.financial_plans (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('individual', 'group', 'coral', 'mentoria', 'mev', 'personalizado')),
  modality text NOT NULL CHECK (modality IN ('semanal', 'quinzenal', 'avulso', 'mensal', 'personalizado')),
  base_price numeric NOT NULL,
  duration_minutes integer NOT NULL,
  max_students integer NOT NULL,
  is_active boolean DEFAULT true,
  exclusive_teacher_id uuid REFERENCES public.teachers(id),
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

-- 2. financial_discount_rules
CREATE TABLE IF NOT EXISTS public.financial_discount_rules (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  trigger_plan_id uuid REFERENCES public.financial_plans(id),
  target_plan_id uuid REFERENCES public.financial_plans(id),
  discount_value numeric NOT NULL,
  applies_to text NOT NULL CHECK (applies_to IN ('school_share', 'total_price')),
  start_date date,
  end_date date,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. choir_voice_types
CREATE TABLE IF NOT EXISTS public.choir_voice_types (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL CHECK (name IN ('Soprano', 'Contralto', 'Tenor', 'Barítono')),
  max_slots integer NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. choir_registrations
CREATE TABLE IF NOT EXISTS public.choir_registrations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id uuid REFERENCES public.students(id),
  voice_type_id uuid REFERENCES public.choir_voice_types(id),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  monthly_fee numeric NOT NULL,
  is_internal_student boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. teacher_choir_payments
CREATE TABLE IF NOT EXISTS public.teacher_choir_payments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  teacher_id uuid REFERENCES public.teachers(id),
  role text NOT NULL CHECK (role IN ('regente', 'pianista_fixo', 'preparador')),
  payment_type text NOT NULL CHECK (payment_type IN ('free', 'hourly', 'per_rehearsal')),
  payment_value numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. academic_calendar
CREATE TABLE IF NOT EXISTS public.academic_calendar (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('holiday', 'recess', 'return', 'end')),
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert initial data for choir_voice_types
INSERT INTO public.choir_voice_types (name, max_slots) VALUES
('Soprano', 25),
('Contralto', 20),
('Tenor', 15),
('Barítono', 10)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_voice_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choir_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_choir_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for authenticated users)
CREATE POLICY "Allow all for authenticated" ON public.financial_plans FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.financial_discount_rules FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.choir_voice_types FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.choir_registrations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.teacher_choir_payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.academic_calendar FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.students FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.teachers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.classes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.class_students FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.transactions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON public.groups FOR ALL USING (auth.role() = 'authenticated');
