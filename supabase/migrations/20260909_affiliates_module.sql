-- ==============================================================================
-- MIGRATION: Módulo de Afiliados e Indicações (Esqueleto Funcional Isolado)
-- Data: 2026-09-09
-- ==============================================================================

-- 1. Tabela de Afiliados
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

-- 2. Coluna opcional de afiliado na tabela de matrículas existentes (relacionamento estruturado)
ALTER TABLE IF EXISTS public.enrollments 
ADD COLUMN IF NOT EXISTS affiliate_id text REFERENCES public.affiliates(id) ON DELETE SET NULL;

-- 3. Tabela de Registro de Indicações
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
  conversion_competence varchar(7), -- Formato: YYYY-MM
  first_transaction_id text REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trava de Unicidade Anti-Duplicidade:
-- Um mesmo aluno NÃO pode ser convertido mais de uma vez em nenhuma indicação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_referrals_unique_converted_student 
ON public.affiliate_referrals(student_id) 
WHERE status = 'converted' AND student_id IS NOT NULL;

-- Índice para busca por afiliado e competência
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_comp 
ON public.affiliate_referrals(affiliate_id, conversion_competence, status);

-- 4. Tabela Configurável de Regras de Comissão
CREATE TABLE IF NOT EXISTS public.affiliate_commission_rules (
  id text PRIMARY KEY,
  tier_quantity int NOT NULL UNIQUE,
  total_commission_amount numeric(10,2), -- NULL se regra não estiver definida
  is_defined boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- População das 10 faixas oficiais e registro explícito de faixa não definida acima de 10
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

-- 5. Estrutura de Fechamento de Competência (Base para fechamento futuro)
CREATE TABLE IF NOT EXISTS public.affiliate_monthly_closings (
  id text PRIMARY KEY,
  competence varchar(7) NOT NULL, -- Ex: '2026-09'
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

-- 6. Itens do Fechamento Mensal (Snapshot Imutável por Afiliado)
CREATE TABLE IF NOT EXISTS public.affiliate_closing_items (
  id text PRIMARY KEY,
  closing_id text NOT NULL REFERENCES public.affiliate_monthly_closings(id) ON DELETE CASCADE,
  affiliate_id text NOT NULL REFERENCES public.affiliates(id),
  affiliate_name_snapshot text NOT NULL,
  affiliate_pix_snapshot text,
  valid_referrals_count int NOT NULL DEFAULT 0,
  tier_applied text NOT NULL,
  amount_due numeric(10,2), -- NULL se regra acima de 10 pendente
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
-- ROW LEVEL SECURITY (RLS) & PERMISSÕES
-- ==============================================================================

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_closing_items ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso: Apenas administradores e super administradores podem gerenciar
DROP POLICY IF EXISTS "Admins full access to affiliates" ON public.affiliates;
CREATE POLICY "Admins full access to affiliates" ON public.affiliates
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

DROP POLICY IF EXISTS "Admins full access to affiliate_referrals" ON public.affiliate_referrals;
CREATE POLICY "Admins full access to affiliate_referrals" ON public.affiliate_referrals
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

DROP POLICY IF EXISTS "Admins full access to affiliate_commission_rules" ON public.affiliate_commission_rules;
CREATE POLICY "Admins full access to affiliate_commission_rules" ON public.affiliate_commission_rules
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

DROP POLICY IF EXISTS "Admins full access to affiliate_monthly_closings" ON public.affiliate_monthly_closings;
CREATE POLICY "Admins full access to affiliate_monthly_closings" ON public.affiliate_monthly_closings
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

DROP POLICY IF EXISTS "Admins full access to affiliate_closing_items" ON public.affiliate_closing_items;
CREATE POLICY "Admins full access to affiliate_closing_items" ON public.affiliate_closing_items
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
