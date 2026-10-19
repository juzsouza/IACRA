-- ==============================================================================
-- MIGRAÇÃO (RASCUNHO PARA REVISÃO — NÃO EXECUTAR NEM APLICAR NESTA FASE)
-- Módulo Matrícula Digital / Termos de Matrícula (Fase 1 — Estrutura, rev. 2)
-- Data: 2026-10-19
-- Branch: bolt-migration-test
-- ------------------------------------------------------------------------------
-- NOTA DE FLUXO
--   Arquivo em docs/digital-enrollment/ para revisão segura. NÃO está em
--   supabase/migrations/ (esse diretório não é observado neste ambiente) e a
--   única forma de aplicar schema seria via mcp__supabase__apply_migration, que
--   executaria SQL no banco remoto — proibido nesta fase. Quando aprovado,
--   aplicar como migração única via mcp__supabase__apply_migration na fase
--   seguinte, com o filename 20261019_digital_enrollment_terms.
--
-- OBJETIVO
--   Preparar a estrutura de banco para o módulo de Matrícula Digital do EAVRA:
--   catálogo de modelos contratuais, versões imutáveis de termos com hash
--   SHA-256, links individuais com token armazenado como hash, expiração,
--   revogação, controle de uso e condições comerciais congeladas no momento da
--   emissão, solicitações públicas de matrícula (sem endereço residencial) e
--   registros imutáveis de aceite vinculados à versão exata do termo, com
--   auditoria (IP e User-Agent quando capturados pelo servidor) e estados de
--   revisão administrativa (aprovação/rejeição).
--
-- PRINCÍPIOS
--   * Somente aditivo: não apaga, renomeia nem altera tabelas/colunas existentes.
--   * Não toca em prospects.term_signed nem prospects.approved (preservados).
--   * Não duplica dados já existentes em students/prospects/enrollments; a
--     solicitação pública armazena o payload do form e, após conversão,
--     referencia o student/prospect/enrollment criado.
--   * Chaves primárias existentes são `text` (students, teachers, prospects,
--     enrollments, groups, financial_plans, affiliates, profiles). As novas
--     tabelas usam uuid DEFAULT gen_random_uuid(). As FKs para tabelas
--     existentes usam `text` para compatibilidade.
--   * RLS ativada em todas as novas tabelas. Nenhuma política pública para
--     tokens, solicitações ou aceites. O acesso público futuro será
--     intermediado por uma Edge Function com service role (bypassa RLS).
--   * Versões que já foram publicadas são imutáveis para sempre, mesmo após
--     serem arquivadas (garantido por trigger baseado em published_at IS NOT NULL).
--   * Registros de aceite são totalmente imutáveis após INSERT.
--   * Condições comerciais são congeladas no momento da emissão do link
--     (snapshots) e herdadas imutavelmente pela solicitação.
--
-- NOVAS TABELAS
--   1. enrollment_contract_models  — catálogo fixo dos 4 modelos contratuais
--   2. term_versions               — versões numeradas imutáveis (hash SHA-256)
--   3. enrollment_links            — links individuais (token hash, snapshots)
--   4. public_enrollment_requests  — solicitações públicas (aluno + responsável)
--   5. term_acceptances            — aceite imutável vinculado à versão exata
--
-- SEGURANÇA
--   * RLS habilitada em todas as novas tabelas.
--   * Políticas separadas por verbo (SELECT/INSERT/UPDATE/DELETE), restritas a
--     super_admin/admin via checagem inline contra public.profiles.
--   * term_acceptances: SEM policy de INSERT/UPDATE/DELETE para authenticated ou
--     anon — o registro de aceite é feito exclusivamente pelo backend autorizado
--     (Edge Function com service role), que bypassa RLS e aplica validações.
--   * Nenhuma política para anon em nenhuma tabela.
--
-- OBSERVAÇÕES
--   * Não inclui dados pessoais reais, senhas, tokens em claro nem chaves de API.
--   * Não cria telas, formulários, Edge Functions ou integrações (Fases 2+).
--   * Não altera package.json, App.tsx, store.tsx, .env ou arquivos de produção.
--
-- RESUMO DE ELEMENTOS (contagem precisa)
--   Índices UNIQUE: 8
--     1. uq_term_versions_model_number
--     2. uq_term_versions_published_hash
--     3. uq_term_versions_single_published_per_model
--     4. uq_term_versions_id_model
--     5. uq_enrollment_links_token_hash
--     6. uq_public_enrollment_requests_active_per_link
--     7. uq_term_acceptances_request_version
--     8. uq_term_acceptances_link_version
--   Triggers: 11
--     1.  trg_contract_models_protect_fixed
--     2.  trg_term_versions_set_hash
--     3.  trg_term_versions_immutability
--     4.  trg_term_versions_publish_transition
--     5.  trg_enrollment_links_sync_status
--     6.  trg_enrollment_links_validate_model_version
--     7.  trg_public_enrollment_requests_inherit_link
--     8.  trg_public_enrollment_requests_status
--     9.  trg_term_acceptances_verify
--     10. trg_term_acceptances_no_update
--     11. trg_term_acceptances_no_delete
--   Funções plpgsql: 10 (uma por trigger, exceto imutabilidade que é
--     compartilhada por update/delete de aceites)
-- ==============================================================================

