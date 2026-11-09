-- SOMENTE CANDIDATO: NÃO EXECUTAR NO SUPABASE DE PRODUÇÃO.
-- Espelha apenas o catálogo de permissões e as definições de RPC do DEV.
-- NÃO copia usuários, regras individuais ou dados reais do DEV.
-- Esta migração cria o painel administrativo, mas NÃO modifica as autorizações
-- dos outros módulos, que continuam dependendo de suas verificações existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
BEGIN
 IF to_regclass('public.profiles') IS NULL THEN RAISE EXCEPTION 'profiles_missing'; END IF;
 IF (SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='id') <> 'text'
 THEN RAISE EXCEPTION 'profiles_id_type_mismatch'; END IF;
 IF to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'supabase_auth_uid_missing'; END IF;
END
$preflight$;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS app_private.eavra_permission_catalog (
 permission_key text PRIMARY KEY,
 module text NOT NULL,
 action text NOT NULL,
 reserved_super_admin boolean NOT NULL DEFAULT false,
 admin_only boolean NOT NULL DEFAULT false,
 CONSTRAINT permission_key_valid CHECK (permission_key=module||'.'||action),
 CONSTRAINT permission_action_unique UNIQUE (module,action)
);
CREATE TABLE IF NOT EXISTS app_private.eavra_role_permissions (
 role text NOT NULL CHECK (role IN ('admin','teacher')),
 permission_key text NOT NULL REFERENCES app_private.eavra_permission_catalog(permission_key),
 decision text NOT NULL CHECK (decision IN ('allow','deny')),
 scope text NOT NULL CHECK (scope IN ('all','own','none')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (role,permission_key),
 CONSTRAINT role_scope_valid CHECK ((decision='deny' AND scope='none') OR (decision='allow' AND scope IN ('all','own')))
);
CREATE TABLE IF NOT EXISTS app_private.eavra_user_permission_overrides (
 profile_id text NOT NULL REFERENCES public.profiles(id),
 permission_key text NOT NULL REFERENCES app_private.eavra_permission_catalog(permission_key),
 decision text NOT NULL CHECK (decision IN ('allow','deny')),
 scope text NOT NULL CHECK (scope IN ('all','own','none')),
 changed_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (profile_id,permission_key),
 CONSTRAINT override_scope_valid CHECK ((decision='deny' AND scope='none') OR (decision='allow' AND scope IN ('all','own')))
);
CREATE TABLE IF NOT EXISTS app_private.eavra_permission_audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_auth_id text NOT NULL,
 target_profile_id text,
 permission_key text,
 change_type text NOT NULL,
 before_state jsonb,
 after_state jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.eavra_permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.eavra_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.eavra_user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.eavra_permission_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_private FROM PUBLIC,anon,authenticated;
INSERT INTO app_private.eavra_permission_catalog (permission_key,module,action,reserved_super_admin,admin_only)
VALUES
  ('agenda.create', 'agenda', 'create', false, false),
  ('agenda.delete', 'agenda', 'delete', false, false),
  ('agenda.edit', 'agenda', 'edit', false, false),
  ('agenda.view', 'agenda', 'view', false, false),
  ('classes.create', 'classes', 'create', false, false),
  ('classes.delete', 'classes', 'delete', false, false),
  ('classes.edit', 'classes', 'edit', false, false),
  ('classes.view', 'classes', 'view', false, false),
  ('classes.view_reports', 'classes', 'view_reports', false, false),
  ('coral.close_period', 'coral', 'close_period', false, true),
  ('coral.create', 'coral', 'create', false, false),
  ('coral.delete', 'coral', 'delete', false, false),
  ('coral.edit', 'coral', 'edit', false, false),
  ('coral.manage_collaborators', 'coral', 'manage_collaborators', false, true),
  ('coral.reopen_period', 'coral', 'reopen_period', false, true),
  ('coral.view', 'coral', 'view', false, false),
  ('coral.view_closings', 'coral', 'view_closings', false, true),
  ('coral.view_individual_values', 'coral', 'view_individual_values', false, true),
  ('dashboard.view', 'dashboard', 'view', false, false),
  ('enrollments.approve', 'enrollments', 'approve', false, false),
  ('enrollments.create', 'enrollments', 'create', false, false),
  ('enrollments.delete', 'enrollments', 'delete', false, false),
  ('enrollments.edit', 'enrollments', 'edit', false, false),
  ('enrollments.view', 'enrollments', 'view', false, false),
  ('finance.close_period', 'finance', 'close_period', false, true),
  ('finance.create', 'finance', 'create', false, false),
  ('finance.delete', 'finance', 'delete', false, false),
  ('finance.edit', 'finance', 'edit', false, false),
  ('finance.reopen_period', 'finance', 'reopen_period', false, true),
  ('finance.view', 'finance', 'view', false, false),
  ('finance.view_consolidated', 'finance', 'view_consolidated', false, true),
  ('google_calendar.connect_own_account', 'google_calendar', 'connect_own_account', false, false),
  ('google_calendar.disconnect_own_account', 'google_calendar', 'disconnect_own_account', false, false),
  ('google_calendar.sync_own_events', 'google_calendar', 'sync_own_events', false, false),
  ('google_calendar.view', 'google_calendar', 'view', false, false),
  ('payments.create', 'payments', 'create', false, false),
  ('payments.delete', 'payments', 'delete', false, false),
  ('payments.edit', 'payments', 'edit', false, false),
  ('payments.view', 'payments', 'view', false, false),
  ('payments.view_consolidated', 'payments', 'view_consolidated', false, true),
  ('permissions.manage', 'permissions', 'manage', true, false),
  ('permissions.view', 'permissions', 'view', true, false),
  ('settings.edit', 'settings', 'edit', false, false),
  ('settings.view', 'settings', 'view', false, false),
  ('students.create', 'students', 'create', false, false),
  ('students.delete', 'students', 'delete', false, false),
  ('students.edit', 'students', 'edit', false, false),
  ('students.view', 'students', 'view', false, false),
  ('teachers.create', 'teachers', 'create', false, false),
  ('teachers.delete', 'teachers', 'delete', false, false),
  ('teachers.edit', 'teachers', 'edit', false, false),
  ('teachers.view', 'teachers', 'view', false, false)
ON CONFLICT (permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.eavra_admin_permissions_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_actor text := auth.uid()::text;
  v_snapshot jsonb;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor AND p.role = 'super_admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'catalog', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', c.permission_key,
        'module', c.module,
        'action', c.action,
        'reserved', c.reserved_super_admin,
        'admin_only', c.admin_only
      ) ORDER BY c.permission_key)
      FROM app_private.eavra_permission_catalog c
    ), '[]'::jsonb),
    'role_rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'role', r.role, 'key', r.permission_key, 'decision', r.decision,
        'scope', r.scope
      ) ORDER BY r.role, r.permission_key)
      FROM app_private.eavra_role_permissions r
    ), '[]'::jsonb),
    'user_rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'profile_id', u.profile_id, 'key', u.permission_key,
        'decision', u.decision, 'scope', u.scope
      ) ORDER BY u.profile_id, u.permission_key)
      FROM app_private.eavra_user_permission_overrides u
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  RETURN v_snapshot;
END;
$function$;

