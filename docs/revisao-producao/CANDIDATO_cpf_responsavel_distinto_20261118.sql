-- Regra de CPF distinto na matricula digital de menores.
-- Nao cria registros, nao altera dados existentes e nao busca CPF do responsavel em public.students.
-- Guarda de versao evita sobrescrever alteracoes concorrentes na funcao de producao.
DO $preflight$
BEGIN
  IF md5(pg_get_functiondef(to_regprocedure('public.eavra_dev_submit_enrollment(text,jsonb,boolean)')::oid))
     IS DISTINCT FROM '08d55ffd00fd82e56ef6e097e1d3a621' THEN
    RAISE EXCEPTION 'A rotina de matricula mudou. Revisar antes de aplicar este script.';
  END IF;
END
$preflight$;

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
      and w.offer_id='ad09e268-a476-463f-95fd-19b2b8f5a228'::uuid
      and w.active is true
  ) into v_multi_use;
  if v_offer.expires_at<=now() or (v_offer.submitted_at is not null and not v_multi_use)
    then raise exception 'invalid_or_expired_link' using errcode='22023'; end if;
  v_name := btrim(p_student->>'name');
  v_email := lower(btrim(p_student->>'email'));
  v_phone := regexp_replace(coalesce(p_student->>'phone',''),'[^0-9]','','g');
  v_cpf := regexp_replace(coalesce(p_student->>'cpf',''),'[^0-9]','','g');
  v_birth := p_student->>'birth_date';
  v_instrument := coalesce(nullif(btrim(v_offer.instrument),''),btrim(p_student->>'instrument'));
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
  -- Um responsavel pode ser aluno do Instituto: nao consultar CPFs globais.
  -- Para menores, exija CPF proprio e diferente do aluno no mesmo termo.
  if v_birth::date > (current_date - interval '18 years')::date then
    if v_guardian_cpf is null then
      raise exception 'guardian_cpf_required' using errcode='22023';
    end if;
    if v_guardian_cpf = v_cpf then
      raise exception 'guardian_cpf_matches_student' using errcode='22023';
    end if;
  end if;
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
$function$
;
