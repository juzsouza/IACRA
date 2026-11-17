-- IACRA PROD: Desconto coletivo do INJ alocado uma vez a cada matricula.
-- Compensacao de 1 aula do grupo cancelada em 17/10/2026.
-- 4 participantes x R$ 50 = R$ 200. Sem inserir recebimentos.
-- Tres creditos disponiveis e um ja consumido pelo pagamento existente.
-- O vinculo com a aula de origem permanece em notes; source_class_id=NULL
-- evita duplicidade do mapa legado source_class_id -> 1 credito na UI.
-- Conta existente (Thomas): somente reconcilia snapshot pendente para
-- transacao ja salva em 11/11 por R$50, sem inserir segunda receita.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';

DO $apply$
DECLARE v_count integer;
DECLARE v_rows integer;
BEGIN
  PERFORM 1 FROM public.groups
   WHERE id='a057febe-4dc3-469c-a84d-4b419b615593' AND teacher_id='dada085e-c187-43d2-9ab0-a9e0539df450'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INJ/teacher not confirmed'; END IF;

  PERFORM 1 FROM public.classes
   WHERE id='fe0061a6-1af2-44ac-a1ed-0adee0e0d276' AND group_id='a057febe-4dc3-469c-a84d-4b419b615593'
    AND date='2026-10-17'::date AND status='cancelled'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source cancellation not confirmed'; END IF;

  SELECT count(*) INTO v_count FROM public.enrollments e
   JOIN public.class_students cs ON cs.student_id=e.student_id
      AND cs.class_id='fe0061a6-1af2-44ac-a1ed-0adee0e0d276'
   WHERE e.group_id='a057febe-4dc3-469c-a84d-4b419b615593' AND e.status='active'
      AND e.custom_price=100 AND e.teacher_id='dada085e-c187-43d2-9ab0-a9e0539df450'
      AND e.start_date<='2026-10-17'::date;
  IF v_count<>4 THEN RAISE EXCEPTION 'participant cohort changed: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM public.competence_billings b
   JOIN public.enrollments e ON e.id=b.enrollment_id
   WHERE e.group_id='a057febe-4dc3-469c-a84d-4b419b615593' AND e.status='active'
     AND b.competence='2026-11' AND b.category='individual'
     AND b.status='pending' AND b.transaction_id IS NULL
     AND b.is_frozen IS FALSE AND b.final_price=100 AND b.discount=0;
  IF v_count<>4 THEN RAISE EXCEPTION 'November billing state changed: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM public.credits
   WHERE group_id='a057febe-4dc3-469c-a84d-4b419b615593'
      OR source_class_id='fe0061a6-1af2-44ac-a1ed-0adee0e0d276'
      OR id LIKE 'inj-20261017-nov26-%';
  IF v_count<>0 THEN RAISE EXCEPTION 'INJ credit exists; manual review required'; END IF;

  SELECT count(*) INTO v_count FROM public.transactions
   WHERE id='d536797c-c3c2-4d58-a417-7784da64a88b'
      AND type='income' AND status='completed'
      AND amount=400
      AND description LIKE 'Mensalidade Grupo | a057febe-4dc3-469c-a84d-4b419b615593 | 10/2026 |%';
  IF v_count<>1 THEN RAISE EXCEPTION 'October collective receipt changed'; END IF;

  SELECT count(*) INTO v_count FROM public.transactions t
    JOIN public.enrollments e ON
     t.description LIKE 'Mensalidade | '||e.id||' | 11/2026 |%'
   WHERE e.group_id='a057febe-4dc3-469c-a84d-4b419b615593' AND e.status='active'
     AND t.type='income' AND t.status='completed'
     AND t.id='6bfa6d06-a367-4363-b875-9dcb04cd4128' AND e.id='b71df563-f18d-4d1a-9781-9361842197c7'
     AND t.amount=50 AND t.date='2026-11-11'::date;
  IF v_count<>1 THEN RAISE EXCEPTION 'existing R$50 receipt changed'; END IF;

  SELECT count(*) INTO v_count FROM public.transactions t
    JOIN public.enrollments e ON
     t.description LIKE 'Mensalidade | '||e.id||' | 11/2026 |%'
   WHERE e.group_id='a057febe-4dc3-469c-a84d-4b419b615593' AND e.status='active'
     AND t.type='income' AND t.status='completed';
  IF v_count<>1 THEN RAISE EXCEPTION 'additional November payment detected: %',v_count; END IF;

  INSERT INTO public.credits
    (id,teacher_id,student_id,enrollment_id,group_id,source_class_id,
     amount,status,competency_month,used_date,notes)
  SELECT
    'inj-20261017-nov26-'||e.id,
    'dada085e-c187-43d2-9ab0-a9e0539df450'::uuid,
    e.student_id::uuid,e.id,'a057febe-4dc3-469c-a84d-4b419b615593',NULL,
    50,CASE WHEN e.id='b71df563-f18d-4d1a-9781-9361842197c7' THEN 'used' ELSE 'available' END,
    '2026-10',
    CASE WHEN e.id='b71df563-f18d-4d1a-9781-9361842197c7' THEN '2026-11-11'::date ELSE NULL END,
    'Ajuste autorizado INJ: desconto de R$50 na mensalidade de novembro/2026 por aula do grupo cancelada em 17/10/2026. Origem aula: fe0061a6-1af2-44ac-a1ed-0adee0e0d276.'
    || CASE WHEN e.id='b71df563-f18d-4d1a-9781-9361842197c7' THEN ' Ja aplicado no pagamento 6bfa6d06-a367-4363-b875-9dcb04cd4128; nao aplicar novamente.' ELSE ' Pendente de uso exclusivo nesta matricula.' END
  FROM public.enrollments e
  JOIN public.class_students cs ON cs.student_id=e.student_id AND cs.class_id='fe0061a6-1af2-44ac-a1ed-0adee0e0d276'
  WHERE e.group_id='a057febe-4dc3-469c-a84d-4b419b615593' AND e.status='active'
     AND e.custom_price=100 AND e.teacher_id='dada085e-c187-43d2-9ab0-a9e0539df450'
     AND e.start_date<='2026-10-17'::date;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>4 THEN RAISE EXCEPTION 'Expected 4 credits, inserted %',v_rows; END IF;

  -- O recibo de R$50 preexistente pertence a novembro, mas seu snapshot
  -- nao foi concluido; vincular sem registrar novo pagamento.
  UPDATE public.competence_billings b SET
    status='paid',
    final_price=50,
    discount=50,
    transaction_id='6bfa6d06-a367-4363-b875-9dcb04cd4128'::uuid,
    is_frozen=true,
    frozen_at=now(),
    metadata=coalesce(b.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'source','historical_payment_credit_reconciliation',
        'reconciled_at',now(),
        'previous_snapshot_source',b.metadata->>'source',
        'credit_adjustment',jsonb_build_object(
           'amount',50,'competence','2026-11','origin_month','2026-10',
           'origin_group','a057febe-4dc3-469c-a84d-4b419b615593',
           'origin_class','fe0061a6-1af2-44ac-a1ed-0adee0e0d276',
           'credit_id','inj-20261017-nov26-b71df563-f18d-4d1a-9781-9361842197c7',
           'already_paid_transaction_id','6bfa6d06-a367-4363-b875-9dcb04cd4128'
        )
      )
  WHERE b.id='9386e9c4-fd43-4179-b272-62dc584985c5' AND b.enrollment_id='b71df563-f18d-4d1a-9781-9361842197c7'
    AND b.competence='2026-11' AND b.category='individual'
    AND b.status='pending' AND b.transaction_id IS NULL
    AND b.is_frozen=false AND b.final_price=100 AND b.discount=0;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Historical paid snapshot could not be reconciled'; END IF;

  SELECT count(*) INTO v_count FROM public.credits
   WHERE id LIKE 'inj-20261017-nov26-%'
     AND group_id='a057febe-4dc3-469c-a84d-4b419b615593'
     AND amount=50 AND competency_month='2026-10';
  IF v_count<>4 THEN RAISE EXCEPTION 'Credit insert verification failed'; END IF;

  SELECT count(*) INTO v_count FROM public.credits
   WHERE id LIKE 'inj-20261017-nov26-%' AND status='available';
  IF v_count<>3 THEN RAISE EXCEPTION 'Available credits differ from 3'; END IF;

  SELECT count(*) INTO v_count FROM public.competence_billings
   WHERE id='9386e9c4-fd43-4179-b272-62dc584985c5' AND status='paid' AND transaction_id='6bfa6d06-a367-4363-b875-9dcb04cd4128'
      AND is_frozen=true AND final_price=50 AND discount=50;
  IF v_count<>1 THEN RAISE EXCEPTION 'Historical settlement not linked'; END IF;
END;
$apply$;

-- Change this final directive to ROLLBACK for dry-run.
COMMIT;
