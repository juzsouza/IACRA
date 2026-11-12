-- Banco PostgreSQL fictício, sem qualquer conexão com o IACRA oficial.
DO $tests$
DECLARE
 rights jsonb;
 denied boolean;
 offer_id uuid;
 offers jsonb;
BEGIN
 -- Fixture anterior simula fraude de perfil. Restaure o papel apenas no teste.
 UPDATE public.profiles SET role='admin'
 WHERE id='22222222-2222-4222-8222-222222222222';
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{enrollment_tracking,view}' <> 'false'
 OR rights#>>'{enrollment_tracking,mark_sent}' <> 'false'
 THEN RAISE EXCEPTION 'tracking_was_granted_by_default'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_admin_enrollment_offers();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'ungranted_user_can_read_tracking'; END IF;

 -- Super Admin pode permitir APENAS acompanhamento a um admin.
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 PERFORM public.eavra_admin_save_permission(
 'user','22222222-2222-4222-8222-222222222222','digital_enrollment.view','deny','none');
 PERFORM public.eavra_admin_save_permission(
 'role','admin','enrollment_tracking.view','allow','all');
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{enrollment_tracking,view}' <> 'true'
 OR rights#>>'{enrollment_tracking,mark_sent}' <> 'false'
 OR rights#>>'{digital_enrollment,view}' <> 'false'
 THEN RAISE EXCEPTION 'tracking_not_independent_of_enrollment %',rights; END IF;
 offers:=public.eavra_dev_admin_enrollment_offers();
 IF pg_catalog.jsonb_typeof(offers)<>'array' THEN RAISE EXCEPTION 'tracking_result_invalid'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_admin_enrollment_inbox();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'tracking_can_read_full_enrollment_inbox'; END IF;

 SELECT id INTO offer_id FROM app_private.eavra_dev_enrollment_offers LIMIT 1;
 IF offer_id IS NULL THEN RAISE EXCEPTION 'missing_fictitious_offer'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_admin_mark_enrollment_sent(offer_id,'teste fictício');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'tracking_can_mark_sent_without_action'; END IF;

 -- Verified and restricted receipt RPC must be available to authorized tracking
 -- but must not leak unrelated or unapproved information.
 denied:=false;
 BEGIN PERFORM public.eavra_dev_tracking_read_approved_request(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'approved_receipt_not_scoped'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_tracking_read_approved_term(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'approved_term_not_scoped'; END IF;

 -- New "Registrar envio" permission is separately granted.
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 PERFORM public.eavra_admin_save_permission(
 'user','22222222-2222-4222-8222-222222222222','enrollment_tracking.mark_sent','allow','all');
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 IF (public.eavra_current_feature_access()#>>'{enrollment_tracking,mark_sent}')<>'true'
 THEN RAISE EXCEPTION 'mark_sent_permission_not_effective'; END IF;
 PERFORM public.eavra_dev_admin_mark_enrollment_sent(offer_id,'teste fictício');

 -- Individual denial takes precedence over role allowance.
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 PERFORM public.eavra_admin_save_permission(
 'user','22222222-2222-4222-8222-222222222222','enrollment_tracking.view','deny','none');
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 rights:=public.eavra_current_feature_access();
 IF rights#>>'{enrollment_tracking,view}' <> 'false'
 OR rights#>>'{enrollment_tracking,mark_sent}' <> 'false'
 THEN RAISE EXCEPTION 'view_denial_not_enforced'; END IF;
 denied:=false;
 BEGIN PERFORM public.eavra_dev_admin_enrollment_offers();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'denied_tracking_still_readable'; END IF;

 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 denied:=false;
 BEGIN PERFORM public.eavra_admin_save_permission(
 'role','teacher','enrollment_tracking.view','allow','all');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'teacher_granted_admin_tracking'; END IF;
 IF (SELECT amount FROM public.transactions WHERE id='pagamento-antigo')<>350
 THEN RAISE EXCEPTION 'payment_fixture_modified'; END IF;
 RAISE NOTICE 'PASS: independent view, mark sent, no full inbox, denied-by-default, user override, teacher prohibition and unchanged payment';
END $tests$;
