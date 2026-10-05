-- ==============================================================================
-- Migration: 20261004_fix_superadmin_profile_id.sql
-- Alinhamento Transacional do ID do Super Administrador (institutodeartera@gmail.com)
-- Garante que public.profiles.id corresponda exatamente ao auth.users.id
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_old_id uuid := 'f1a9b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c'::uuid;
  v_new_id uuid := 'fc5d565f-7178-499e-97e4-4e8f3c8bae86'::uuid;
  v_email  text := 'institutodeartera@gmail.com';
  v_count  int;
BEGIN
  -- 1. Se o perfil já estiver com o novo ID, validar pós-condição diretamente
  SELECT count(*) INTO v_count 
  FROM public.profiles 
  WHERE id = v_new_id::text AND email ILIKE v_email;

  IF v_count = 1 THEN
    RAISE NOTICE 'Perfil já atualizado com sucesso para o novo ID %', v_new_id;
    RETURN;
  END IF;

  -- 2. Validar que existe exatamente 1 perfil com o ID antigo e email correto
  SELECT count(*) INTO v_count 
  FROM public.profiles 
  WHERE id = v_old_id::text AND email ILIKE v_email;
  
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Pré-condição falhou: perfil antigo não encontrado ou email divergente.';
  END IF;

  -- 3. Validar que não existe perfil com o novo ID
  SELECT count(*) INTO v_count 
  FROM public.profiles 
  WHERE id = v_new_id::text;
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Pré-condição falhou: já existe um perfil utilizando o novo ID.';
  END IF;

  -- 4. Validar que o auth.users possui o novo ID e email correto
  SELECT count(*) INTO v_count 
  FROM auth.users 
  WHERE id = v_new_id AND email ILIKE v_email;
  
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Pré-condição falhou: usuário não localizado no auth.users com esse ID.';
  END IF;

  -- 5. Atualizar referências filhas antes da alteração da chave primária (competence_billings)
  UPDATE public.competence_billings
  SET frozen_by = v_new_id::text
  WHERE frozen_by = v_old_id::text;

  -- 6. Atualizar public.profiles.id para auth.users.id
  -- Preservando email, role (super_admin), access_status (active), teacher_id e demais campos
  UPDATE public.profiles
  SET id = v_new_id::text
  WHERE id = v_old_id::text
    AND email ILIKE v_email;

  -- 7. Validação pós-migração
  SELECT count(*) INTO v_count 
  FROM public.profiles 
  WHERE id = v_new_id::text 
    AND role = 'super_admin' 
    AND access_status = 'active';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Pós-validação falhou: perfil não encontrado com papel super_admin e status active após atualização.';
  END IF;

  RAISE NOTICE 'Migração executada com sucesso absoluto para % (Novo ID: %)', v_email, v_new_id;
END $$;

COMMIT;
