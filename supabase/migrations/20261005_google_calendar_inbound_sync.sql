-- ==============================================================================
-- MIGRATION: Google Calendar -> EAVRA Sincronização Inbound (Fase 1)
-- Data: 2026-10-05
-- ==============================================================================

-- 1. Adicionar restrição UNIQUE para google_event_id por calendário em class_google_events
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_class_google_events_calendar_event'
  ) THEN
    ALTER TABLE public.class_google_events 
      ADD CONSTRAINT uq_class_google_events_calendar_event UNIQUE (google_calendar_id, google_event_id);
  END IF;
END $$;

-- 2. Adicionar campos de controle de direção, origem, etag e recorrência em class_google_events
ALTER TABLE public.class_google_events 
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'eavra' CHECK (origin IN ('eavra', 'google')),
  ADD COLUMN IF NOT EXISTS sync_direction text DEFAULT 'eavra_to_google' CHECK (sync_direction IN ('eavra_to_google', 'google_to_eavra')),
  ADD COLUMN IF NOT EXISTS etag text,
  ADD COLUMN IF NOT EXISTS recurring_event_id text;

-- Índices de consulta rápida para o fluxo inbound
CREATE INDEX IF NOT EXISTS idx_class_google_events_event_id 
  ON public.class_google_events(google_event_id);

CREATE INDEX IF NOT EXISTS idx_class_google_events_recurring_id 
  ON public.class_google_events(recurring_event_id);

-- 3. Adicionar campos de controle de sincronização incremental (delta sync) em teacher_google_accounts
ALTER TABLE public.teacher_google_accounts 
  ADD COLUMN IF NOT EXISTS next_sync_token text,
  ADD COLUMN IF NOT EXISTS last_inbound_sync_at timestamptz;

-- 4. Adicionar flag de pendência de vínculo de aluno em classes (quando criado via Google Calendar)
ALTER TABLE public.classes 
  ADD COLUMN IF NOT EXISTS needs_student_link boolean DEFAULT false;

-- 5. Garantir permissões de acesso para service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_google_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_google_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_students TO service_role;
