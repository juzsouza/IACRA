-- ==============================================================================
-- Migration: 20260918_auth_admin_api_block.sql
-- MIGRATION OFICIAL: Bloqueio do Supabase Auth migrado para Auth Admin API Server-Side
-- ==============================================================================
--
-- Motivação Técnica:
-- Comandos SQL diretos com UPDATE em auth.users (como UPDATE auth.users SET banned_until = ...)
-- dentro de triggers ou funções PL/pgSQL podem não surtir efeito de suspensão real do Auth
-- devido a permissões de schema, caching do GoTrue/Supabase Auth ou restrições internas do serviço.
--
-- Solução Arquitetural Oficial da Supabase:
-- 1. O bloqueio/liberação do Supabase Auth é executado exclusivamente via Supabase Auth Admin API:
--    supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' | 'none' })
-- 2. A execução ocorre no ambiente seguro de servidor/Edge Function:
--    /supabase/functions/admin-toggle-user-access
-- 3. A chave de serviço (SUPABASE_SERVICE_ROLE_KEY) permanece restrita e oculta, NUNCA indo ao frontend.
-- 4. A tabela public.profiles armazena o access_status ('active' | 'blocked') somente após confirmação do Auth.
--

-- 1. Garantir integridade da coluna access_status em public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active'
CHECK (access_status IN ('active', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_profiles_access_status
ON public.profiles(access_status);

-- 2. Se a função RPC existir, remover a manipulação direta em auth.users,
-- mantendo a RPC apenas como atualizador auxiliar seguro de profiles caso invocada.
CREATE OR REPLACE FUNCTION public.admin_toggle_user_access(
  target_user_id text,
  target_access_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller_role text;
BEGIN
  -- Validar se o chamador é super_admin
  SELECT role INTO caller_role 
  FROM public.profiles 
  WHERE id = auth.uid()::text;

  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Permissão negada. Apenas Super Administradores podem alterar o status de acesso de usuários.'
    );
  END IF;

  IF target_access_status NOT IN ('active', 'blocked') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Status inválido. Deve ser active ou blocked.');
  END IF;

  IF auth.uid()::text = target_user_id AND target_access_status = 'blocked' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Operação não permitida: auto-bloqueio de Super Admin.');
  END IF;

  -- Atualizar apenas public.profiles (o bloqueio de auth.users é de responsabilidade da Edge Function / Auth Admin API)
  UPDATE public.profiles
  SET access_status = target_access_status
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Perfil atualizado. Lembre-se que a suspensão de login deve ser executada pela Auth Admin API.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_user_access(text, text) TO authenticated, service_role;
