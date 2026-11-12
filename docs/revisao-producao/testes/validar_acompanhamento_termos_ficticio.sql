-- Test only with disposable PostgreSQL fixture.
DO $tests$
DECLARE
 v_offer jsonb;
 v_token text;
 v_offer_id uuid;
 v_row jsonb;
 v_list jsonb;
 v_opened timestamptz;
 v_marked timestamptz;
 denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 v_offer:=public.eavra_dev_create_enrollment_offer_with_instrument(
 'raphael_individual','22222222-2222-4222-8222-222222222222',
 'plano-individual',NULL,current_date,current_date,10,350,
 'Termo fictício','Este é um texto fictício de validade contratual para testes.',current_date+1,'Canto');
 v_token:=v_offer->>'token'; v_offer_id:=(v_offer->>'id')::uuid;

 -- Database must not assume creation means sent.
 SELECT sent_at,first_opened_at INTO v_marked,v_opened
 FROM app_private.eavra_dev_enrollment_offers WHERE id=v_offer_id;
 IF v_marked IS NOT NULL OR v_opened IS NOT NULL THEN RAISE EXCEPTION 'created_assumed_sent_or_open'; END IF;

 -- Administrative listing requires explicit permission.
 PERFORM set_config('request.jwt.claim.sub','',false);
 denied:=false;
 BEGIN PERFORM public.eavra_dev_admin_enrollment_offers();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'anonymous_list_leaked'; END IF;

 -- Tracking a valid token without a Supabase user is allowed.
 PERFORM public.eavra_dev_track_enrollment_open(v_token);
 SELECT first_opened_at INTO v_opened
 FROM app_private.eavra_dev_enrollment_offers WHERE id=v_offer_id;
 IF v_opened IS NULL THEN RAISE EXCEPTION 'open_not_recorded'; END IF;
 PERFORM pg_sleep(0.01);
 PERFORM public.eavra_dev_track_enrollment_open(v_token);
 IF (SELECT first_opened_at FROM app_private.eavra_dev_enrollment_offers WHERE id=v_offer_id)<>v_opened
 THEN RAISE EXCEPTION 'first_open_was_overwritten'; END IF;

 -- Only administrator with create permission can mark an invitation sent.
 denied:=false;
 BEGIN PERFORM public.eavra_dev_admin_mark_enrollment_sent(v_offer_id,'Aluno exemplo');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'anonymous_sent_tracking_succeeded'; END IF;

 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 PERFORM public.eavra_dev_admin_mark_enrollment_sent(v_offer_id,'Aluno exemplo');
 SELECT sent_at INTO v_marked FROM app_private.eavra_dev_enrollment_offers WHERE id=v_offer_id;
 IF v_marked IS NULL THEN RAISE EXCEPTION 'sent_not_recorded'; END IF;

 v_list:=public.eavra_dev_admin_enrollment_offers();
 SELECT value INTO v_row FROM pg_catalog.jsonb_array_elements(v_list) value WHERE value->>'id'=v_offer_id::text;
 IF v_row IS NULL OR v_row->>'recipient_label'<>'Aluno exemplo'
 OR v_row->>'first_opened_at' IS NULL OR v_row->>'sent_at' IS NULL
 THEN RAISE EXCEPTION 'listing_wrong'; END IF;
 IF v_row ? 'token_hash' OR v_row ? 'token'
 THEN RAISE EXCEPTION 'confidential_token_leaked'; END IF;

 -- Expiration is derived from expires_at, never by deleting the term.
 UPDATE app_private.eavra_dev_enrollment_offers SET expires_at=now()-interval '1 minute' WHERE id=v_offer_id;
 IF NOT EXISTS(
 SELECT 1 FROM app_private.eavra_dev_enrollment_offers
 WHERE id=v_offer_id AND submitted_at IS NULL AND expires_at<now()
 ) THEN RAISE EXCEPTION 'expired_offer_missing'; END IF;
 IF (SELECT amount FROM public.transactions WHERE id='pagamento-antigo')<>350
 THEN RAISE EXCEPTION 'finance_changed'; END IF;
 RAISE NOTICE 'PASS: create, first open, authorization, manual sent, listing, expiry and finance';
END $tests$;
