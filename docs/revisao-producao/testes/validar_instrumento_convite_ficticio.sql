-- Testes APENAS em PostgreSQL descartável (não produção).
DO $tests$
DECLARE
 v jsonb;
 v_old jsonb;
 v_token text;
 v_old_token text;
 v_id uuid;
 v_offer jsonb;
 v_submitted jsonb;
 v_data jsonb;
 denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='app_private' AND table_name='eavra_dev_enrollment_offers' AND column_name='instrument')<>1
 THEN RAISE EXCEPTION 'instrument_column_missing'; END IF;
 -- All previous RPCs still require their original authorization.
 denied:=false;
 PERFORM set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
 BEGIN
   PERFORM public.eavra_dev_create_enrollment_offer_with_instrument(
   'raphael_individual','22222222-2222-4222-8222-222222222222','plano-individual',
   null,current_date,current_date,10,350,'Termo fictício',
   'Texto de condições fictícias para testes isolados',current_date+1,'Piano');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'unauthorized_offer_created'; END IF;
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

 denied:=false;
 BEGIN
   PERFORM public.eavra_dev_create_enrollment_offer_with_instrument(
   'raphael_individual','22222222-2222-4222-8222-222222222222','plano-individual',
   null,current_date,current_date,10,350,'Termo fictício',
   'Texto de condições fictícias para testes isolados',current_date+1,'X');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'short_instrument_accepted'; END IF;

 v:=public.eavra_dev_create_enrollment_offer_with_instrument(
   'raphael_individual','22222222-2222-4222-8222-222222222222','plano-individual',
   null,current_date,current_date,10,350,'Termo fictício',
   'Texto de condições fictícias para testes isolados',current_date+1,'Violão');
 v_id:=(v->>'id')::uuid; v_token:=v->>'token';
 IF v_token IS NULL OR length(v_token)<>64 OR
    (SELECT instrument FROM app_private.eavra_dev_enrollment_offers WHERE id=v_id)<>'Violão'
 THEN RAISE EXCEPTION 'fixed_instrument_not_saved'; END IF;
 v_offer:=public.eavra_dev_get_enrollment_offer(v_token);
 IF v_offer->>'instrument'<>'Violão' THEN RAISE EXCEPTION 'fixed_instrument_not_visible'; END IF;

 -- Attacker modifies the client instrument, but database must use the secretariat value.
 v_submitted:=public.eavra_dev_submit_enrollment(v_token,pg_catalog.jsonb_build_object(
 'name','Aluno Exemplo Fictício','email','test@example.test','phone','11987654321',
 'cpf','12345678909','birth_date','1990-02-02','instrument','Outro instrumento'),true);
 IF v_submitted->>'submitted'<>'true' THEN RAISE EXCEPTION 'submission_failed'; END IF;
 SELECT student_data INTO v_data FROM app_private.eavra_dev_enrollment_submissions WHERE offer_id=v_id;
 IF v_data->>'instrument'<>'Violão' THEN RAISE EXCEPTION 'instrument_tampering_succeeded'; END IF;

 -- Legacy invitations still keep existing input behavior.
 v_old:=public.eavra_dev_create_enrollment_offer_with_expiry(
   'raphael_individual','22222222-2222-4222-8222-222222222222','plano-individual',
   null,current_date,current_date,10,350,'Termo antigo',
   'Texto legado fictício para teste de compatibilidade',current_date+1);
 v_old_token:=v_old->>'token';
 v_offer:=public.eavra_dev_get_enrollment_offer(v_old_token);
 IF v_offer->>'instrument' IS NOT NULL THEN RAISE EXCEPTION 'legacy_instrument_not_null'; END IF;
 v_submitted:=public.eavra_dev_submit_enrollment(v_old_token,pg_catalog.jsonb_build_object(
 'name','Outro Aluno Fictício','email','legacy@example.test','phone','11987654321',
 'cpf','12345678908','birth_date','1990-02-02','instrument','Canto'),true);
 SELECT student_data INTO v_data FROM app_private.eavra_dev_enrollment_submissions
  WHERE offer_id=(v_old->>'id')::uuid;
 IF v_data->>'instrument'<>'Canto' THEN RAISE EXCEPTION 'legacy_invitation_broken'; END IF;

 IF (SELECT amount FROM public.transactions WHERE id='pagamento-antigo')<>350
   THEN RAISE EXCEPTION 'financial_fixture_was_modified'; END IF;
 RAISE NOTICE 'PASS: fixed instrument, validation, old links, authorization and payment preservation';
END $tests$;
