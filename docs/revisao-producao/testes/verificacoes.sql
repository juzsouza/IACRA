-- Verificações automáticas, apenas sobre dados fictícios do banco temporário.
-- Bloqueia erros que poderiam duplicar alunos e matrículas, violar validade ou ocupar salas duas vezes.
SET "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';

DO $tests$
DECLARE
 v_offer jsonb;
 v_submit jsonb;
 v_match jsonb;
 v_approved jsonb;
 v_read jsonb;
 v_token text;
 v_token2 text;
 v_id uuid;
 v_stored uuid;
 v_rooms jsonb;
 v_has_conflict boolean := false;
 v_failed_expected boolean := false;
BEGIN
 -- Controle de acesso: somente os dois endpoints com token podem ser usados sem login.
 IF NOT has_function_privilege('anon','public.eavra_dev_get_enrollment_offer(text)','EXECUTE')
    OR NOT has_function_privilege('anon','public.eavra_dev_submit_enrollment(text,jsonb,boolean)','EXECUTE')
    OR has_function_privilege('anon','public.eavra_dev_approve_enrollment_review(uuid,boolean,boolean)','EXECUTE')
    OR has_function_privilege('anon','public.eavra_dev_room_assign(text,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'permissions_incorrect';
 END IF;

 -- Prazo manual do convite.
 BEGIN
   PERFORM public.eavra_dev_create_enrollment_offer_with_expiry(
     'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
     'plano-individual',NULL,CURRENT_DATE,CURRENT_DATE,10,350,
     'Termo de teste','Corpo de teste para matrícula digital',CURRENT_DATE-1);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_failed_expected := true;
 END;
 IF NOT v_failed_expected THEN RAISE EXCEPTION 'expiration_allows_past_date'; END IF;

 v_offer := public.eavra_dev_create_enrollment_offer_with_expiry(
   'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
   'plano-individual',NULL,CURRENT_DATE,CURRENT_DATE,10,350,
   'Termo de teste','Corpo de teste para matrícula digital',CURRENT_DATE+1);
 v_token := v_offer->>'token';
 IF v_token IS NULL OR length(v_token)<>64
 OR (v_offer->>'expires_on')<>(CURRENT_DATE+1)::text THEN
   RAISE EXCEPTION 'offer_expiration_invalid';
 END IF;
 v_read := public.eavra_dev_get_enrollment_offer(v_token);
 IF v_read->>'term_title'<>'Termo de teste' THEN
   RAISE EXCEPTION 'offer_cannot_be_read';
 END IF;

 -- Aluno existente: histórico de aceite válido sem novo cadastro.
 v_submit := public.eavra_dev_submit_enrollment(
 v_token,
 pg_catalog.jsonb_build_object(
 'name','Aluno Existente','email','atualizado@example.test','phone','11987654321',
 'cpf','12345678901','birth_date','2010-05-05','instrument','Piano',
 'guardian_name','Responsavel Exemplo','guardian_email','responsavel@example.test',
 'guardian_phone','11999999999','guardian_relationship','Mae','guardian_cpf','12345678901'),
 true);
 v_id:=(v_submit->>'request_id')::uuid;
 v_match:=public.eavra_dev_admin_review_student_match(v_id);
 IF (v_match->>'match_count')::int<>1 OR
    v_match->>'matching_enrollment_id'<>'matricula-antiga' THEN
   RAISE EXCEPTION 'existing_student_not_found';
 END IF;
 v_approved:=public.eavra_dev_approve_enrollment_review(v_id,false,false);
 IF v_approved->>'student_reused'<>'true'
    OR v_approved->>'enrollment_reused'<>'true' THEN
   RAISE EXCEPTION 'existing_student_was_duplicated';
 END IF;
 IF (SELECT count(*) FROM public.students)<>1
 OR (SELECT count(*) FROM public.enrollments)<>1
 OR (SELECT email FROM public.students WHERE id='33333333-3333-4333-8333-333333333333')<>'antigo@example.test' THEN
   RAISE EXCEPTION 'existing_student_data_modified';
 END IF;
 v_read:=public.eavra_dev_admin_read_term(v_id);
 IF v_read->>'guardian_name'<>'Responsavel Exemplo' THEN
   RAISE EXCEPTION 'guardian_not_retained_in_signed_term';
 END IF;

 -- Novo aluno menor de idade: responsável obrigatório, aluno UUID válido.
 v_offer:=public.eavra_dev_create_enrollment_offer_with_expiry(
   'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
   'plano-individual',NULL,CURRENT_DATE,CURRENT_DATE,10,350,
   'Segundo Termo','Termo de teste para outro aluno',CURRENT_DATE+1);
 v_token2:=v_offer->>'token';
 v_submit:=public.eavra_dev_submit_enrollment(v_token2,pg_catalog.jsonb_build_object(
 'name','Novo Aluno Exemplo','email','novo@example.test','phone','11988888888',
 'cpf','98765432100','birth_date','2012-07-04','instrument','Teclado',
 'guardian_name','Responsavel Dois','guardian_email','responsavel2@example.test',
 'guardian_phone','11999999999','guardian_relationship','Pai'),true);
 v_id:=(v_submit->>'request_id')::uuid;
 v_approved:=public.eavra_dev_approve_enrollment_review(v_id,false,false);
 v_stored:=(v_approved->>'student_id')::uuid;
 IF NOT EXISTS (SELECT 1 FROM public.students WHERE id=v_stored)
 OR NOT EXISTS (SELECT 1 FROM app_private.eavra_dev_student_guardians WHERE student_id=v_stored)
 OR (SELECT count(*) FROM public.students)<>2
 OR (SELECT count(*) FROM public.enrollments)<>2 THEN
  RAISE EXCEPTION 'new_student_or_guardian_invalid';
 END IF;

 -- Registrar outro termo para aluno antigo: uma pessoa pode assinar novamente.
 v_offer:=public.eavra_dev_create_enrollment_offer_with_expiry(
   'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
   'plano-individual',NULL,CURRENT_DATE,CURRENT_DATE,10,350,
   'Termo Renovado','Renovacao do termo para aluno existente',CURRENT_DATE+1);
 v_submit:=public.eavra_dev_submit_enrollment(v_offer->>'token',pg_catalog.jsonb_build_object(
 'name','Aluno Existente','email','antigo@example.test','phone','11987654321',
 'cpf','12345678901','birth_date','2010-05-05','instrument','Piano',
 'guardian_name','Responsavel Exemplo','guardian_email','responsavel@example.test',
 'guardian_phone','11999999999','guardian_relationship','Mae'),true);
 v_id:=(v_submit->>'request_id')::uuid;
 PERFORM public.eavra_dev_approve_enrollment_review(v_id,false,false);
 IF (SELECT count(*) FROM app_private.eavra_dev_enrollment_submissions)<>3
 OR (SELECT count(*) FROM public.students)<>2 THEN
  RAISE EXCEPTION 'repeated_term_was_rejected';
 END IF;

 -- Salas: impedir reservas simultâneas para a mesma sala.
 PERFORM public.eavra_dev_room_assign('aula-1','peniel','Teclado');
 BEGIN
   PERFORM public.eavra_dev_room_assign('aula-2','peniel','Teclado');
 EXCEPTION WHEN SQLSTATE '23505' THEN v_has_conflict := true;
 END;
 IF NOT v_has_conflict THEN RAISE EXCEPTION 'room_double_booking_allowed'; END IF;
 v_rooms := public.eavra_dev_room_overview(CURRENT_DATE);
 IF pg_catalog.jsonb_array_length(v_rooms->'rooms')<>7
 OR pg_catalog.jsonb_array_length(v_rooms->'assignments')<>1 THEN
   RAISE EXCEPTION 'room_overview_incorrect';
 END IF;
 PERFORM public.eavra_dev_room_unassign('aula-1');
 IF (SELECT count(*) FROM app_private.eavra_dev_class_rooms)<>0 THEN
   RAISE EXCEPTION 'room_release_failed';
 END IF;

 -- Transação do banco de teste, criada antes da migração, permaneceu igual.
 IF (SELECT count(*) FROM public.transactions)<>1
 OR (SELECT amount FROM public.transactions WHERE id='pagamento-antigo')<>350 THEN
  RAISE EXCEPTION 'financial_data_modified';
 END IF;
 RAISE NOTICE 'TODOS OS TESTES SQL CONCLUÍDOS COM SUCESSO';
END
$tests$;

-- Tabelas novas devem estar protegidas contra acesso direto de usuários externos.
DO $perms$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['eavra_dev_enrollment_offers','eavra_dev_enrollment_submissions',
   'eavra_dev_student_guardians','eavra_dev_rooms','eavra_dev_class_rooms'] LOOP
  IF has_table_privilege('anon', 'app_private.'||t, 'SELECT')
   OR has_table_privilege('authenticated','app_private.'||t,'SELECT') THEN
    RAISE EXCEPTION 'private_table_exposed: %',t;
  END IF;
 END LOOP;
END
$perms$;
