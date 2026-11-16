-- APENAS PARA IACRA-DEV, NUNCA EXECUTAR NO BANCO OFICIAL.
-- Simula duas pessoas aceitando o MESMO link, sem alterar registros existentes.
-- Todas as alterações (funções, índices, convites e aceites fictícios)
-- ocorrem em uma única transação e são desfeitas pelo ROLLBACK.
-- Se houver erro, NÃO clicar em COMMIT. Enviar a mensagem de erro.
BEGIN;

DO $preflight$
BEGIN
 IF (SELECT COUNT(*) FROM app_private.eavra_dev_enrollment_offers) <> 3
    OR (SELECT COUNT(*) FROM app_private.eavra_dev_enrollment_submissions) <> 3
    OR (SELECT md5(pg_get_functiondef('public.eavra_dev_get_enrollment_offer(text)'::regprocedure)))
       <> '738219a39179367077b70bad952a5f5a'
    OR (SELECT md5(pg_get_functiondef('public.eavra_dev_submit_enrollment(text,jsonb,boolean)'::regprocedure)))
       <> 'ec082e0ff56873688664b4cbc14b685c'
    OR EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='app_private'
        AND table_name='eavra_dev_enrollment_offers'
        AND column_name='instrument'
    )
    OR to_regclass('app_private.eavra_multi_use_offer_whitelist') IS NOT NULL
 THEN
    RAISE EXCEPTION 'Ambiente diferente do IACRA-DEV conferido. NENHUMA MUDANCA AUTORIZADA.';
 END IF;
 IF EXISTS (
   SELECT 1 FROM app_private.eavra_dev_enrollment_offers
   WHERE id in ('00000000-0000-4000-8000-000000000926'::uuid,'00000000-0000-4000-8000-000000000927'::uuid)
 ) THEN RAISE EXCEPTION 'IDs ficticios ja utilizados'; END IF;
END;
$preflight$;

-- Duas ofertas fictícias no mesmo ambiente, baseadas no modelo de oferta DEV.
-- Não copia nome, CPF nem token confidencial de qualquer aluno.
INSERT INTO app_private.eavra_dev_enrollment_offers (
 id,token_hash,model_id,teacher_id,plan_id,group_id,start_date,
 enrollment_date,due_day,monthly_amount,term_title,term_body,
 created_by,created_at,expires_at,submitted_at
)
SELECT
 '00000000-0000-4000-8000-000000000926'::uuid,pg_catalog.encode(extensions.digest('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','sha256'),'hex'),
 model_id,teacher_id,plan_id,group_id,start_date,enrollment_date,
 due_day,monthly_amount,'TESTE DE USO COLETIVO','Termo ficticio apenas para homologacao',
 created_by,now(),now()+interval '2 days',NULL
FROM app_private.eavra_dev_enrollment_offers
ORDER BY created_at DESC LIMIT 1;

INSERT INTO app_private.eavra_dev_enrollment_offers (
 id,token_hash,model_id,teacher_id,plan_id,group_id,start_date,
 enrollment_date,due_day,monthly_amount,term_title,term_body,
 created_by,created_at,expires_at,submitted_at
)
SELECT
 '00000000-0000-4000-8000-000000000927'::uuid,pg_catalog.encode(extensions.digest('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','sha256'),'hex'),
 model_id,teacher_id,plan_id,group_id,start_date,enrollment_date,
 due_day,monthly_amount,'TESTE LINK COMUM','Termo ficticio de uso unico',
 created_by,now(),now()+interval '2 days',NULL
FROM app_private.eavra_dev_enrollment_offers
WHERE id='00000000-0000-4000-8000-000000000926'::uuid;

