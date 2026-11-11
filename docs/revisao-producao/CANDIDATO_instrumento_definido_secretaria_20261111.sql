-- CANDIDATE ONLY. Source: current production definitions, without data.
-- Requires isolated PostgreSQL tests before deploying.
-- The original 11-argument RPC is retained for links already in circulation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

ALTER TABLE app_private.eavra_dev_enrollment_offers
  ADD COLUMN IF NOT EXISTS instrument text;
DO $guard$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
   WHERE conname='eavra_dev_offer_instrument_length_check'
     AND conrelid='app_private.eavra_dev_enrollment_offers'::regclass
 ) THEN
   ALTER TABLE app_private.eavra_dev_enrollment_offers
     ADD CONSTRAINT eavra_dev_offer_instrument_length_check
       CHECK (instrument IS NULL OR length(btrim(instrument)) BETWEEN 2 AND 120);
 END IF;
END $guard$;

-- The existing RPC keeps authorization, rate limits and other validations.
CREATE OR REPLACE FUNCTION public.eavra_dev_create_enrollment_offer_with_instrument(
 p_model_id text,p_teacher_id text,p_plan_id text,p_group_id text,
 p_start_date date,p_enrollment_date date,p_due_day integer,p_monthly_amount numeric,
 p_term_title text,p_term_body text,p_expires_on date,p_instrument text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_result jsonb;
BEGIN
 IF coalesce(length(btrim(p_instrument)),0) NOT BETWEEN 2 AND 120
 THEN RAISE EXCEPTION 'invalid_instrument' USING errcode='22023'; END IF;
 v_result:=public.eavra_dev_create_enrollment_offer_with_expiry(
  p_model_id,p_teacher_id,p_plan_id,p_group_id,p_start_date,p_enrollment_date,
  p_due_day,p_monthly_amount,p_term_title,p_term_body,p_expires_on);
 UPDATE app_private.eavra_dev_enrollment_offers
    SET instrument=btrim(p_instrument)
 WHERE id=(v_result->>'id')::uuid
   AND created_by=auth.uid()::text AND submitted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'offer_instrument_not_saved' USING errcode='22023'; END IF;
 RETURN v_result;
END
$function$;
REVOKE ALL ON FUNCTION public.eavra_dev_create_enrollment_offer_with_instrument(
 text,text,text,text,date,date,integer,numeric,text,text,date,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_create_enrollment_offer_with_instrument(
 text,text,text,text,date,date,integer,numeric,text,text,date,text)
 TO authenticated;

-- Read-only public link now displays the fixed instrument.

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
    and o.expires_at>now() and o.submitted_at is null;
  if not found then raise exception 'invalid_or_expired_link' using errcode='22023'; end if;
  return pg_catalog.jsonb_build_object(
    'model_id',v_record.model_id,'plan_name',v_record.plan_name,
    'teacher_name',v_record.teacher_name,'group_name',v_record.group_name,
    'start_date',v_record.start_date,'enrollment_date',v_record.enrollment_date,
    'due_day',v_record.due_day,'monthly_amount',v_record.monthly_amount,
    'term_title',v_record.term_title,'term_body',v_record.term_body,
    'instrument',v_record.instrument,
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
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_accepted is distinct from true
    or p_student is null or pg_catalog.jsonb_typeof(p_student)<>'object'
    or pg_catalog.octet_length(p_student::text)>5000 then
    raise exception 'invalid_submission' using errcode='22023'; end if;
  select * into v_offer from app_private.eavra_dev_enrollment_offers
  where token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
  for update;
  if not found or v_offer.expires_at<=now() or v_offer.submitted_at is not null
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
  if v_guardian_cpf is not null and length(v_guardian_cpf)<>11 then
    raise exception 'invalid_guardian_cpf' using errcode='22023'; end if;
  insert into app_private.eavra_dev_enrollment_submissions
    (offer_id,student_data)
  values (v_offer.id,pg_catalog.jsonb_build_object(
    'name',v_name,'email',v_email,'phone',v_phone,'cpf',v_cpf,
    'birth_date',v_birth,'instrument',v_instrument,
    'guardian_name',v_guardian,'guardian_email',v_guardian_email,
    'guardian_phone',v_guardian_phone,'guardian_relationship',v_guardian_relationship,
    'guardian_cpf',v_guardian_cpf
  )) returning id into v_id;
  update app_private.eavra_dev_enrollment_offers set submitted_at=now() where id=v_offer.id;
  return pg_catalog.jsonb_build_object('submitted',true,'request_id',v_id);
end
$function$;

-- The submit RPC ignores tampered instrument values on newly-created links.
-- Legacy links with NULL instrument retain their old editable semantics.
COMMIT;
