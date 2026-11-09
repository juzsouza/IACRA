-- Verificações adicionais executadas apenas em PostgreSQL temporário com dados fictícios.
SET "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
DO $checks$
DECLARE
 v_before jsonb;
 v_after jsonb;
 v_first_offer jsonb;
 v_submit jsonb;
 v_id uuid;
 v_result jsonb;
 v_rejected boolean;
BEGIN
 v_before := (select jsonb_build_object(
  'students',count(*),'names',array_agg(name order by name)) from public.students);
 IF (SELECT count(*) FROM public.competence_billings WHERE status='paid') <> 1
 OR (SELECT count(*) FROM public.transactions WHERE id='pagamento-antigo' AND amount=350 AND status='completed')<>1 THEN
  RAISE EXCEPTION 'fixture_finance_mismatch';
 END IF;

 -- O contrato deve aceitar preço zero, quando secretaria autorizou.
 v_first_offer := public.eavra_dev_create_enrollment_offer_with_expiry(
   'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
   'plano-individual',NULL,CURRENT_DATE,CURRENT_DATE,10,0,
   'Termo de isenção','Contrato fictício com mensalidade isenta para fins de teste',CURRENT_DATE+1);
 IF (v_first_offer->>'token') IS NULL THEN RAISE EXCEPTION 'zero_fee_not_supported'; END IF;

 -- Consulta pública do convite apenas com token, nunca exposição direta da tabela.
 IF has_table_privilege('anon','app_private.eavra_dev_enrollment_offers','SELECT')
 OR has_table_privilege('authenticated','app_private.eavra_dev_enrollment_offers','SELECT')
 OR has_table_privilege('anon','app_private.eavra_dev_enrollment_submissions','SELECT') THEN
  RAISE EXCEPTION 'private_data_exposed';
 END IF;
 IF has_function_privilege('anon','public.eavra_dev_create_enrollment_offer_with_expiry(text,text,text,text,date,date,integer,numeric,text,text,date)','EXECUTE')
 OR has_function_privilege('anon','public.eavra_dev_room_assign(text,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'privileged_rpc_exposed';
 END IF;
 v_result:=public.eavra_dev_get_enrollment_offer(v_first_offer->>'token');
 IF (v_result->>'term_title') <> 'Termo de isenção' THEN RAISE EXCEPTION 'public_term_read_error'; END IF;

 -- Convidado não pode tentar usar token alterado.
 v_rejected:=false;
 BEGIN
  PERFORM public.eavra_dev_submit_enrollment(
    repeat('f',64),
    jsonb_build_object('name','Aluno Fictício','email','aluno@example.test',
    'phone','11999998888','cpf','12345678901',
    'birth_date','2010-05-05','instrument','Piano',
    'guardian_name','Responsavel','guardian_email','resp@example.test',
    'guardian_phone','11999999999','guardian_relationship','Pai'),true);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'invalid_token_accepted'; END IF;

 -- Menor precisa de responsável; não cria aluno nem matrícula nessa fase.
 v_rejected:=false;
 BEGIN
  PERFORM public.eavra_dev_submit_enrollment(
    v_first_offer->>'token',
    jsonb_build_object('name','Aluno Menor','email','aluno@example.test',
    'phone','11999998888','cpf','12345678901',
    'birth_date','2010-05-05','instrument','Piano'),true);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'minor_without_guardian_accepted'; END IF;

 -- O vencimento do termo não pode ser anterior ao dia da emissão.
 v_rejected:=false;
 BEGIN
  PERFORM public.eavra_dev_create_enrollment_offer_with_expiry(
   'individual_instruments_vocal','22222222-2222-4222-8222-222222222222',
   'plano-individual',NULL,CURRENT_DATE,CURRENT_DATE,10,350,
   'Termo fictício','Termo para testar expiração',CURRENT_DATE-1);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected:=true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'expired_offer_created'; END IF;

 -- Nenhuma escrita durante a emissão ou envio do convite em tabelas financeiras.
 IF (SELECT count(*) FROM public.competence_billings)<>1 OR
    (SELECT count(*) FROM public.transactions)<>1 OR
    (SELECT count(*) FROM public.enrollments)<>1 OR
    (SELECT count(*) FROM public.students)<>1 THEN
    RAISE EXCEPTION 'core_data_unexpectedly_changed';
 END IF;
 v_after := (select jsonb_build_object('students',count(*),'names',array_agg(name order by name)) from public.students);
 IF v_before <> v_after THEN RAISE EXCEPTION 'existing_student_changed'; END IF;
 RAISE NOTICE 'PASS: tipos reais, valor zero, menor, token, tabelas privadas e financeiro preservado';
END
$checks$;
