-- ==============================================================================
-- MIGRATION: Controle e Persistência de Créditos por Cancelamento (public.credits)
-- Data: 2026-09-24
-- ==============================================================================

-- 1. Criação da Tabela public.credits
-- Tipos rigorosamente alinhados com o schema real auditado:
-- teachers.id -> UUID
-- students.id -> UUID
-- enrollments.id -> TEXT
-- groups.id -> TEXT
-- classes.id -> TEXT
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

  -- Formato estrito da competência: YYYY-MM
  CONSTRAINT chk_credits_competency_month CHECK (competency_month ~ '^[0-9]{4}-[0-9]{2}$')
);

-- 2. Proteção Anti-Duplicidade (Unicidade Canônica da Aula de Origem)
-- Garante que uma aula cancelada só possa originar no máximo UM crédito
CREATE UNIQUE INDEX IF NOT EXISTS idx_credits_unique_source_class 
ON public.credits(source_class_id) 
WHERE source_class_id IS NOT NULL;

-- 3. Índices de Consulta e Performance
CREATE INDEX IF NOT EXISTS idx_credits_teacher_id ON public.credits(teacher_id);
CREATE INDEX IF NOT EXISTS idx_credits_status ON public.credits(status);
CREATE INDEX IF NOT EXISTS idx_credits_competency_month ON public.credits(competency_month);
CREATE INDEX IF NOT EXISTS idx_credits_student_id ON public.credits(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credits_group_id ON public.credits(group_id) WHERE group_id IS NOT NULL;

-- 4. Políticas de Segurança (Row Level Security - RLS)
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

-- Admins e Super Admins: Acesso Completo (SELECT, INSERT, UPDATE, DELETE)
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

-- Professores: Leitura somente dos seus próprios créditos vinculados
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
