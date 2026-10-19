-- ==============================================================================
-- MIGRAÇÃO (RASCUNHO PARA REVISÃO — NÃO EXECUTAR NEM APLICAR NESTA FASE)
-- Módulo Matrícula Digital / Termos de Matrícula (Fase 1 — Estrutura)
-- Data: 2026-10-19
-- Branch: bolt-migration-test
-- ------------------------------------------------------------------------------
-- NOTA DE FLUXO
--   Este arquivo está em docs/digital-enrollment/ para revisão segura. Ele NÃO
--   está em supabase/migrations/ porque, neste ambiente, arquivos nesse
--   diretório não são observados (nada os aplica automaticamente), e a única
--   forma de aplicar schema seria via mcp__supabase__apply_migration, que
--   executaria SQL no banco remoto — explicitamente proibido nesta fase.
--   Quando aprovado, o conteúdo deverá ser aplicado como uma migração única
--   via mcp__supabase__apply_migration (com o mesmo filename) na fase seguinte.
-- ------------------------------------------------------------------------------
-- OBJETIVO
--   Preparar a estrutura de banco para o módulo de Matrícula Digital do EAVRA,
--   contemplando: catálogo de modelos contratuais, versões imutáveis de termos
--   com hash SHA-256, links individuais com token armazenado como hash,
--   expiração, revogação e controle de uso, solicitações públicas de matrícula
--   (sem endereço residencial) e registros imutáveis de aceite vinculados à
--   versão exata do termo, com auditoria (IP e User-Agent quando capturados
--   pelo servidor) e estados de revisão administrativa (aprovação/rejeição).
--
-- PRINCÍPIOS
--   * Somente aditivo: não apaga, renomeia nem altera tabelas/colunas existentes.
--   * Não toca em prospects.term_signed nem prospects.approved (preservados).
--   * Não duplica dados já existentes em students/prospects/enrollments; a
--     solicitação pública armazena apenas o payload enviado no preenchimento e,
--     após conversão, referencia o student/prospect/enrollment criado.
--   * Chaves primárias existentes são `text` (students, teachers, prospects,
--     enrollments, groups, financial_plans, affiliates, profiles). As novas
--     tabelas usam uuid DEFAULT gen_random_uuid(). As FKs para tabelas
--     existentes usam `text` para compatibilidade.
--   * RLS ativada em todas as novas tabelas. Nenhuma política pública é
--     concedida para tokens, solicitações ou aceites. O acesso público futuro
--     será intermediado por uma Edge Function com service role (bypassa RLS)
--     que validará o link e gravará aceite/solicitação de forma controlada.
--   * Versões publicadas de termos e registros de aceite são imutáveis por
--     trigger.
--
-- NOVAS TABELAS
--   1. enrollment_contract_models  — catálogo dos 4 modelos contratuais
--   2. term_versions               — versões numeradas imutáveis (hash SHA-256)
--   3. enrollment_links            — links individuais (token hash, expiração, uso)
--   4. public_enrollment_requests  — solicitações públicas (aluno + responsável)
--   5. term_acceptances            — aceite imutável vinculado à versão exata
--
-- SEGURANÇA
--   * RLS habilitada em todas as novas tabelas.
--   * Políticas separadas por verbo (SELECT/INSERT/UPDATE/DELETE), restritas a
--     super_admin/admin via checagem inline contra public.profiles (mesmo padrão
--     já usado no módulo de afiliados).
--   * Nenhuma política para anon: o acesso público será via Edge Function.
--
-- OBSERVAÇÕES
--   * Não inclui dados pessoais reais, senhas, tokens em claro nem chaves de API.
--   * Não cria telas, formulários, Edge Functions ou integrações (Fases 2+).
--   * Não altera package.json, App.tsx, store.tsx, .env ou arquivos de produção.
-- ==============================================================================

-- Extensões necessárias (idempotente)
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- digest() para SHA-256 e gen_random_uuid()

-- ==============================================================================
-- 1. CATÁLOGO DE MODELOS CONTRATUAIS
-- ==============================================================================
-- Catálogo fixo dos quatro modelos de matrícula do EAVRA. A coluna `id` é o
-- identificador canônico do modelo, usado como FK pelas demais tabelas.

