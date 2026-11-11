-- Verificações reais de autorização sobre usuários e dados FICTÍCIOS.
DO $preflight$
BEGIN
 IF (SELECT count(*) FROM app_private.eavra_permission_catalog WHERE module IN ('digital_enrollment','rooms'))<>6
  THEN RAISE EXCEPTION 'feature_permissions_missing'; END IF;
 IF has_function_privilege('anon','public.eavra_current_feature_access()','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.eavra_current_feature_access()','EXECUTE')
   THEN RAISE EXCEPTION 'feature_access_rpc_grants_wrong'; END IF;
 IF has_function_privilege('authenticated','app_private.eavra_actor_has_feature_permission(text)','EXECUTE')
    OR has_function_privilege('anon','app_private.eavra_actor_has_feature_permission(text)','EXECUTE')
   THEN RAISE EXCEPTION 'private_permission_helper_exposed'; END IF;
END $preflight$;

DO $test$
DECLARE
 rights jsonb;
 denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{rooms,view}' <> 'false' OR rights#>>'{digital_enrollment,view}' <> 'false'
 THEN RAISE EXCEPTION 'anonymous_allowed'; END IF;

 PERFORM set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{rooms,view}' <> 'false' OR rights#>>'{digital_enrollment,view}' <> 'false'
 THEN RAISE EXCEPTION 'teacher_allowed_without_grant'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_room_overview(current_date);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'teacher_can_view_rooms'; END IF;

 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{rooms,view}' <> 'false' OR rights#>>'{digital_enrollment,view}' <> 'false'
 THEN RAISE EXCEPTION 'admin_allowed_without_grant'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_create_enrollment_offer_with_expiry(
   'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
   'plano-individual',NULL,current_date,current_date,10,350,
   'Termo de teste','Corpo fictício de teste sem dados reais',current_date+1);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'admin_can_create_without_grant'; END IF;

 -- Regras são configuradas normalmente pelo Super Admin, não por este usuário.
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 IF (public.eavra_current_feature_access()#>>'{rooms,assign}')<>'true'
   THEN RAISE EXCEPTION 'super_admin_rights_missing'; END IF;
 PERFORM public.eavra_admin_save_permission('role','admin','rooms.view','allow','all');
 PERFORM public.eavra_admin_save_permission('role','admin','digital_enrollment.view','allow','all');

 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{rooms,view}' <> 'true' OR rights#>>'{rooms,assign}' <> 'false'
 OR rights#>>'{digital_enrollment,view}' <> 'true' OR rights#>>'{digital_enrollment,create}' <> 'false'
 THEN RAISE EXCEPTION 'admin_read_only_rights_wrong %',rights; END IF;
 PERFORM public.eavra_dev_room_overview(current_date);
 PERFORM public.eavra_dev_admin_enrollment_inbox();
 denied:=false;
 BEGIN PERFORM public.eavra_dev_room_assign('aula-1','peniel','Teclado');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'admin_can_assign_without_grant'; END IF;

 -- Super Admin libera ação adicional e o banco observa imediatamente.
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 PERFORM public.eavra_admin_save_permission('role','admin','rooms.assign','allow','all');
 PERFORM public.eavra_admin_save_permission('role','admin','digital_enrollment.create','allow','all');
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{rooms,assign}' <> 'true'
 OR rights#>>'{digital_enrollment,create}' <> 'true' THEN
    RAISE EXCEPTION 'approved_write_rights_missing'; END IF;
 PERFORM public.eavra_dev_room_assign('aula-1','peniel','Teclado');

 -- Individual deny overrides broad role allow.
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 PERFORM public.eavra_admin_save_permission(
  'user','22222222-2222-4222-8222-222222222222','rooms.view','deny','none');
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{rooms,view}' <> 'false' OR rights#>>'{rooms,assign}' <> 'false'
 THEN RAISE EXCEPTION 'individual_deny_not_applied'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_room_overview(current_date);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'individual_denial_bypassed'; END IF;

 -- Mudar fraudulentamente role para super_admin NÃO substitui allowlist.
 UPDATE public.profiles SET role='super_admin'
  WHERE id='22222222-2222-4222-8222-222222222222';
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{rooms,view}' <> 'false' OR rights#>>'{digital_enrollment,view}' <> 'false'
 THEN RAISE EXCEPTION 'unlisted_fake_super_admin_allowed'; END IF;

 IF (SELECT amount FROM public.transactions WHERE id='pagamento-antigo')<>350
 THEN RAISE EXCEPTION 'financial_fixture_mutated'; END IF;
 RAISE NOTICE 'PASS: feature permissions isolated, default deny, actions, override and allowlist';
END $test$;
