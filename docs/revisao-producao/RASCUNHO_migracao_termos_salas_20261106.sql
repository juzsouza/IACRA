-- CANDIDATA ISOLADA (10/11/2026): NÃO EXECUTAR EM PRODUÇÃO AINDA.
-- Guardas adicionais contra escalada de privilégios na tabela public.profiles.
-- Exige app_private.eavra_admin_allowlist instalada e populada de forma segura.
-- Origem: funções e tabelas de IACRA-DEV; ajustadas para esquema IACRA real em 06/11/2026.
-- Revisão pendente: teste em uma cópia isolada com mesmo esquema de produção,
-- verificação de permissões, testes ponta a ponta, plano de reversão e backup completo.
-- Não copia dados do DEV, nem toca em transações/pagamentos atuais.
-- O código do frontend correspondente ainda precisa ser revisto antes do deploy.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Retire o bloqueio operacional apenas após testes reais em ambiente de homologação.
-- Não se deve executar este arquivo diretamente em produção.
DO $preflight$
BEGIN
 IF to_regclass('public.students') IS NULL OR to_regclass('public.teachers') IS NULL
    OR to_regclass('public.enrollments') IS NULL OR to_regclass('public.classes') IS NULL THEN
   RAISE EXCEPTION 'schema_incompatible_missing_core_tables';
 END IF;
 IF (SELECT udt_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='students' AND column_name='id') <> 'uuid'
 OR (SELECT udt_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='teachers' AND column_name='id') <> 'uuid'
 OR (SELECT udt_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='enrollments' AND column_name='student_id') <> 'text'
 OR (SELECT udt_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='classes' AND column_name='teacher_id') <> 'text' THEN
   RAISE EXCEPTION 'schema_incompatible_identifier_types';
 END IF;
 IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
    OR to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
   RAISE EXCEPTION 'required_crypto_functions_missing';
 END IF;
  IF to_regclass('app_private.eavra_admin_allowlist') IS NULL THEN
    RAISE EXCEPTION 'security_allowlist_missing_do_not_run';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app_private.eavra_admin_allowlist approved
    JOIN auth.users u ON u.id=approved.auth_user_id
    JOIN public.profiles p ON p.id=u.id::text
    WHERE p.role='super_admin' AND p.access_status='active'
  ) THEN RAISE EXCEPTION 'no_approved_super_admin';
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

-- Estruturas novas; UUID obrigatório para alunos/professores da produção.
create table if not exists app_private.eavra_dev_enrollment_offers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  token_hash text not null unique,
  model_id text not null check (model_id in ('individual_instruments_vocal','raphael_individual','institutional_group','mev_group')),
  teacher_id uuid not null references public.teachers(id),
  plan_id text not null references public.financial_plans(id),
  group_id text references public.groups(id),
  start_date date not null,
  enrollment_date date not null,
  due_day integer not null check (due_day between 1 and 31),
  monthly_amount numeric(12,2) not null check (monthly_amount between 0 and 100000),
  term_title text not null,
  term_body text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  submitted_at timestamptz
);
create table if not exists app_private.eavra_dev_enrollment_submissions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  offer_id uuid not null unique references app_private.eavra_dev_enrollment_offers(id),
  student_data jsonb not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  reviewed_by text,
  reviewed_at timestamptz,
  student_id uuid references public.students(id),
  enrollment_id text references public.enrollments(id)
);
alter table app_private.eavra_dev_enrollment_offers enable row level security;
alter table app_private.eavra_dev_enrollment_submissions enable row level security;
revoke all on app_private.eavra_dev_enrollment_offers from public,anon,authenticated;
revoke all on app_private.eavra_dev_enrollment_submissions from public,anon,authenticated;

-- Uma pessoa pode aceitar vários termos; sem UNIQUE em student_id ou enrollment_id.
CREATE INDEX IF NOT EXISTS eavra_dev_submissions_by_student ON app_private.eavra_dev_enrollment_submissions(student_id);
CREATE INDEX IF NOT EXISTS eavra_dev_submissions_by_enrollment ON app_private.eavra_dev_enrollment_submissions(enrollment_id);