-- Extensões necessárias (idempotente)
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- digest() para SHA-256 e gen_random_uuid()

-- ==============================================================================
-- 1. CATÁLOGO DE MODELOS CONTRATUAIS
-- ==============================================================================
-- Catálogo fixo dos quatro modelos de matrícula do EAVRA. A coluna `id` é o
-- identificador canônico do modelo, usado como FK pelas demais tabelas.
-- Os quatro modelos são protegidos contra exclusão por trigger.

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

-- População idempotente dos quatro modelos (apenas nomes/descrições; os textos
-- contratuais integrais ficam em term_versions nas fases seguintes).
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

-- Trigger: impedir exclusão dos quatro modelos fixos (catálogo permanente).
CREATE OR REPLACE FUNCTION public.protect_fixed_contract_models()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Modelo contratual fixo (id=%) não pode ser excluído.', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_models_protect_fixed ON public.enrollment_contract_models;
CREATE TRIGGER trg_contract_models_protect_fixed
  BEFORE DELETE ON public.enrollment_contract_models
  FOR EACH ROW EXECUTE FUNCTION public.protect_fixed_contract_models();

-- ==============================================================================
-- 2. VERSÕES DE TERMOS (IMUTÁVEIS APÓS PRIMEIRA PUBLICAÇÃO)
-- ==============================================================================
-- Cada versão pertence a um modelo contratual, é numerada sequencialmente por
-- modelo e armazena o conteúdo INTEGRAL do termo. O hash SHA-256 do conteúdo é
-- SEMPRE recalculado por trigger (antes de INSERT e de qualquer UPDATE),
-- ignorando qualquer valor fornecido — garantindo integridade criptográfica.
-- Uma vez publicada (published_at IS NOT NULL), a versão é imutável para sempre:
-- conteúdo, título, número, modelo, hash, published_at e published_by não podem
-- ser alterados nem excluídos, mesmo se o status mudar para 'archived'.