CREATE TABLE IF NOT EXISTS public.enrollment_contract_models (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_contract_models_id_chk
    CHECK (id IN (
      'individual_instruments_vocal',
      'raphael_individual',
      'institutional_group',
      'mev_group'
    ))
);

-- População idempotente dos quatro modelos (preserva contratos/textos originais
-- que serão associados via term_versions nas fases seguintes; aqui só o catálogo).
INSERT INTO public.enrollment_contract_models (id, display_name, description)
VALUES
  ('individual_instruments_vocal',
   'Aulas Individuais — Instrumento e Técnica Vocal',
   'Modelo contratual para matrículas individuais de instrumento e técnica vocal.'),
  ('raphael_individual',
   'Atendimento Individual — Raphael Augusto',
   'Modelo contratual para atendimentos individuais vinculados ao professor Raphael Augusto.'),
  ('institutional_group',
   'Matrícula Institucional em Grupo',
   'Modelo contratual para matrículas institucionais em grupo (escolas, projetos, parcerias).'),
  ('mev_group',
   'Musicalização Espaço Vivo (MEV) — Grupo',
   'Modelo contratual para matrículas em grupo no programa de Musicalização Espaço Vivo.')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 2. VERSÕES DE TERMOS (IMUTÁVEIS QUANDO PUBLICADAS)
-- ==============================================================================
-- Cada versão pertence a um modelo contratual, é numerada sequencialmente por
-- modelo e armazena o conteúdo INTEGRAL do termo. O hash SHA-256 do conteúdo é
-- calculado por trigger. Uma vez `published`, a linha não pode mais ter
-- conteúdo/título/número/modelo alterados nem ser excluída (imutabilidade por
-- trigger); apenas a transição published -> archived é permitida.

