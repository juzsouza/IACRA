-- ==============================================================================
-- MIGRATION: Integração Plataforma -> Google Agenda (Unidirecional e Opcional)
-- Data: 2026-09-16
-- ==============================================================================

-- 1. Tabela de Contas Google dos Professores (Autorização OAuth 2.0)
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

-- Índices para teacher_google_accounts
CREATE INDEX IF NOT EXISTS idx_teacher_google_accounts_status 
  ON public.teacher_google_accounts(connection_status);

-- 2. Tabela de Mapeamento de Eventos (Platform Class -> Google Calendar Event)
CREATE TABLE IF NOT EXISTS public.class_google_events (
  platform_class_id text PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id text REFERENCES public.teachers(id) ON DELETE SET NULL,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  google_event_id text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed')),
  last_error text
);

-- Índices para class_google_events
CREATE INDEX IF NOT EXISTS idx_class_google_events_teacher 
  ON public.class_google_events(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_google_events_status 
  ON public.class_google_events(sync_status);

-- 3. Row Level Security (RLS)
ALTER TABLE public.teacher_google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_google_events ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para teacher_google_accounts:
-- Apenas usuários autenticados da plataforma com perfil admin/super_admin ou o próprio professor vinculado
CREATE POLICY "Admins have full access to teacher_google_accounts"
  ON public.teacher_google_accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id::text = auth.uid()::text
      AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Teachers can view and update their own connection"
  ON public.teacher_google_accounts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id::text = auth.uid()::text
      AND p.teacher_id = teacher_google_accounts.teacher_id
    )
  );

-- Políticas de RLS para class_google_events:
CREATE POLICY "Authenticated users can view class_google_events"
  ON public.class_google_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and teachers can manage class_google_events"
  ON public.class_google_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id::text = auth.uid()::text
      AND (
        p.role IN ('admin', 'super_admin')
        OR p.teacher_id = class_google_events.teacher_id
      )
    )
  );

-- 4. Permissões de Acesso Explícitas (Compatibilidade Supabase Data API)
-- Concede acesso total exclusivamente para service_role (backend com SUPABASE_SECRET_KEY).
-- NÃO concede grants para anon nem authenticated nas tabelas sensíveis de credenciais.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.teacher_google_accounts
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.class_google_events
TO service_role;