CREATE TABLE IF NOT EXISTS public.term_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_model_id text NOT NULL
    REFERENCES public.enrollment_contract_models(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,                 -- conteúdo integral do termo/contrato
  content_sha256 text NOT NULL,       -- hex(sha256(body)) — SEMPRE recalculado por trigger
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,           -- marcado uma vez; NUNCA pode ser nullificado
  published_by text,                  -- id do profile admin que publicou
  created_by text,                    -- id do profile admin que criou
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma versão por (modelo, número).
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_versions_model_number
  ON public.term_versions (contract_model_id, version_number);

-- Hash único por conteúdo publicado dentro de um modelo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_versions_published_hash
  ON public.term_versions (contract_model_id, content_sha256)
  WHERE status = 'published';

-- Apenas uma versão published vigente por modelo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_versions_single_published_per_model
  ON public.term_versions (contract_model_id)
  WHERE status = 'published';

-- UNIQUE composto (id, contract_model_id) para servir de alvo a FKs compostas
-- nas tabelas que referenciam versões, garantindo que contract_model_id
-- informado corresponda ao contract_model_id real da versão.
CREATE UNIQUE INDEX IF NOT EXISTS uq_term_versions_id_model
  ON public.term_versions (id, contract_model_id);

CREATE INDEX IF NOT EXISTS idx_term_versions_model_status
  ON public.term_versions (contract_model_id, status);

-- Trigger: SEMPRE recalcular content_sha256 = digest(body, 'sha256') antes de
-- INSERT ou qualquer UPDATE. Dispara em toda operação (não só UPDATE OF body),
-- garantindo que o hash jamais seja adulterado ou inconsistente.
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
  BEFORE INSERT OR UPDATE ON public.term_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_term_version_hash();

-- Trigger: imutabilidade de toda versão que já foi publicada (published_at IS
-- NOT NULL). Bloqueia DELETE e alteração de conteúdo/título/número/modelo/
-- hash/published_at/published_by. Permite apenas transição de status
-- published -> archived (e nada depois). Regra baseada em published_at, não em
-- status corrente — assim, uma versão arquivada que já foi publicada continua
-- imutável.
CREATE OR REPLACE FUNCTION public.enforce_term_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Versão de termo já publicada (id=%) é imutável e não pode ser excluída.', OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL THEN
    IF NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 THEN
      RAISE EXCEPTION 'Versão já publicada (id=%): hash não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      RAISE EXCEPTION 'Versão já publicada (id=%): corpo não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      RAISE EXCEPTION 'Versão já publicada (id=%): título não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.version_number IS DISTINCT FROM OLD.version_number THEN
      RAISE EXCEPTION 'Versão já publicada (id=%): número não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.contract_model_id IS DISTINCT FROM OLD.contract_model_id THEN
      RAISE EXCEPTION 'Versão já publicada (id=%): modelo não pode ser alterado.', OLD.id;
    END IF;
    IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'Versão já publicada (id=%): published_at é imutável.', OLD.id;
    END IF;
    IF NEW.published_by IS DISTINCT FROM OLD.published_by THEN
      RAISE EXCEPTION 'Versão já publicada (id=%): published_by é imutável.', OLD.id;
    END IF;
    -- A única alteração permitida em versão já publicada é a transição de
    -- status published -> archived, validada pelo trigger de transição.
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_versions_immutability ON public.term_versions;
CREATE TRIGGER trg_term_versions_immutability
  BEFORE UPDATE OR DELETE ON public.term_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_term_version_immutability();

-- Trigger: controlar transições de status. draft -> published seta published_at
-- (se ainda nulo) e published_by. published -> archived é permitido. Nenhum
-- outro caminho é válido. draft -> draft é livre (edição de rascunho).
CREATE OR REPLACE FUNCTION public.guard_term_version_publish_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- draft -> published: publicar
    IF OLD.status = 'draft' AND NEW.status = 'published' THEN
      IF NEW.published_at IS NULL THEN
        NEW.published_at := now();
      END IF;
    ELSIF OLD.status = 'published' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'Versão publicada (id=%) não pode voltar para draft.', OLD.id;
    ELSIF OLD.status = 'published' AND NEW.status = 'archived' THEN
      -- despublicar (arquivar) é permitido; published_at permanece imutável
      NULL;
    ELSIF OLD.status = 'archived' AND NEW.status = 'published' THEN
      RAISE EXCEPTION 'Versão arquivada (id=%) não pode ser republicada.', OLD.id;
    ELSIF OLD.status = 'archived' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'Versão arquivada (id=%) não pode voltar para draft.', OLD.id;
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
-- 3. LINKS INDIVIDUAIS DE MATRÍCULA (com condições comerciais congeladas)
-- ==============================================================================
-- Token armazenado apenas como hash SHA-256 (nunca em claro). O link associa-se
-- a uma versão contratual (via FK composta que valida contract_model_id) e
-- congela, no momento da emissão, os dados comerciais definidos pelo admin:
-- snapshots de plano, modalidade, instrumento, frequência, professor, grupo,
-- preço efetivo e dia de vencimento. Esses snapshots são imutáveis após a
-- emissão e não podem ser substituídos pelo formulário público.

CREATE TABLE IF NOT EXISTS public.enrollment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,                -- hex(sha256(token)) — UNIQUE
  contract_model_id text NOT NULL
    REFERENCES public.enrollment_contract_models(id) ON DELETE RESTRICT,
  term_version_id uuid NOT NULL,
  -- FK composta: garante que contract_model_id corresponde ao modelo real
  -- da term_version_id referenciada.
  CONSTRAINT enrollment_links_version_model_fkey
    FOREIGN KEY (term_version_id, contract_model_id)
    REFERENCES public.term_versions(id, contract_model_id) ON DELETE RESTRICT,
  -- Dados comerciais definidos pelo admin (FKs para vínculo):
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
  -- Snapshots congelados no momento da emissão (preservam condições mesmo se
  -- cadastros/planos mudarem depois). Preenchidos pelo admin ou backend.
  plan_name_snapshot text,
  plan_category_snapshot text,
  plan_modality_snapshot text,
  instrument_snapshot text,
  frequency_snapshot text,
  teacher_name_snapshot text,
  group_name_snapshot text,
  effective_price numeric(10,2),           -- preço efetivo consolidado
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

-- Token hash único.
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_links_token_hash
  ON public.enrollment_links (token_hash);

CREATE INDEX IF NOT EXISTS idx_enrollment_links_model_status
  ON public.enrollment_links (contract_model_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollment_links_term_version
  ON public.enrollment_links (term_version_id);

CREATE INDEX IF NOT EXISTS idx_enrollment_links_expires
  ON public.enrollment_links (expires_at) WHERE expires_at IS NOT NULL;

-- Trigger: validar correspondência entre contract_model_id e term_version_id
-- (redundante com a FK composta, mas protege contra inconsistências se a FK
-- for relaxada no futuro e garante mensagem de erro clara).
CREATE OR REPLACE FUNCTION public.validate_enrollment_link_model_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_model text;
BEGIN
  SELECT contract_model_id INTO v_model
  FROM public.term_versions
  WHERE id = NEW.term_version_id;
  IF v_model IS NULL THEN
    RAISE EXCEPTION 'term_version_id (id=%) inexistente.', NEW.term_version_id;
  END IF;
  IF v_model IS DISTINCT FROM NEW.contract_model_id THEN
    RAISE EXCEPTION 'contract_model_id (%) não corresponde ao modelo da versão (id=%, modelo=%).',
      NEW.contract_model_id, NEW.term_version_id, v_model;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_links_validate_model_version ON public.enrollment_links;
CREATE TRIGGER trg_enrollment_links_validate_model_version
  BEFORE INSERT OR UPDATE ON public.enrollment_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_enrollment_link_model_version();

-- Trigger: manter `status` consistente com revoked_at / use_count.
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
-- Submissão pública via link. Não inclui endereço residencial. Herda imutavel-
-- mente as condições comerciais congeladas do link (trigger sobrescreve quais-
-- quer campos comerciais enviados pelo formulário com os do link). Após
-- aprovação, converte em student/enrollment (referenciados por resolved_*).
--
-- RESPONSÁVEL LEGAL / MENOR DE IDADE:
--   A coluna requires_guardian é enviada pelo formulário, mas NÃO é a única
--   validação. O backend (Edge Function) DEVE calcular a idade do aluno com
--   base em student_birth_date vs. a data da submissão (created_at) e:
--     - Se menor de 18 anos: exigir guardian_name, guardian_cpf, e idealmente
--       guardian_phone/guardian_email; rejeitar a submissão se faltarem.
--     - Se maior de 18 e requires_guardian = true: aceitar apenas se houver
--       justificativa (ex.: curatela) — decisão administrativa.
--   A coluna guardian_verification_status registra o resultado dessa validação
--   no backend: 'pending' (padrão), 'verified' ou 'rejected'. O banco não
--   calcula idade (lógica de negócio), mas impõe que, se requires_guardian =
--   true, guardian_name e guardian_cpf sejam obrigatórios (CHECK).

CREATE TABLE IF NOT EXISTS public.public_enrollment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_link_id uuid
    REFERENCES public.enrollment_links(id) ON DELETE SET NULL,
  contract_model_id text NOT NULL
    REFERENCES public.enrollment_contract_models(id) ON DELETE RESTRICT,
  term_version_id uuid NOT NULL,
  -- FK composta: garante que (term_version_id, contract_model_id) é consistente.
  CONSTRAINT public_enrollment_requests_version_model_fkey
    FOREIGN KEY (term_version_id, contract_model_id)
    REFERENCES public.term_versions(id, contract_model_id) ON DELETE RESTRICT,
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
  guardian_verification_status text NOT NULL DEFAULT 'pending'
    CHECK (guardian_verification_status IN ('pending', 'verified', 'rejected')),
  -- Condições comerciais herdados do link (imutáveis via trigger; o formulário
  -- público NÃO pode substituí-las). Snapshots congelados:
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
  plan_name_snapshot text,
  plan_category_snapshot text,
  plan_modality_snapshot text,
  instrument_snapshot text,
  frequency_snapshot text,
  teacher_name_snapshot text,
  group_name_snapshot text,
  effective_price numeric(10,2),
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

-- Evita duas solicitações ativas para o mesmo link (uso único do link).
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_enrollment_requests_active_per_link
  ON public.public_enrollment_requests (enrollment_link_id)
  WHERE enrollment_link_id IS NOT NULL
    AND status IN ('submitted', 'under_review', 'approved');

-- Trigger: herdar e congelar condições comerciais do link. BEFORE INSERT: se
-- enrollment_link_id IS NOT NULL, sobrescreve TODOS os campos comerciais e
-- snapshots da solicitação com os do link — o formulário público não pode
-- substituir condições comerciais. BEFORE UPDATE: se o link estiver presente e
-- não mudou, bloqueia alteração dos campos comerciais (imutabilidade). Valida
-- também que contract_model_id e term_version_id correspondem aos do link.
CREATE OR REPLACE FUNCTION public.inherit_request_commercial_terms_from_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_link public.enrollment_links%ROWTYPE;
BEGIN
  IF NEW.enrollment_link_id IS NOT NULL THEN
    SELECT * INTO v_link FROM public.enrollment_links WHERE id = NEW.enrollment_link_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'enrollment_link_id (id=%) inexistente.', NEW.enrollment_link_id;
    END IF;
    -- Validar correspondência modelo + versão entre solicitação e link:
    IF NEW.contract_model_id IS DISTINCT FROM v_link.contract_model_id THEN
      RAISE EXCEPTION 'contract_model_id da solicitação (%) não corresponde ao do link (%).',
        NEW.contract_model_id, v_link.contract_model_id;
    END IF;
    IF NEW.term_version_id IS DISTINCT FROM v_link.term_version_id THEN
      RAISE EXCEPTION 'term_version_id da solicitação (%) não corresponde ao do link (%).',
        NEW.term_version_id, v_link.term_version_id;
    END IF;
    -- Sobrescrever (congelar) condições comerciais com as do link:
    NEW.plan_id := v_link.plan_id;
    NEW.teacher_id := v_link.teacher_id;
    NEW.group_id := v_link.group_id;
    NEW.affiliate_id := v_link.affiliate_id;
    NEW.custom_price := v_link.custom_price;
    NEW.due_date_day := v_link.due_date_day;
    NEW.plan_name_snapshot := v_link.plan_name_snapshot;
    NEW.plan_category_snapshot := v_link.plan_category_snapshot;
    NEW.plan_modality_snapshot := v_link.plan_modality_snapshot;
    NEW.instrument_snapshot := v_link.instrument_snapshot;
    NEW.frequency_snapshot := v_link.frequency_snapshot;
    NEW.teacher_name_snapshot := v_link.teacher_name_snapshot;
    NEW.group_name_snapshot := v_link.group_name_snapshot;
    NEW.effective_price := v_link.effective_price;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_enrollment_requests_inherit_link ON public.public_enrollment_requests;
CREATE TRIGGER trg_public_enrollment_requests_inherit_link
  BEFORE INSERT OR UPDATE ON public.public_enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION public.inherit_request_commercial_terms_from_link();

-- Trigger: transições de status de revisão administrativa.
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
-- Cada aceite é vinculado à versão EXATA do termo (term_version_id) e ao modelo
-- (via FK composta). O hash do conteúdo é validado contra o hash da versão
-- (trigger). IP e User-Agent são preenchidos pelo servidor (Edge Function).
-- A tabela é totalmente imutável após INSERT: trigger bloqueia UPDATE e DELETE.
-- NÃO há policy de INSERT/UPDATE/DELETE para authenticated nem anon — o
-- registro é feito exclusivamente pelo backend autorizado (service role).

CREATE TABLE IF NOT EXISTS public.term_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_version_id uuid NOT NULL,
  contract_model_id text NOT NULL,
  -- FK composta: garante que contract_model_id corresponde ao modelo da versão.
  CONSTRAINT term_acceptances_version_model_fkey
    FOREIGN KEY (term_version_id, contract_model_id)
    REFERENCES public.term_versions(id, contract_model_id) ON DELETE RESTRICT,
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

-- FK simples para enrollment_contract_models (mantida para clareza e queries).
-- Já coberta transitivamente pela FK composta acima.
-- (Não adicionada explicitamente para evitar redundância; a FK composta garante
-- que contract_model_id existe em term_versions, que por sua vez referencia
-- enrollment_contract_models.)

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

-- Trigger: validar hash E correspondência modelo-versão antes de INSERT.
CREATE OR REPLACE FUNCTION public.verify_term_acceptance_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_hash text;
  v_expected_model text;
BEGIN
  SELECT content_sha256, contract_model_id
    INTO v_expected_hash, v_expected_model
  FROM public.term_versions
  WHERE id = NEW.term_version_id;
  IF v_expected_hash IS NULL THEN
    RAISE EXCEPTION 'Versão de termo inexistente (id=%).', NEW.term_version_id;
  END IF;
  IF NEW.content_sha256 IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'Hash do aceite não corresponde à versão do termo (esperado=%, recebido=%).',
      v_expected_hash, NEW.content_sha256;
  END IF;
  IF NEW.contract_model_id IS DISTINCT FROM v_expected_model THEN
    RAISE EXCEPTION 'contract_model_id do aceite (%) não corresponde ao modelo da versão (esperado=%).',
      NEW.contract_model_id, v_expected_model;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_acceptances_verify ON public.term_acceptances;
CREATE TRIGGER trg_term_acceptances_verify
  BEFORE INSERT ON public.term_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.verify_term_acceptance_integrity();

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
-- super_admin/admin via checagem inline contra public.profiles (mesmo padrão
-- do módulo de afiliados). Nenhuma política para anon.
--
-- term_acceptances: SEM policy de INSERT, UPDATE ou DELETE. O registro de
-- aceite é feito exclusivamente pela Edge Function com service role (bypassa
-- RLS). Apenas SELECT é permitido a admins para auditoria.

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

-- DELETE intencionalmente SEM policy: o trigger bloqueia exclusão dos 4 modelos
-- fixos, e não há outros modelos para excluir. RLS deny-by-default reforça.

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
-- Apenas SELECT para admins (auditoria). INSERT/UPDATE/DELETE SEM policy:
-- o registro de aceite é feito exclusivamente pela Edge Function com service
-- role (bypassa RLS), garantindo que nenhum cliente direto possa gravar ou
-- alterar aceites. Imutabilidade também reforçada por trigger.
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

-- Nenhuma policy de INSERT, UPDATE ou DELETE em term_acceptances.
-- RLS deny-by-default: nenhum cliente (anon ou authenticated) pode
-- gravar/alterar/excluir aceites. Apenas service role (Edge Function) bypassa.

-- ==============================================================================
-- FIM DA MIGRAÇÃO (Fase 1 — rascunho para revisão; não executar nesta fase)
-- ==============================================================================