-- Responsável legal atual, com histórico completo de aceite mantido em submissions.
CREATE TABLE IF NOT EXISTS app_private.eavra_dev_student_guardians (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  guardian_name text NOT NULL,
  guardian_email text NOT NULL,
  guardian_phone text,
  guardian_relationship text,
  guardian_cpf text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.eavra_dev_student_guardians ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.eavra_dev_student_guardians FROM PUBLIC,anon,authenticated;


-- Convites com validade manual.
CREATE OR REPLACE FUNCTION public.eavra_dev_create_enrollment_offer_with_expiry(p_model_id text, p_teacher_id text, p_plan_id text, p_group_id text, p_start_date date, p_enrollment_date date, p_due_day integer, p_monthly_amount numeric, p_term_title text, p_term_body text, p_expires_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor text := auth.uid()::text;
  v_token text;
  v_offer uuid;
  v_teacher uuid;
  v_plan text;
  v_group text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id=v_actor and p.role='super_admin' and p.access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid())
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  if p_model_id not in ('individual_instruments_vocal','raphael_individual','institutional_group','mev_group')
    or p_model_id is null or p_teacher_id is null or p_plan_id is null
    or p_start_date is null or p_enrollment_date is null
    or p_due_day not between 1 and 31 or p_due_day is null
    or p_monthly_amount is null or p_monthly_amount < 0 or p_monthly_amount > 100000
    or round(p_monthly_amount,2) <> p_monthly_amount
    or length(btrim(coalesce(p_term_title,''))) not between 3 and 160
    or length(btrim(coalesce(p_term_body,''))) not between 10 and 20000
  then raise exception 'invalid_offer' using errcode='22023'; end if;

  if p_expires_on is null or p_expires_on < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'invalid_expiration_date' using errcode='22023';
  end if;

  if p_model_id in ('institutional_group','mev_group') and nullif(p_group_id,'') is null then
    raise exception 'group_required' using errcode='22023'; end if;
  if p_model_id not in ('institutional_group','mev_group') and nullif(p_group_id,'') is not null then
    raise exception 'group_not_allowed' using errcode='22023'; end if;
  select id into v_teacher from public.teachers where id::text=p_teacher_id and status='active';
  select id into v_plan from public.financial_plans where id=p_plan_id and is_active is true;
  if v_teacher is null or v_plan is null then raise exception 'inactive_teacher_or_plan' using errcode='22023'; end if;
  if exists(select 1 from public.financial_plans where id=p_plan_id and exclusive_teacher_id is not null and exclusive_teacher_id<>p_teacher_id)
    then raise exception 'plan_teacher_mismatch' using errcode='22023'; end if;
  if nullif(p_group_id,'') is not null then
    select id into v_group from public.groups
     where id=p_group_id and status is distinct from 'inactive'
       and (teacher_id is null or teacher_id=p_teacher_id);
    if v_group is null then raise exception 'invalid_group_teacher' using errcode='22023'; end if;
  end if;
  if (select count(*) from app_private.eavra_dev_enrollment_offers
       where created_by=v_actor and created_at>now()-interval '1 hour') >= 30 then
    raise exception 'offer_rate_limit' using errcode='22023'; end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.eavra_dev_enrollment_offers
    (token_hash,model_id,teacher_id,plan_id,group_id,start_date,enrollment_date,due_day,
     monthly_amount,term_title,term_body,created_by,expires_at)
  values (pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'),
    p_model_id,v_teacher,p_plan_id,v_group,p_start_date,p_enrollment_date,p_due_day,
    p_monthly_amount,btrim(p_term_title),p_term_body,v_actor,((p_expires_on + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
  returning id into v_offer;
  return pg_catalog.jsonb_build_object('id',v_offer,'token',v_token,'expires_on',p_expires_on);
end
$function$
;

-- Leitura de convite via token.
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
    'expires_at',v_record.expires_at
  );
end
$function$
;

-- Envio de formulário com responsável legal.
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
  v_instrument := btrim(p_student->>'instrument');
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
$function$
;
-- Caixa de entrada da administração.
create or replace function public.eavra_dev_admin_enrollment_inbox()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_actor text:=auth.uid()::text; v_records jsonb;
begin
  if v_actor is null or not exists(
    select 1 from public.profiles where id=v_actor and role='super_admin' and access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid())
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',s.id,'status',s.status,'student',s.student_data,
    'accepted_at',s.accepted_at,'created_at',s.created_at,
    'student_id',s.student_id,'enrollment_id',s.enrollment_id,
    'plan_id',o.plan_id,'teacher_id',o.teacher_id,'group_id',o.group_id,
    'plan_name',p.name,'teacher_name',t.name,'group_name',g.name,
    'monthly_amount',o.monthly_amount,'due_day',o.due_day,
    'start_date',o.start_date,'enrollment_date',o.enrollment_date,
    'term_title',o.term_title
    ) order by s.created_at desc),'[]'::jsonb) into v_records
  from (select * from app_private.eavra_dev_enrollment_submissions order by created_at desc limit 100) s
  join app_private.eavra_dev_enrollment_offers o on o.id=s.offer_id
  join public.financial_plans p on p.id=o.plan_id
  join public.teachers t on t.id=o.teacher_id
  left join public.groups g on g.id=o.group_id;
  return v_records;