CREATE OR REPLACE FUNCTION public.eavra_admin_save_permission(p_subject_type text, p_target text, p_permission_key text, p_decision text, p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_actor text := auth.uid()::text;
  v_reserved boolean;
  v_admin_only boolean;
  v_target_role text;
  v_previous jsonb;
  v_next jsonb;
  v_old_decision text;
  v_old_scope text;
  v_changed boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor AND p.role = 'super_admin' AND p.access_status = 'active'
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_subject_type NOT IN ('role', 'user')
     OR p_subject_type IS NULL
     OR p_target IS NULL OR length(trim(p_target)) = 0
     OR p_permission_key IS NULL OR length(trim(p_permission_key)) = 0
     OR p_decision NOT IN ('allow', 'deny', 'inherit') OR p_decision IS NULL
     OR p_scope NOT IN ('all', 'own', 'none') OR p_scope IS NULL
     OR (p_decision = 'allow' AND p_scope = 'none')
     OR (p_decision <> 'allow' AND p_scope <> 'none')
  THEN
    RAISE EXCEPTION 'invalid_permission_request' USING ERRCODE = '22023';
  END IF;

  SELECT c.reserved_super_admin, c.admin_only
    INTO v_reserved, v_admin_only
  FROM app_private.eavra_permission_catalog c
  WHERE c.permission_key = p_permission_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_permission' USING ERRCODE = '22023';
  END IF;
  IF v_reserved THEN
    RAISE EXCEPTION 'reserved_super_admin_permission' USING ERRCODE = '42501';
  END IF;

  IF p_subject_type = 'role' THEN
    IF p_target NOT IN ('admin', 'teacher') THEN
      RAISE EXCEPTION 'invalid_target_role' USING ERRCODE = '22023';
    END IF;
    v_target_role := p_target;
  ELSE
    SELECT p.role INTO v_target_role
    FROM public.profiles p
    WHERE p.id = p_target
      AND p.access_status = 'active'
      AND p.role IN ('admin', 'teacher')
      AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id::text = p.id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_or_unlinked_user_target' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_decision = 'allow' AND v_target_role = 'teacher'
     AND (v_admin_only OR p_scope <> 'own') THEN
    RAISE EXCEPTION 'teacher_permission_out_of_scope' USING ERRCODE = '42501';
  END IF;

  -- Serializa alterações concorrentes ao mesmo objeto/regra,
  -- incluindo quando a regra ainda não existe.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('eavra09:' || p_subject_type || ':' || p_target),
    pg_catalog.hashtext(p_permission_key)
  );

  IF p_subject_type = 'role' THEN
    SELECT r.decision, r.scope INTO v_old_decision, v_old_scope
    FROM app_private.eavra_role_permissions r
    WHERE r.role = p_target AND r.permission_key = p_permission_key
    FOR UPDATE;
  ELSE
    SELECT u.decision, u.scope INTO v_old_decision, v_old_scope
    FROM app_private.eavra_user_permission_overrides u
    WHERE u.profile_id = p_target AND u.permission_key = p_permission_key
    FOR UPDATE;
  END IF;
  IF FOUND THEN
    v_previous := jsonb_build_object('decision', v_old_decision, 'scope', v_old_scope);
  ELSE
    v_previous := NULL;
  END IF;

  IF p_decision = 'inherit' THEN
    v_next := NULL;
  ELSE
    v_next := jsonb_build_object('decision', p_decision, 'scope', p_scope);
  END IF;
  v_changed := v_previous IS DISTINCT FROM v_next;

  IF NOT v_changed THEN
    RETURN jsonb_build_object('changed', false, 'subject_type', p_subject_type,
      'target', p_target, 'permission_key', p_permission_key, 'rule', v_next);
  END IF;

  IF p_subject_type = 'role' THEN
    IF p_decision = 'inherit' THEN
      DELETE FROM app_private.eavra_role_permissions
      WHERE role = p_target AND permission_key = p_permission_key;
    ELSE
      INSERT INTO app_private.eavra_role_permissions
        (role, permission_key, decision, scope, updated_at)
      VALUES (p_target, p_permission_key, p_decision, p_scope, now())
      ON CONFLICT (role, permission_key) DO UPDATE
      SET decision = EXCLUDED.decision, scope = EXCLUDED.scope,
          updated_at = now();
    END IF;
  ELSE
    IF p_decision = 'inherit' THEN
      DELETE FROM app_private.eavra_user_permission_overrides
      WHERE profile_id = p_target AND permission_key = p_permission_key;
    ELSE
      INSERT INTO app_private.eavra_user_permission_overrides
        (profile_id, permission_key, decision, scope, changed_by, updated_at)
      VALUES (p_target, p_permission_key, p_decision, p_scope, v_actor, now())
      ON CONFLICT (profile_id, permission_key) DO UPDATE
      SET decision = EXCLUDED.decision, scope = EXCLUDED.scope,
          changed_by = EXCLUDED.changed_by, updated_at = now();
    END IF;
  END IF;

  INSERT INTO app_private.eavra_permission_audit_log (
    actor_auth_id, target_profile_id, permission_key, change_type,
    before_state, after_state
  ) VALUES (
    v_actor, CASE WHEN p_subject_type = 'user' THEN p_target ELSE NULL END,
    p_permission_key, p_subject_type || '_rule',
    v_previous, v_next
  );

  RETURN jsonb_build_object('changed', true, 'subject_type', p_subject_type,
    'target', p_target, 'permission_key', p_permission_key, 'rule', v_next);
END;
$function$;
-- RPCs do painel, acessíveis apenas a usuários autenticados;
-- seu código verifica Super Admin ativo via auth.uid e profiles.
REVOKE ALL ON FUNCTION public.eavra_admin_permissions_snapshot() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.eavra_admin_save_permission(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_admin_permissions_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_admin_save_permission(text,text,text,text,text) TO authenticated;
COMMIT;
