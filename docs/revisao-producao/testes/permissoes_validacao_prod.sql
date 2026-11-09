-- Validação do painel com papéis distintos. Somente fixtures.
-- Teste de privilégios PostgreSQL separado de segurança de lógica.
DO $$
BEGIN
 IF has_function_privilege('anon','public.eavra_admin_permissions_snapshot()','EXECUTE')
 OR has_function_privilege('anon','public.eavra_admin_save_permission(text,text,text,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'anon_execute_exposed';
 END IF;
 IF NOT has_function_privilege('authenticated','public.eavra_admin_permissions_snapshot()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.eavra_admin_save_permission(text,text,text,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'authenticated_rpc_inaccessible';
 END IF;
 IF has_table_privilege('authenticated','app_private.eavra_user_permission_overrides','SELECT')
 OR has_table_privilege('anon','app_private.eavra_permission_audit_log','SELECT') THEN
  RAISE EXCEPTION 'private_permissions_exposed';
 END IF;
 IF (select count(*) from app_private.eavra_permission_catalog)<>52
 OR NOT EXISTS(SELECT 1 FROM app_private.eavra_permission_catalog WHERE permission_key='permissions.manage' AND reserved_super_admin)
 THEN RAISE EXCEPTION 'permission_catalog_invalid'; END IF;
END
$$;

-- Acesso negado para professor, super admin bloqueado e visitante.
DO $$
DECLARE blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
 blocked:=false;
 BEGIN PERFORM public.eavra_admin_permissions_snapshot();
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'teacher_read_not_blocked'; END IF;
 blocked:=false;
 BEGIN PERFORM public.eavra_admin_save_permission('role','teacher','students.view','allow','own');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'teacher_write_not_blocked'; END IF;
 PERFORM set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
 blocked:=false;
 BEGIN PERFORM public.eavra_admin_permissions_snapshot();
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'blocked_super_admin_can_read'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',false);
 blocked:=false;
 BEGIN PERFORM public.eavra_admin_permissions_snapshot();
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'visitor_can_read'; END IF;
END
$$;

DO $$
DECLARE response jsonb; snap jsonb; blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 snap:=public.eavra_admin_permissions_snapshot();
 IF jsonb_array_length(snap->'catalog')<>52 THEN RAISE EXCEPTION 'snapshot_missing_catalog'; END IF;
 response:=public.eavra_admin_save_permission('role','teacher','students.view','allow','own');
 IF response->>'changed'<>'true' THEN RAISE EXCEPTION 'teacher_role_rule_not_saved'; END IF;
 response:=public.eavra_admin_save_permission('role','teacher','students.view','allow','own');
 IF response->>'changed'<>'false' THEN RAISE EXCEPTION 'idempotency_failed'; END IF;
 blocked:=false;
 BEGIN PERFORM public.eavra_admin_save_permission('role','teacher','payments.view_consolidated','allow','own');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'teacher_admin_only_allowed'; END IF;
 blocked:=false;
 BEGIN PERFORM public.eavra_admin_save_permission('role','admin','permissions.manage','allow','all');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'super_admin_reserved_permission_editable'; END IF;
 blocked:=false;
 BEGIN PERFORM public.eavra_admin_save_permission('role','teacher','students.view','allow','all');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'teacher_all_scope_allowed'; END IF;
 response:=public.eavra_admin_save_permission('user','33333333-3333-4333-8333-333333333333','students.view','deny','none');
 IF response->>'changed'<>'true' THEN RAISE EXCEPTION 'user_override_not_saved'; END IF;
 response:=public.eavra_admin_save_permission('user','33333333-3333-4333-8333-333333333333','students.view','inherit','none');
 IF response->>'changed'<>'true' THEN RAISE EXCEPTION 'inherit_reset_failed'; END IF;
 IF (SELECT count(*) FROM app_private.eavra_permission_audit_log)<>3 THEN RAISE EXCEPTION 'audit_count_bad'; END IF;
 IF (SELECT count(*) FROM app_private.eavra_user_permission_overrides)<>0 THEN RAISE EXCEPTION 'override_not_deleted'; END IF;
 IF (SELECT count(*) FROM app_private.eavra_role_permissions)<>1 THEN RAISE EXCEPTION 'unexpected_role_rules'; END IF;
END
$$;
-- Verifica que SQL não modificou cadastros legados.
DO $$
BEGIN
 IF (SELECT count(*) FROM public.profiles)<>4 THEN RAISE EXCEPTION 'legacy_profiles_changed'; END IF;
END
$$;