-- Versão compatível com o DEV das mesmas regras previstas para produção.
CREATE TABLE IF NOT EXISTS app_private.eavra_multi_use_offer_whitelist (
  offer_id uuid PRIMARY KEY REFERENCES app_private.eavra_dev_enrollment_offers(id) ON DELETE RESTRICT
    CHECK (offer_id = '00000000-0000-4000-8000-000000000926'::uuid),
  active boolean NOT NULL DEFAULT false,
  activated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.eavra_multi_use_offer_whitelist FROM PUBLIC, anon, authenticated;

-- A restricao atual impede mais de uma submissao por convite.
-- O novo indice parcial mantem unicidade para todas as outras ofertas,
-- sem criar colunas controlaveis na tabela de aceites.
CREATE UNIQUE INDEX eavra_dev_enrollment_single_offer_unique_20261116
 ON app_private.eavra_dev_enrollment_submissions (offer_id)
 WHERE offer_id <> '00000000-0000-4000-8000-000000000926'::uuid;

ALTER TABLE app_private.eavra_dev_enrollment_submissions
 DROP CONSTRAINT eavra_dev_enrollment_submissions_offer_id_key;

CREATE OR REPLACE FUNCTION public.eavra_dev_get_enrollment_offer(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_record record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_or_expired_link' using errcode='22023'; end if;
  select o.*, p.name as plan_name, t.name as teacher_name, g.name as group_name
  into v_record
  from app_private.eavra_dev_enrollment_offers o
  join public.financial_plans p on p.id=o.plan_id
  join public.teachers t on t.id=o.teacher_id
  left join public.groups g on g.id=o.group_id
  where o.token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
    and o.expires_at>now()
    and (o.submitted_at is null or exists (
      select 1 from app_private.eavra_multi_use_offer_whitelist w
      where w.offer_id=o.id
        and w.offer_id='00000000-0000-4000-8000-000000000926'::uuid
        and w.active is true
    ));
  if not found then raise exception 'invalid_or_expired_link' using errcode='22023'; end if;
  return pg_catalog.jsonb_build_object(
    'model_id',v_record.model_id,'plan_name',v_record.plan_name,
    'teacher_name',v_record.teacher_name,'group_name',v_record.group_name,
    'start_date',v_record.start_date,'enrollment_date',v_record.enrollment_date,
    'due_day',v_record.due_day,'monthly_amount',v_record.monthly_amount,
    'term_title',v_record.term_title,'term_body',v_record.term_body,
    'expires_at',v_record.expires_at
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.eavra_dev_submit_enrollment(p_token text, p_student jsonb, p_accepted boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer app_private.eavra_dev_enrollment_offers%rowtype;
  v_name text;
  v_email text;
  v_phone text;
  v_cpf text;
  v_birth text;
  v_instrument text;
  v_guardian text;
  v_guardian_email text;
  v_guardian_phone text;
  v_guardian_relationship text;
  v_guardian_cpf text;
  v_id uuid;
  v_multi_use boolean := false;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_accepted is distinct from true
    or p_student is null or pg_catalog.jsonb_typeof(p_student)<>'object'
    or pg_catalog.octet_length(p_student::text)>5000 then
    raise exception 'invalid_submission' using errcode='22023'; end if;
  select * into v_offer from app_private.eavra_dev_enrollment_offers
  where token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
  for update;
  if not found then
    raise exception 'invalid_or_expired_link' using errcode='22023'; end if;
  select exists (
    select 1 from app_private.eavra_multi_use_offer_whitelist w
    where w.offer_id=v_offer.id
      and w.offer_id='00000000-0000-4000-8000-000000000926'::uuid
      and w.active is true
  ) into v_multi_use;
  if v_offer.expires_at<=now() or (v_offer.submitted_at is not null and not v_multi_use)
    then raise exception 'invalid_or_expired_link' using errcode='22023'; end if;
  v_name := btrim(p_student->>'name');
  v_email := lower(btrim(p_student->>'email'));
  v_phone := regexp_replace(coalesce(p_student->>'phone',''),'[^0-9]','','g');
  v_cpf := regexp_replace(coalesce(p_student->>'cpf',''),'[^0-9]','','g');
  v_birth := p_student->>'birth_date';
  v_instrument := btrim(p_student->>'instrument');
  -- Existing links remain compatible; new links always use the secretaria's value.
  v_guardian := nullif(btrim(coalesce(p_student->>'guardian_name','')),'');
  v_guardian_email := nullif(lower(btrim(coalesce(p_student->>'guardian_email',''))),'');
  v_guardian_phone := nullif(regexp_replace(coalesce(p_student->>'guardian_phone',''),'[^0-9]','','g'),'');
  v_guardian_relationship := nullif(btrim(coalesce(p_student->>'guardian_relationship','')),'');
  v_guardian_cpf := nullif(regexp_replace(coalesce(p_student->>'guardian_cpf',''),'[^0-9]','','g'),'');
  if coalesce(length(v_name),0) not between 3 and 120
    or coalesce(length(v_email),0) not between 6 and 150 or position('@' in v_email)<2
    or length(v_phone) not between 10 and 15 or length(v_cpf)<>11
    or v_birth is null or v_birth !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(length(v_instrument),0) not between 2 and 120
  then raise exception 'invalid_student_data' using errcode='22023'; end if;
  if v_birth::date>current_date or v_birth::date<date '1900-01-01'
    then raise exception 'invalid_birth_date' using errcode='22023'; end if;
  if v_birth::date> (current_date - interval '18 years')::date
    and (coalesce(length(v_guardian),0) < 3 or coalesce(length(v_guardian_email),0)<6 or position('@' in coalesce(v_guardian_email,''))<2
         or coalesce(length(v_guardian_phone),0) not between 10 and 15
         or coalesce(length(v_guardian_relationship),0) not between 2 and 60)
    then raise exception 'guardian_required' using errcode='22023'; end if;
  if v_guardian_cpf is not null and length(v_guardian_cpf)<>11 then
    raise exception 'invalid_guardian_cpf' using errcode='22023'; end if;
  -- A oferta foi bloqueada FOR UPDATE; pedidos concorrentes no mesmo link
  -- ficam serializados. Impede aceite duplicado do mesmo CPF.
  if v_multi_use and exists (
    select 1 from app_private.eavra_dev_enrollment_submissions s
    where s.offer_id=v_offer.id and s.student_data->>'cpf'=v_cpf
  ) then
    raise exception 'student_already_submitted_for_this_link' using errcode='22023';
  end if;
  insert into app_private.eavra_dev_enrollment_submissions
    (offer_id,student_data)
  values (v_offer.id,pg_catalog.jsonb_build_object(
    'name',v_name,'email',v_email,'phone',v_phone,'cpf',v_cpf,
    'birth_date',v_birth,'instrument',v_instrument,
    'guardian_name',v_guardian,'guardian_email',v_guardian_email,
    'guardian_phone',v_guardian_phone,'guardian_relationship',v_guardian_relationship,
    'guardian_cpf',v_guardian_cpf
  )) returning id into v_id;
  update app_private.eavra_dev_enrollment_offers set submitted_at=coalesce(submitted_at,now()) where id=v_offer.id;
  return pg_catalog.jsonb_build_object('submitted',true,'request_id',v_id);
end
$function$;

-- Esta versao mantem as RPCs originais, exceto pela checagem rigorosa
-- do UUID permitido e pela repeticao controlada do mesmo convite.
-- O aceite anterior permanece imutavel.


-- A autorização existe SOMENTE para a oferta sintética.
INSERT INTO app_private.eavra_multi_use_offer_whitelist (offer_id,active)
VALUES ('00000000-0000-4000-8000-000000000926'::uuid,true);

DO $test$
DECLARE
  v_student_a jsonb := pg_catalog.jsonb_build_object(
   'name','Aluno Teste Um','email','aluno-um@example.invalid',
   'phone','11999999999','cpf','11111111111','birth_date','2000-01-01','instrument','Piano'
  );
  v_student_b jsonb := pg_catalog.jsonb_build_object(
   'name','Aluno Teste Dois','email','aluno-dois@example.invalid',
   'phone','11999999999','cpf','22222222222','birth_date','2000-01-01','instrument','Piano'
  );
  v_student_c jsonb := pg_catalog.jsonb_build_object(
   'name','Aluno Teste Tres','email','aluno-tres@example.invalid',
   'phone','11999999999','cpf','33333333333','birth_date','2000-01-01','instrument','Piano'
  );
  v_r1 jsonb;
  v_r2 jsonb;
BEGIN
  -- Um termo especial pode ser aberto e aceito por duas pessoas.
  PERFORM public.eavra_dev_get_enrollment_offer('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  v_r1 := public.eavra_dev_submit_enrollment('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',v_student_a,true);
  PERFORM public.eavra_dev_get_enrollment_offer('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  v_r2 := public.eavra_dev_submit_enrollment('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',v_student_b,true);

  IF coalesce(v_r1->>'request_id','')=''
    OR coalesce(v_r2->>'request_id','')=''
    OR v_r1->>'request_id'=v_r2->>'request_id'
    OR (SELECT count(*) FROM app_private.eavra_dev_enrollment_submissions
        WHERE offer_id='00000000-0000-4000-8000-000000000926'::uuid AND status='pending')<>2
  THEN RAISE EXCEPTION 'Falha no teste de dois aceites independentes'; END IF;

  -- O mesmo CPF não poderá aceitar duas vezes o link especial.
  BEGIN
    PERFORM public.eavra_dev_submit_enrollment('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',v_student_a,true);
    RAISE EXCEPTION 'ERRO: CPF duplicado foi aceito';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'student_already_submitted_for_this_link'
    THEN RAISE EXCEPTION 'Recusa por motivo inesperado: %',SQLERRM; END IF;
  END;

  -- Um convite normal continua bloqueado depois do primeiro aceite.
  PERFORM public.eavra_dev_get_enrollment_offer('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  PERFORM public.eavra_dev_submit_enrollment('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',v_student_c,true);
  BEGIN
    PERFORM public.eavra_dev_submit_enrollment('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',v_student_b,true);
    RAISE EXCEPTION 'ERRO: convite comum aceitou segundo envio';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'invalid_or_expired_link'
    THEN RAISE EXCEPTION 'Recusa inesperada do convite normal: %',SQLERRM; END IF;
  END;

  IF (SELECT COUNT(*) FROM app_private.eavra_dev_enrollment_submissions
      WHERE offer_id NOT IN ('00000000-0000-4000-8000-000000000926'::uuid,'00000000-0000-4000-8000-000000000927'::uuid))<>3
  THEN RAISE EXCEPTION 'Aceites originais foram afetados'; END IF;

  RAISE NOTICE 'TESTE INTEGRADO APROVADO: especial=2 pendentes; normal=1; CPF duplicado=bloqueado; anteriores=3.';
END;
$test$;

-- REVERTE TODOS OS INSERTS, FUNCOES, INDICES E TABELA DE PERMISSAO.
ROLLBACK;