end
$fn$;

-- Conferência de aluno existente, aprovação e leitura do termo.
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_review_student_match(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_actor text := auth.uid()::text;
 v_data jsonb;
 v_cpf text;
 v_count integer;
 v_student record;
 v_enrollment_id text;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS
    (SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.role='super_admin' AND p.access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid()))
 THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 SELECT s.student_data INTO v_data FROM app_private.eavra_dev_enrollment_submissions s
 WHERE s.id=p_submission_id AND s.status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'pending_request_not_found' USING errcode='22023'; END IF;
 v_cpf := regexp_replace(coalesce(v_data->>'cpf',''),'[^0-9]','','g');
 SELECT count(*) INTO v_count FROM public.students p
 WHERE v_cpf<>'' AND regexp_replace(coalesce(p.cpf,''),'[^0-9]','','g')=v_cpf;
 IF v_count=0 THEN
    RETURN pg_catalog.jsonb_build_object('match_count',0);
 ELSIF v_count>1 THEN
    RETURN pg_catalog.jsonb_build_object('match_count',v_count,'multiple_matches',true);
 END IF;
 SELECT id,name,email,phone,cpf,instrument,birth_date,status INTO v_student
 FROM public.students p WHERE regexp_replace(coalesce(p.cpf,''),'[^0-9]','','g')=v_cpf LIMIT 1;
 SELECT e.id INTO v_enrollment_id
 FROM public.enrollments e
 JOIN app_private.eavra_dev_enrollment_submissions s ON s.id=p_submission_id
 JOIN app_private.eavra_dev_enrollment_offers o ON o.id=s.offer_id
 WHERE e.student_id=v_student.id::text AND e.plan_id=o.plan_id
 AND e.teacher_id IS NOT DISTINCT FROM o.teacher_id::text
 AND e.group_id IS NOT DISTINCT FROM o.group_id AND e.status='active'
 ORDER BY e.enrollment_date DESC NULLS LAST, e.id DESC LIMIT 1;
 RETURN pg_catalog.jsonb_build_object(
 'match_count',1,'student',pg_catalog.jsonb_build_object(
  'id',v_student.id,'name',v_student.name,'email',v_student.email,
  'phone',v_student.phone,'instrument',v_student.instrument,
  'birth_date',v_student.birth_date,'status',v_student.status),
 'matching_enrollment_id',v_enrollment_id);
