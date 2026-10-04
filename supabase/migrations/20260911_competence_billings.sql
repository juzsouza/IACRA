-- ==============================================================================
-- MIGRATION: Snapshot Financeiro por Competência (competence_billings)
-- Data: 2026-09-11
-- Etapa 1: Somente Estrutura DDL (Tabela, Constraints, FKs, Índices e RLS)
-- STATUS: NÃO EXECUTADO (Aguardando aprovação do usuário)
-- ==============================================================================

-- 1. Criação da Tabela competence_billings
CREATE TABLE IF NOT EXISTS public.competence_billings (
  -- Identificador Primário
  id text PRIMARY KEY,

  -- Competência no formato YYYY-MM
  competence varchar(7) NOT NULL,

  -- Categoria do faturamento: 'individual', 'group' ou 'choir'
  category text NOT NULL,

  -- Origens (Exatamente UMA deve estar preenchida conforme a category)
  enrollment_id text,
  choir_registration_id text,
  group_id text,

  -- Entidades Relacionadas
  student_id uuid,
  teacher_id uuid, -- NOTA: No banco real, teachers.id é UUID (validado empiricamente). Se mantido como text, não aceita FK para teachers(id).

  -- Informações Financeiras Base
  is_paying boolean NOT NULL DEFAULT true,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  final_price numeric(10,2) NOT NULL DEFAULT 0,

  -- Divisão Pedagógica (Professor / Escola)
  teacher_fee_type text,
  teacher_fee_value numeric(10,2),
  teacher_share numeric(10,2) NOT NULL DEFAULT 0,
  school_share numeric(10,2) NOT NULL DEFAULT 0,

  -- Status do Faturamento: 'pending', 'paid', 'waived' ou 'closed'
  status text NOT NULL,

  -- Vínculo com Pagamento Efetuado (se houver)
  transaction_id text,

  -- Congelamento de Snapshot (Auditoria & Imutabilidade)
  is_frozen boolean NOT NULL DEFAULT false,
  frozen_at timestamptz,
  frozen_by text,

  -- Memória de Cálculo / Dados Adicionais Isolados (Raphael, Coral, etc.)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Auditoria de Criação
  created_at timestamptz NOT NULL DEFAULT now(),

  -- ============================================================================
  -- CHECK CONSTRAINTS DE DOMÍNIO
  -- ============================================================================

  -- Formato da Competência: YYYY-MM
  CONSTRAINT chk_competence_billings_competence 
    CHECK (competence ~ '^[0-9]{4}-[0-9]{2}$'),

  -- Categorias Permitidas
  CONSTRAINT chk_competence_billings_category 
    CHECK (category IN ('individual', 'group', 'choir')),

  -- Status Permitidos
  CONSTRAINT chk_competence_billings_status 
    CHECK (status IN ('pending', 'paid', 'waived', 'closed')),

  -- Integridade Estrita da Origem (Exatamente uma origem preenchida por categoria)
  CONSTRAINT chk_competence_billings_origin CHECK (
    (category = 'individual' AND enrollment_id IS NOT NULL AND group_id IS NULL AND choir_registration_id IS NULL) OR
    (category = 'group' AND group_id IS NOT NULL AND enrollment_id IS NULL AND choir_registration_id IS NULL) OR
    (category = 'choir' AND choir_registration_id IS NOT NULL AND enrollment_id IS NULL AND group_id IS NULL)
  ),

  -- ============================================================================
  -- FOREIGN KEYS (PROTEÇÃO DE HISTÓRICO - SEM CASCADE DESTRUTIVO)
  -- ============================================================================

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

-- ============================================================================
-- 2. REGRAS DE UNICIDADE (ANTI-DUPLICIDADE POR COMPETÊNCIA)
-- ============================================================================
-- Utilizam índices únicos parciais no PostgreSQL para garantir tratamento perfeito
-- de valores NULL, evitando faturamentos duplicados da mesma entidade na mesma competência.

CREATE UNIQUE INDEX IF NOT EXISTS idx_competence_billings_uniq_enrollment 
  ON public.competence_billings(competence, enrollment_id) 
  WHERE enrollment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_competence_billings_uniq_choir 
  ON public.competence_billings(competence, choir_registration_id) 
  WHERE choir_registration_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_competence_billings_uniq_group 
  ON public.competence_billings(competence, group_id) 
  WHERE group_id IS NOT NULL;

-- ============================================================================
-- 3. ÍNDICES DE PERFORMANCE E CONSULTA
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_competence_billings_competence 
  ON public.competence_billings(competence);

CREATE INDEX IF NOT EXISTS idx_competence_billings_category 
  ON public.competence_billings(category);

CREATE INDEX IF NOT EXISTS idx_competence_billings_status 
  ON public.competence_billings(status);

CREATE INDEX IF NOT EXISTS idx_competence_billings_student_id 
  ON public.competence_billings(student_id) 
  WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competence_billings_teacher_id 
  ON public.competence_billings(teacher_id) 
  WHERE teacher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competence_billings_transaction_id 
  ON public.competence_billings(transaction_id) 
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competence_billings_frozen 
  ON public.competence_billings(competence, is_frozen);

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.competence_billings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to competence_billings" ON public.competence_billings;
CREATE POLICY "Admins full access to competence_billings" ON public.competence_billings
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