CREATE TABLE IF NOT EXISTS public.term_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_model_id text NOT NULL
    REFERENCES public.enrollment_contract_models(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,                 -- conteúdo integral do termo/contrato
  content_sha256 text NOT NULL,       -- hex(sha256(body)) — calculado por trigger
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  published_by text,                  -- id do profile admin que publicou
  created_by text,                    -- id do profile admin que criou
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma versão por (modelo, número). Garante sequência única por modelo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_versions_model_number
  ON public.term_versions (contract_model_id, version_number);

-- Hash único por conteúdo publicado dentro de um modelo (evita republicar o
-- mesmo texto como uma nova versão disfarçada).
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_versions_published_hash
  ON public.term_versions (contract_model_id, content_sha256)
  WHERE status = 'published';

-- Apenas uma versão published vigente por modelo (índice parcial único).
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_versions_single_published_per_model
  ON public.term_versions (contract_model_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_term_versions_model_status
  ON public.term_versions (contract_model_id, status);

-- Trigger: calcular hash SHA-256 do corpo antes de INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.set_term_version_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.body IS NULL THEN
    RAISE EXCEPTION 'term_versions.body não pode ser nulo';
  END IF;
  NEW.content_sha256 := encode(digest(NEW.body, 'sha256'), 'hex');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_versions_set_hash ON public.term_versions;
CREATE TRIGGER trg_term_versions_set_hash
  BEFORE INSERT OR UPDATE OF body ON public.term_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_term_version_hash();

-- Trigger: imutabilidade de versões publicadas.
CREATE OR REPLACE FUNCTION public.enforce_term_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'Versão de termo publicada (id=%) é imutável e não pode ser excluída.', OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    -- Permite apenas a transição published -> archived (desativação da vigência),
    -- sem tocar no conteúdo. Qualquer alteração de corpo/título/hash é proibida.
    IF NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 THEN
      RAISE EXCEPTION 'Versão de termo publicada (id=%) é imutável: conteúdo não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      RAISE EXCEPTION 'Versão de termo publicada (id=%) é imutável: corpo não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      RAISE EXCEPTION 'Versão de termo publicada (id=%) é imutável: título não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.version_number IS DISTINCT FROM OLD.version_number THEN
      RAISE EXCEPTION 'Versão de termo publicada (id=%) é imutável: número não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.contract_model_id IS DISTINCT FROM OLD.contract_model_id THEN
      RAISE EXCEPTION 'Versão de termo publicada (id=%) é imutável: modelo não pode ser alterado.', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_versions_immutability ON public.term_versions;
CREATE TRIGGER trg_term_versions_immutability
  BEFORE UPDATE OR DELETE ON public.term_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_term_version_immutability();

-- Trigger: ao publicar (draft -> published), registrar published_at e impedir
-- reabertura de publicado para draft.
CREATE OR REPLACE FUNCTION public.guard_term_version_publish_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'draft' AND NEW.status = 'published' THEN
      IF NEW.published_at IS NULL THEN
        NEW.published_at := now();
      END IF;
    ELSIF OLD.status = 'published' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'Versão de termo publicada (id=%) não pode voltar para draft.', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_versions_publish_transition ON public.term_versions;
CREATE TRIGGER trg_term_versions_publish_transition
  BEFORE UPDATE OF status ON public.term_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_term_version_publish_transition();

-- ==============================================================================
-- 3. LINKS INDIVIDUAIS DE MATRÍCULA
-- ==============================================================================
-- Token armazenado apenas como hash SHA-256 (nunca em claro). O link associa-se
-- a uma versão contratual e aos dados comerciais definidos pelo administrador
-- (plano, professor, grupo, afiliado, preço/vencimento opcionais). Controle de
-- expiração, revogação e uso (max_uses / use_count).

CREATE TABLE IF NOT EXISTS public.enrollment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,                -- hex(sha256(token)) — UNIQUE
  contract_model_id text NOT NULL
    REFERENCES public.enrollment_contract_models(id) ON DELETE RESTRICT,
  term_version_id uuid NOT NULL
    REFERENCES public.term_versions(id) ON DELETE RESTRICT,
  -- Dados comerciais opcionais pré-definidos pelo admin:
  plan_id text
    REFERENCES public.financial_plans(id) ON DELETE SET NULL,
  teacher_id text
    REFERENCES public.teachers(id) ON DELETE SET NULL,
  group_id text
    REFERENCES public.groups(id) ON DELETE SET NULL,
  affiliate_id text
    REFERENCES public.affiliates(id) ON DELETE SET NULL,
  custom_price numeric(10,2),
  due_date_day integer
    CHECK (due_date_day IS NULL OR (due_date_day BETWEEN 1 AND 28)),
  -- Controle de vida útil e uso:
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,                          -- id do profile admin
  revoke_reason text,
  max_uses integer NOT NULL DEFAULT 1
    CHECK (max_uses >= 1),
  use_count integer NOT NULL DEFAULT 0
    CHECK (use_count >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'consumed', 'expired', 'revoked')),
  notes text,
  created_by text,                          -- id do profile admin
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_links_use_count_le_max
    CHECK (use_count <= max_uses)
);

-- Token hash único (evita links duplicados / colisão de tokens).
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_links_token_hash
  ON public.enrollment_links (token_hash);