END
$fn$;
REVOKE ALL ON FUNCTION public.eavra_dev_admin_review_student_match(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eavra_dev_admin_review_student_match(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.eavra_dev_approve_enrollment_review(
 p_submission_id uuid,p_update_student boolean,p_force_new_enrollment boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_actor text := auth.uid()::text;
 v_request app_private.eavra_dev_enrollment_submissions%rowtype;
 v_offer app_private.eavra_dev_enrollment_offers%rowtype;
 v_student_id uuid;
 v_enrollment_id text;
 v_cpf text;
 v_match_count integer;
 v_new_student boolean := false;
 v_new_enrollment boolean := false;
 v_birth date;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS
    (SELECT 1 FROM public.profiles WHERE id=v_actor AND role='super_admin' AND access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid()))
 THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 SELECT * INTO v_request FROM app_private.eavra_dev_enrollment_submissions
 WHERE id=p_submission_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING errcode='22023'; END IF;
 IF v_request.status='approved' THEN
    RETURN pg_catalog.jsonb_build_object('approved',true,'already_approved',true,
    'student_id',v_request.student_id,'enrollment_id',v_request.enrollment_id);
 END IF;
 IF v_request.status<>'pending' THEN RAISE EXCEPTION 'request_not_pending' USING errcode='22023'; END IF;
 SELECT * INTO v_offer FROM app_private.eavra_dev_enrollment_offers WHERE id=v_request.offer_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.financial_plans WHERE id=v_offer.plan_id AND is_active IS TRUE)
 OR NOT EXISTS(SELECT 1 FROM public.teachers WHERE id=v_offer.teacher_id AND status='active')
 OR (v_offer.group_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.groups WHERE id=v_offer.group_id AND status IS DISTINCT FROM 'inactive'
    AND (teacher_id IS NULL OR teacher_id=v_offer.teacher_id::text)))
 THEN RAISE EXCEPTION 'registration_data_changed' USING errcode='22023'; END IF;

 v_cpf := regexp_replace(coalesce(v_request.student_data->>'cpf',''),'[^0-9]','','g');
 IF length(v_cpf)<>11 THEN RAISE EXCEPTION 'invalid_student_cpf' USING errcode='22023'; END IF;
 v_birth := (v_request.student_data->>'birth_date')::date;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('eavra_dev_enrollment_cpf'),pg_catalog.hashtext(v_cpf));
 SELECT count(*),min(id::text)::uuid INTO v_match_count,v_student_id FROM public.students s
 WHERE regexp_replace(coalesce(s.cpf,''),'[^0-9]','','g')=v_cpf;
 IF v_match_count>1 THEN
   RAISE EXCEPTION 'multiple_students_same_cpf_manual_review_required' USING errcode='22023';
 ELSIF v_match_count=0 THEN
   v_student_id := pg_catalog.gen_random_uuid();
   INSERT INTO public.students (id,name,email,phone,cpf,instrument,status,enrollment_date,birth_date)
   VALUES (v_student_id,v_request.student_data->>'name',v_request.student_data->>'email',
     v_request.student_data->>'phone',v_cpf,v_request.student_data->>'instrument',
     'active',v_offer.enrollment_date,v_birth);
   v_new_student := true;
 ELSIF coalesce(p_update_student,false) THEN
   UPDATE public.students SET name=v_request.student_data->>'name',
     email=v_request.student_data->>'email',phone=v_request.student_data->>'phone',
     instrument=v_request.student_data->>'instrument',birth_date=v_birth
   WHERE id=v_student_id;
 END IF;

 -- The acceptance and guardian declaration live permanently in the private submission.
 -- Update current guardian contact only for new students or explicit admin approval.
 IF (v_new_student OR coalesce(p_update_student,false)) AND
    nullif(btrim(coalesce(v_request.student_data->>'guardian_name','')),'') IS NOT NULL THEN
  INSERT INTO app_private.eavra_dev_student_guardians
    (student_id,guardian_name,guardian_email,guardian_phone,guardian_relationship,guardian_cpf,updated_at)
  VALUES
    (v_student_id,v_request.student_data->>'guardian_name',v_request.student_data->>'guardian_email',
     nullif(v_request.student_data->>'guardian_phone',''),
     nullif(v_request.student_data->>'guardian_relationship',''),
     nullif(v_request.student_data->>'guardian_cpf',''),now())
  ON CONFLICT (student_id) DO UPDATE SET
    guardian_name=EXCLUDED.guardian_name,guardian_email=EXCLUDED.guardian_email,
    guardian_phone=EXCLUDED.guardian_phone,guardian_relationship=EXCLUDED.guardian_relationship,
    guardian_cpf=EXCLUDED.guardian_cpf,updated_at=now();
 END IF;

 -- Reuse an active enrollment only if its plan, teacher and group match this invitation.
 IF NOT coalesce(p_force_new_enrollment,false) THEN
  SELECT e.id INTO v_enrollment_id FROM public.enrollments e
  WHERE e.student_id=v_student_id::text AND e.plan_id=v_offer.plan_id
  AND e.teacher_id IS NOT DISTINCT FROM v_offer.teacher_id::text
  AND e.group_id IS NOT DISTINCT FROM v_offer.group_id
  AND e.status='active'
  ORDER BY e.enrollment_date DESC NULLS LAST,e.id DESC LIMIT 1;
 END IF;
 IF v_enrollment_id IS NULL THEN
  v_enrollment_id := pg_catalog.gen_random_uuid()::text;
  INSERT INTO public.enrollments
    (id,student_id,plan_id,teacher_id,group_id,custom_price,status,start_date,enrollment_date,due_date_day,due_day)
  VALUES (v_enrollment_id,v_student_id::text,v_offer.plan_id,v_offer.teacher_id::text,
   v_offer.group_id,v_offer.monthly_amount,'active',v_offer.start_date,
   v_offer.enrollment_date,v_offer.due_day,v_offer.due_day);
  v_new_enrollment := true;
 END IF;
 UPDATE app_private.eavra_dev_enrollment_submissions SET status='approved',
   reviewed_at=now(),reviewed_by=v_actor,student_id=v_student_id,enrollment_id=v_enrollment_id
 WHERE id=v_request.id;
 RETURN pg_catalog.jsonb_build_object('approved',true,'already_approved',false,
   'student_id',v_student_id,'enrollment_id',v_enrollment_id,
   'student_reused',NOT v_new_student,'enrollment_reused',NOT v_new_enrollment);
