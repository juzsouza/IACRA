-- Only synthetic PostgreSQL fixture. Check privilege escalation cannot bypass private allowlist.
DO $test$
DECLARE
 denied boolean;
BEGIN
 IF (SELECT count(*) FROM app_private.eavra_admin_allowlist) <> 1 THEN
   RAISE EXCEPTION 'test_allowlist_not_initialized';
 END IF;
 -- Simulate a public.profiles elevation. This user is NOT on the immutable allowlist.
 UPDATE public.profiles SET role='super_admin'
 WHERE id='22222222-2222-4222-8222-222222222222';

 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);

 denied := false;
 BEGIN
   PERFORM public.eavra_dev_admin_enrollment_inbox();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'admin_inbox_privilege_escalation'; END IF;

 denied := false;
 BEGIN
   PERFORM public.eavra_dev_create_enrollment_offer_with_expiry(
     'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
     'plano-individual',NULL,CURRENT_DATE,CURRENT_DATE,10,350,
     'Termo teste','Corpo de termo para testar bloqueio de escalada',CURRENT_DATE+1);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'create_offer_privilege_escalation'; END IF;

 denied := false;
 BEGIN
   PERFORM public.eavra_dev_room_overview(CURRENT_DATE);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'rooms_privilege_escalation'; END IF;

 -- restore test fixture
 UPDATE public.profiles SET role='admin'
 WHERE id='22222222-2222-4222-8222-222222222222';
 RAISE NOTICE 'PASS: spoofed super_admin cannot issue offers, see inbox or see rooms';
END
$test$;