CREATE INDEX IF NOT EXISTS idx_enrollment_links_model_status
  ON public.enrollment_links (contract_model_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollment_links_term_version
  ON public.enrollment_links (term_version_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_links_expires
  ON public.enrollment_links (expires_at) WHERE expires_at IS NOT NULL;

-- Trigger: manter `status` consistente com revoked_at / use_count.
-- (A expiração por tempo é avaliada em runtime pela Edge Function; o status
-- refletido aqui cobre revogação e consumo imediatos.)
CREATE OR REPLACE FUNCTION public.sync_enrollment_link_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.revoked_at IS NOT NULL THEN
    NEW.status := 'revoked';
  ELSIF NEW.use_count >= NEW.max_uses THEN
    NEW.status := 'consumed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_links_sync_status ON public.enrollment_links;
CREATE TRIGGER trg_enrollment_links_sync_status
  BEFORE INSERT OR UPDATE ON public.enrollment_links
  FOR EACH ROW EXECUTE FUNCTION public.sync_enrollment_link_status();

-- ==============================================================================
-- 4. SOLICITAÇÕES PÚBLICAS DE MATRÍCULA
-- ==============================================================================
-- Submissão pública via link. Não inclui endereço residencial. Armazena os
-- dados do aluno e, quando necessário, do responsável legal. Após aprovação,
-- converte em student/enrollment (referenciados por resolved_*).

CREATE TABLE IF NOT EXISTS public.public_enrollment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_link_id uuid
    REFERENCES public.enrollment_links(id) ON DELETE SET NULL,
  contract_model_id text NOT NULL
    REFERENCES public.enrollment_contract_models(id) ON DELETE RESTRICT,
  term_version_id uuid NOT NULL
    REFERENCES public.term_versions(id) ON DELETE RESTRICT,
  -- Dados do aluno (payload enviado no form público; não duplica students):
  student_name text NOT NULL,
  student_email text,
  student_phone text,
  student_cpf text,
  student_birth_date date,
  instrument text,
  -- Responsável legal (quando aplicável):
  requires_guardian boolean NOT NULL DEFAULT false,
  guardian_name text,
  guardian_cpf text,
  guardian_phone text,
  guardian_email text,
  -- Vínculos comerciais herdados do link (quando presentes):
  plan_id text
    REFERENCES public.financial_plans(id) ON DELETE SET NULL,
  teacher_id text
    REFERENCES public.teachers(id) ON DELETE SET NULL,
  group_id text
    REFERENCES public.groups(id) ON DELETE SET NULL,
  affiliate_id text
    REFERENCES public.affiliates(id) ON DELETE SET NULL,
  custom_price numeric(10,2),
  due_date_day integer
    CHECK (due_date_day IS NULL OR (due_date_day BETWEEN 1 AND 28)),
  -- Estado de revisão administrativa:
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'converted')),
  review_notes text,
  reviewed_by text,                          -- id do profile admin
  reviewed_at timestamptz,
  -- Resultado da conversão (preenchido ao aprovar/criar student+enrollment):
  resolved_student_id text
    REFERENCES public.students(id) ON DELETE SET NULL,
  resolved_prospect_id text
    REFERENCES public.prospects(id) ON DELETE SET NULL,
  resolved_enrollment_id text
    REFERENCES public.enrollments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Quando há responsável, os campos mínimos dele são obrigatórios:
  CONSTRAINT per_guardian_required_fields
    CHECK (
      NOT requires_guardian OR
      (guardian_name IS NOT NULL AND guardian_cpf IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_public_enrollment_requests_link
  ON public.public_enrollment_requests (enrollment_link_id);

CREATE INDEX IF NOT EXISTS idx_public_enrollment_requests_status
  ON public.public_enrollment_requests (status, created_at);

CREATE INDEX IF NOT EXISTS idx_public_enrollment_requests_model
  ON public.public_enrollment_requests (contract_model_id);

-- Evita duas solicitações ativas (não rejeitadas/convertidas) para o mesmo link:
-- chave única parcial em (link) onde status em ('submitted','under_review','approved').
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_enrollment_requests_active_per_link
  ON public.public_enrollment_requests (enrollment_link_id)
  WHERE enrollment_link_id IS NOT NULL
    AND status IN ('submitted', 'under_review', 'approved');

-- Trigger: ao decidir/convertizar, registrar reviewed_at; impedir retrocesso
-- de estados finais sem intervenção explícita.
CREATE OR REPLACE FUNCTION public.guard_request_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'converted' AND NEW.status <> 'converted' THEN
      RAISE EXCEPTION 'Solicitação já convertida (id=%) não pode mudar de status.', OLD.id;
    END IF;
    IF OLD.status = 'rejected' AND NEW.status NOT IN ('rejected', 'submitted') THEN
      RAISE EXCEPTION 'Solicitação rejeitada (id=%) só pode reabrir como submitted.', OLD.id;
    END IF;
    IF NEW.status IN ('approved', 'rejected', 'converted') AND NEW.reviewed_by IS NULL THEN
      RAISE EXCEPTION 'Decisão administrativa exige reviewed_by (id=%).', NEW.id;
    END IF;
    IF NEW.status IN ('approved', 'rejected', 'converted') AND NEW.reviewed_at IS NULL THEN
      NEW.reviewed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_enrollment_requests_status ON public.public_enrollment_requests;
CREATE TRIGGER trg_public_enrollment_requests_status
  BEFORE UPDATE ON public.public_enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_request_status_transition();

-- ==============================================================================
-- 5. REGISTROS IMUTÁVEIS DE ACEITE
-- ==============================================================================
-- Cada aceite é vinculado à versão EXATA do termo (term_version_id) e ao modelo.
-- O hash do conteúdo é registrado no momento do aceite para auditoria jurídica.
-- IP e User-Agent são preenchidos pelo servidor (Edge Function) quando capturados.
-- A tabela é totalmente imutável após INSERT (trigger bloqueia UPDATE e DELETE).

CREATE TABLE IF NOT EXISTS public.term_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_version_id uuid NOT NULL
    REFERENCES public.term_versions(id) ON DELETE RESTRICT,
  contract_model_id text NOT NULL
    REFERENCES public.enrollment_contract_models(id) ON DELETE RESTRICT,
  enrollment_request_id uuid
    REFERENCES public.public_enrollment_requests(id) ON DELETE RESTRICT,
  enrollment_link_id uuid
    REFERENCES public.enrollment_links(id) ON DELETE RESTRICT,
  -- Quem aceitou (payload do form público):
  acceptor_name text NOT NULL,
  acceptor_email text,
  acceptor_cpf text,
  is_guardian boolean NOT NULL DEFAULT false,
  guardian_name text,
  guardian_cpf text,
  -- Auditoria do aceite:
  content_sha256 text NOT NULL,             -- deve coincidir com term_versions.content_sha256
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Evita aceite duplicado da mesma versão pela mesma solicitação.
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_acceptances_request_version
  ON public.term_acceptances (enrollment_request_id, term_version_id)
  WHERE enrollment_request_id IS NOT NULL;

-- Evita aceite duplicado do mesmo link + versão (quando sem request associado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_acceptances_link_version
  ON public.term_acceptances (enrollment_link_id, term_version_id)
  WHERE enrollment_link_id IS NOT NULL AND enrollment_request_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_term_acceptances_version
  ON public.term_acceptances (term_version_id);

CREATE INDEX IF NOT EXISTS idx_term_acceptances_model
  ON public.term_acceptances (contract_model_id);

-- Trigger: garantir que o hash informado corresponde ao hash da versão aceita.
CREATE OR REPLACE FUNCTION public.verify_acceptance_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected text;
BEGIN
  SELECT content_sha256 INTO v_expected
  FROM public.term_versions
  WHERE id = NEW.term_version_id;
  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'Versão de termo inexistente (id=%).', NEW.term_version_id;
  END IF;
  IF NEW.content_sha256 IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Hash do aceite não corresponde à versão do termo (esperado=%, recebido=%).',
      v_expected, NEW.content_sha256;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_acceptances_verify_hash ON public.term_acceptances;
CREATE TRIGGER trg_term_acceptances_verify_hash
  BEFORE INSERT ON public.term_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.verify_acceptance_hash();

-- Trigger: imutabilidade total — bloqueia UPDATE e DELETE em aceites.
CREATE OR REPLACE FUNCTION public.enforce_term_acceptance_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Registros de aceite (term_acceptances) são imutáveis (operação=%).', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_acceptances_no_update ON public.term_acceptances;
CREATE TRIGGER trg_term_acceptances_no_update
  BEFORE UPDATE ON public.term_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_term_acceptance_immutability();

DROP TRIGGER IF EXISTS trg_term_acceptances_no_delete ON public.term_acceptances;
CREATE TRIGGER trg_term_acceptances_no_delete
  BEFORE DELETE ON public.term_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_term_acceptance_immutability();

-- ==============================================================================
-- ROW LEVEL SECURITY
-- ==============================================================================
-- Todas as novas tabelas têm RLS habilitada. Acesso administrativo restrito a
-- super_admin/admin via checagem inline contra public.profiles (mesmo padrão do
-- módulo de afiliados). Nenhuma política para anon: o acesso público futuro
-- será intermediado por Edge Function com service role (bypassa RLS) que valida
-- o link e grava o aceite/solicitação.

ALTER TABLE public.enrollment_contract_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_enrollment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_acceptances ENABLE ROW LEVEL SECURITY;

-- ---------- enrollment_contract_models ----------
DROP POLICY IF EXISTS "admins_select_contract_models" ON public.enrollment_contract_models;
CREATE POLICY "admins_select_contract_models"
  ON public.enrollment_contract_models FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_insert_contract_models" ON public.enrollment_contract_models;
CREATE POLICY "admins_insert_contract_models"
  ON public.enrollment_contract_models FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_update_contract_models" ON public.enrollment_contract_models;
CREATE POLICY "admins_update_contract_models"
  ON public.enrollment_contract_models FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_delete_contract_models" ON public.enrollment_contract_models;
CREATE POLICY "admins_delete_contract_models"
  ON public.enrollment_contract_models FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ---------- term_versions ----------
DROP POLICY IF EXISTS "admins_select_term_versions" ON public.term_versions;
CREATE POLICY "admins_select_term_versions"
  ON public.term_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_insert_term_versions" ON public.term_versions;
CREATE POLICY "admins_insert_term_versions"
  ON public.term_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_update_term_versions" ON public.term_versions;
CREATE POLICY "admins_update_term_versions"
  ON public.term_versions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_delete_term_versions" ON public.term_versions;
CREATE POLICY "admins_delete_term_versions"
  ON public.term_versions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ---------- enrollment_links ----------
DROP POLICY IF EXISTS "admins_select_enrollment_links" ON public.enrollment_links;
CREATE POLICY "admins_select_enrollment_links"
  ON public.enrollment_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_insert_enrollment_links" ON public.enrollment_links;
CREATE POLICY "admins_insert_enrollment_links"
  ON public.enrollment_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_update_enrollment_links" ON public.enrollment_links;
CREATE POLICY "admins_update_enrollment_links"
  ON public.enrollment_links FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_delete_enrollment_links" ON public.enrollment_links;
CREATE POLICY "admins_delete_enrollment_links"
  ON public.enrollment_links FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ---------- public_enrollment_requests ----------
DROP POLICY IF EXISTS "admins_select_enrollment_requests" ON public.public_enrollment_requests;
CREATE POLICY "admins_select_enrollment_requests"
  ON public.public_enrollment_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_insert_enrollment_requests" ON public.public_enrollment_requests;
CREATE POLICY "admins_insert_enrollment_requests"
  ON public.public_enrollment_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_update_enrollment_requests" ON public.public_enrollment_requests;
CREATE POLICY "admins_update_enrollment_requests"
  ON public.public_enrollment_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "admins_delete_enrollment_requests" ON public.public_enrollment_requests;
CREATE POLICY "admins_delete_enrollment_requests"
  ON public.public_enrollment_requests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ---------- term_acceptances ----------
DROP POLICY IF EXISTS "admins_select_term_acceptances" ON public.term_acceptances;
CREATE POLICY "admins_select_term_acceptances"
  ON public.term_acceptances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- INSERT de aceite é feito pela Edge Function com service role (bypassa RLS).
-- Mantém-se também uma policy authenticated para permitir inserção
-- administrativa direta em cenários de backoffice, com checagem de admin.
DROP POLICY IF EXISTS "admins_insert_term_acceptances" ON public.term_acceptances;
CREATE POLICY "admins_insert_term_acceptances"
  ON public.term_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid()::text OR p.email = auth.jwt()->>'email')
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- UPDATE e DELETE intencionalmente SEM policy: imutabilidade também reforçada
-- por trigger. Admins não podem alterar/excluir aceites via API.

-- ==============================================================================
-- FIM DA MIGRAÇÃO (Fase 1 — rascunho para revisão; não executar nesta fase)
-- ==============================================================================