END
$fn$;
REVOKE ALL ON FUNCTION public.eavra_dev_approve_enrollment_review(uuid,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eavra_dev_approve_enrollment_review(uuid,boolean,boolean) TO authenticated;

-- Let the admin audit show which legal guardian accepted an already-recorded term.
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_read_term(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id=auth.uid()::text AND p.role='super_admin' AND p.access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid())
 ) THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 SELECT pg_catalog.jsonb_build_object(
   'status',s.status,'term_title',o.term_title,'term_body',o.term_body,
   'accepted_at',s.accepted_at,'reviewed_at',s.reviewed_at,
   'reviewed_by',s.reviewed_by,'student_id',s.student_id,
   'enrollment_id',s.enrollment_id,
   'guardian_name',s.student_data->>'guardian_name',
   'guardian_email',s.student_data->>'guardian_email',
   'guardian_phone',s.student_data->>'guardian_phone',
   'guardian_relationship',s.student_data->>'guardian_relationship',
   'guardian_cpf',s.student_data->>'guardian_cpf'
 ) INTO v_result
 FROM app_private.eavra_dev_enrollment_submissions s
 JOIN app_private.eavra_dev_enrollment_offers o ON o.id=s.offer_id
 WHERE s.id=p_submission_id;
 IF v_result IS NULL THEN RAISE EXCEPTION 'request_not_found' USING errcode='22023'; END IF;
 RETURN v_result;
