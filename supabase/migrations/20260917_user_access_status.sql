-- ==============================================================================
-- Migration: Controle de Bloqueio de Acesso de Usuários (profiles.access_status)
-- e Autorização Exclusiva de Super Admin para Gestão de Status e Credenciais
-- ==============================================================================

-- 1. Adicionar coluna access_status à tabela public.profiles se não existir
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active'
CHECK (access_status IN ('active', 'blocked'));

-- 2. Criar índice para consultas eficientes de autenticação e status
CREATE INDEX IF NOT EXISTS idx_profiles_access_status
ON public.profiles(access_status);

-- 3. Garantir que a coluna status existe na tabela public.teachers
ALTER TABLE public.teachers
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_teachers_status
ON public.teachers(status);

-- 4. Função RPC segura com privilégios SECURITY DEFINER: admin_toggle_user_access
-- SOMENTE Super Admin pode executar
CREATE OR REPLACE FUNCTION public.admin_toggle_user_access(
  target_user_id text,
  target_access_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
  user_email text;
BEGIN
  -- 1. Validar se o solicitante é super_admin
  SELECT role INTO caller_role 
  FROM public.profiles 
  WHERE id = auth.uid()::text;

  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Permissão negada. Apenas Super Administradores podem bloquear ou liberar o acesso de usuários.'
    );
  END IF;

  -- 2. Validar o parâmetro de status
  IF target_access_status NOT IN ('active', 'blocked') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Valor inválido. Utilize "active" ou "blocked".'
    );
  END IF;

  -- 3. Buscar e validar ID
  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'ID de usuário inválido.'
    );
  END;

  -- 4. Impedir auto-bloqueio do próprio Super Admin logado
  IF uuid_target = auth.uid() AND target_access_status = 'blocked' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Operação não permitida: você não pode bloquear seu próprio acesso de Super Administrador.'
    );
  END IF;

  -- 5. Atualizar o registro em public.profiles
  UPDATE public.profiles
  SET access_status = target_access_status
  WHERE id = target_user_id;

  -- Obter e-mail associado caso o ID em auth.users seja referenciado
  SELECT email INTO user_email FROM public.profiles WHERE id = target_user_id;

  -- 6. Suspender ou reativar em auth.users para bloqueio nativo na origem do Supabase Auth
  IF target_access_status = 'blocked' THEN
    UPDATE auth.users 
    SET banned_until = '3000-01-01 00:00:00+00',
        updated_at = now()
    WHERE id = uuid_target OR (user_email IS NOT NULL AND lower(email) = lower(user_email));
  ELSE
    UPDATE auth.users 
    SET banned_until = NULL,
        updated_at = now()
    WHERE id = uuid_target OR (user_email IS NOT NULL AND lower(email) = lower(user_email));
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', CASE 
      WHEN target_access_status = 'blocked' THEN 'Acesso do usuário bloqueado no Supabase Auth e no perfil com sucesso.'
      ELSE 'Acesso do usuário liberado com sucesso.'
    END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_user_access(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_access(text, text) TO service_role;

-- 5. Função RPC segura com privilégios SECURITY DEFINER: admin_get_user_auth_status
-- Permite ao Super Admin inspecionar o status físico de suspensão em auth.users
CREATE OR REPLACE FUNCTION public.admin_get_user_auth_status(
  target_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
  is_banned boolean;
  banned_date timestamptz;
  user_email text;
BEGIN
  -- Validar se o solicitante é super_admin
  SELECT role INTO caller_role 
  FROM public.profiles 
  WHERE id = auth.uid()::text;

  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Permissão negada. Apenas Super Administradores podem consultar status do Auth.'
    );
  END IF;

  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID de usuário inválido.');
  END;

  SELECT email INTO user_email FROM public.profiles WHERE id = target_user_id;

  SELECT 
    (banned_until IS NOT NULL AND banned_until > now()), 
    banned_until
  INTO is_banned, banned_date
  FROM auth.users
  WHERE id = uuid_target OR (user_email IS NOT NULL AND lower(email) = lower(user_email))
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'is_banned', COALESCE(is_banned, false),
    'banned_until', banned_date
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_auth_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_auth_status(text) TO service_role;

-- 6. Função RPC segura com privilégios SECURITY DEFINER: admin_toggle_teacher_status
-- SOMENTE Super Admin pode executar
CREATE OR REPLACE FUNCTION public.admin_toggle_teacher_status(
  target_teacher_id text,
  target_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
BEGIN
  -- 1. Validar se o solicitante é super_admin
  SELECT role INTO caller_role 
  FROM public.profiles 
  WHERE id = auth.uid()::text;

  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Permissão negada. Apenas Super Administradores podem inativar ou reativar professores.'
    );
  END IF;

  -- 2. Validar status
  IF target_status NOT IN ('active', 'inactive') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Status inválido. Utilize "active" ou "inactive".'
    );
  END IF;

  -- 3. Atualizar status na tabela teachers
  UPDATE public.teachers
  SET status = target_status
  WHERE id = target_teacher_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Status operacional do professor atualizado com sucesso.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_teacher_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_teacher_status(text, text) TO service_role;