END
$fn$;



-- API endpoints: revoke Postgres default PUBLIC privileges; grant only intended callers.
REVOKE ALL ON FUNCTION public.eavra_dev_create_enrollment_offer_with_expiry(text,text,text,text,date,date,integer,numeric,text,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_create_enrollment_offer_with_expiry(text,text,text,text,date,date,integer,numeric,text,text,date) TO authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_get_enrollment_offer(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_submit_enrollment(text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
-- Public bearer-token RPCs are intentional; 256-bit random, hashed, expiring, single-use tokens.
GRANT EXECUTE ON FUNCTION public.eavra_dev_get_enrollment_offer(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_submit_enrollment(text,jsonb,boolean) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_admin_enrollment_inbox() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_admin_enrollment_inbox() TO authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_admin_review_student_match(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_admin_review_student_match(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_approve_enrollment_review(uuid,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_approve_enrollment_review(uuid,boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_admin_read_term(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_admin_read_term(uuid) TO authenticated;


-- Cadastro das sete salas e RPCs de ocupação.
create table if not exists app_private.eavra_dev_rooms (
  slug text primary key,
  name text not null unique,
  activities text[] not null default '{}'::text[],
  note text not null default '',
  raphael_only boolean not null default false,
  active boolean not null default true
);
create table if not exists app_private.eavra_dev_class_rooms (
  class_id text primary key references public.classes(id) on delete cascade,
  room_slug text not null references app_private.eavra_dev_rooms(slug),
  activity text not null,
  assigned_by text not null,
  assigned_at timestamptz not null default now()
);
create index if not exists eavra_dev_class_rooms_room_idx
  on app_private.eavra_dev_class_rooms(room_slug);
alter table app_private.eavra_dev_rooms enable row level security;
alter table app_private.eavra_dev_class_rooms enable row level security;
revoke all on table app_private.eavra_dev_rooms from public, anon, authenticated;
revoke all on table app_private.eavra_dev_class_rooms from public, anon, authenticated;

insert into app_private.eavra_dev_rooms(slug,name,activities,note,raphael_only)
values
 ('peniel','Sala Peniel',array['Teclado','Piano','Preparação vocal'],'',false),
 ('hosana','Sala Hosana',array['Preparação vocal','Teclado','Musicalização infantil'],'',false),
 ('boaz','Sala Boaz',array['Instrumentos de cordas'],'',false),
 ('joaquim','Sala Joaquim',array['Instrumentos de cordas'],'',false),
 ('sela','Sala Selá',array['Violino'],'',false),
 ('jerico','Sala Jericó',array['Bateria'],'',false),
 ('kairos','Sala Kairos',array[]::text[],'Sala Raphael; atividade definida pelo professor.',true)
on conflict (slug) do update
set name=excluded.name, activities=excluded.activities,
    note=excluded.note, raphael_only=excluded.raphael_only;

create or replace function public.eavra_dev_room_overview(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $f$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id=auth.uid()::text and p.role='super_admin' and p.access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid())
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  if p_day is null then raise exception 'invalid_day' using errcode='22023'; end if;
  select pg_catalog.jsonb_build_object(
    'rooms', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'slug',r.slug,'name',r.name,'activities',r.activities,
        'note',r.note,'raphael_only',r.raphael_only
      ) order by r.name) from app_private.eavra_dev_rooms r where r.active
    ),'[]'::jsonb),
    'assignments',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'class_id',a.class_id,'room_slug',a.room_slug,'activity',a.activity,
        'title',c.title,'teacher_name',t.name,
        'start_time',c.start_time,'end_time',c.end_time,'status',c.status
      ) order by c.start_time,r.name)
      from app_private.eavra_dev_class_rooms a
      join app_private.eavra_dev_rooms r on r.slug=a.room_slug
      join public.classes c on c.id=a.class_id
      left join public.teachers t on t.id::text=c.teacher_id
      where c.date=p_day
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $f$;

create or replace function public.eavra_dev_room_assign(
  p_class_id text, p_room_slug text, p_activity text
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $f$
declare
  v_actor text:=auth.uid()::text;
  v_class record;
  v_room record;
  v_teacher_name text;
  v_activity text:=pg_catalog.btrim(coalesce(p_activity,''));
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id=v_actor and p.role='super_admin' and p.access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid())
  ) then raise exception 'access_denied' using errcode='42501'; end if;

  select c.id,c.date,c.start_time,c.end_time,c.status,c.teacher_id
  into v_class from public.classes c where c.id=p_class_id;
  if not found then raise exception 'aula_nao_sincronizada' using errcode='22023'; end if;
  if v_class.status='cancelled' or v_class.start_time is null or v_class.end_time is null or
     v_class.end_time<=v_class.start_time then
    raise exception 'horario_da_aula_invalido' using errcode='22023';
  end if;

  -- O lock da sala impede concorrência entre duas reservas simultâneas.
  select r.slug,r.name,r.activities,r.raphael_only into v_room
  from app_private.eavra_dev_rooms r
  where r.slug=p_room_slug and r.active for update;
  if not found then raise exception 'sala_nao_encontrada' using errcode='22023'; end if;
  if pg_catalog.length(v_activity)<2 or pg_catalog.length(v_activity)>100 then
    raise exception 'atividade_invalida' using errcode='22023';
  end if;
  if coalesce(pg_catalog.array_length(v_room.activities,1),0)>0
    and not exists(
      select 1 from unnest(v_room.activities) a
      where pg_catalog.lower(a)=pg_catalog.lower(v_activity)
    ) then raise exception 'atividade_nao_permitida_para_sala' using errcode='22023';
  end if;
  if v_room.raphael_only then
    select t.name into v_teacher_name from public.teachers t where t.id::text=v_class.teacher_id;
    if pg_catalog.lower(coalesce(v_teacher_name,'')) not like '%raphael%' then
      raise exception 'sala_kairos_reservada_ao_raphael' using errcode='22023';
    end if;
  end if;

  if exists(
    select 1 from app_private.eavra_dev_class_rooms a
    join public.classes c on c.id=a.class_id
    where a.room_slug=v_room.slug and a.class_id<>v_class.id
      and c.date=v_class.date and c.status<>'cancelled'
      and c.start_time<v_class.end_time and c.end_time>v_class.start_time
  ) then raise exception 'sala_ocupada_nesse_horario' using errcode='23505'; end if;

  insert into app_private.eavra_dev_class_rooms(class_id,room_slug,activity,assigned_by,assigned_at)
  values(v_class.id,v_room.slug,v_activity,v_actor,now())
  on conflict(class_id) do update set
    room_slug=excluded.room_slug,activity=excluded.activity,
    assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at;
  return pg_catalog.jsonb_build_object('saved',true,'room_name',v_room.name);
end $f$;

create or replace function public.eavra_dev_room_unassign(p_class_id text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $f$
declare v_actor text:=auth.uid()::text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id=v_actor and p.role='super_admin' and p.access_status='active'
      AND EXISTS (SELECT 1 FROM app_private.eavra_admin_allowlist approved WHERE approved.auth_user_id = auth.uid())
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  delete from app_private.eavra_dev_class_rooms where class_id=p_class_id;
  return pg_catalog.jsonb_build_object('released',true);
end $f$;

revoke all on function public.eavra_dev_room_overview(date) from public,anon,authenticated;
revoke all on function public.eavra_dev_room_assign(text,text,text) from public,anon,authenticated;
revoke all on function public.eavra_dev_room_unassign(text) from public,anon,authenticated;
grant execute on function public.eavra_dev_room_overview(date) to authenticated;
grant execute on function public.eavra_dev_room_assign(text,text,text) to authenticated;
grant execute on function public.eavra_dev_room_unassign(text) to authenticated;

COMMIT;
