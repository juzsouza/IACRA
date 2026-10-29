
-- IACRA-DEV ONLY. Isolated intake and atomic approval of digital enrollment.
-- Requires explicit environment gate in frontend; never deploy this DEV migration to IACRA production.
create table if not exists app_private.eavra_dev_enrollment_offers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  token_hash text not null unique,
  model_id text not null check (model_id in ('individual_instruments_vocal','raphael_individual','institutional_group','mev_group')),
  teacher_id text not null references public.teachers(id),
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
  student_id text unique references public.students(id),
  enrollment_id text unique references public.enrollments(id)
);
alter table app_private.eavra_dev_enrollment_offers enable row level security;
alter table app_private.eavra_dev_enrollment_submissions enable row level security;
revoke all on app_private.eavra_dev_enrollment_offers from public,anon,authenticated;
revoke all on app_private.eavra_dev_enrollment_submissions from public,anon,authenticated;

create or replace function public.eavra_dev_create_enrollment_offer(
  p_model_id text, p_teacher_id text, p_plan_id text, p_group_id text,
  p_start_date date, p_enrollment_date date, p_due_day integer,
  p_monthly_amount numeric, p_term_title text, p_term_body text
) returns jsonb language plpgsql security definer set search_path = ''
as $fn$
declare
  v_actor text := auth.uid()::text;
  v_token text;
  v_offer uuid;
  v_teacher text;
  v_plan text;
  v_group text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id=v_actor and p.role='super_admin' and p.access_status='active'
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

  if p_model_id in ('institutional_group','mev_group') and nullif(p_group_id,'') is null then
    raise exception 'group_required' using errcode='22023'; end if;
  if p_model_id not in ('institutional_group','mev_group') and nullif(p_group_id,'') is not null then
    raise exception 'group_not_allowed' using errcode='22023'; end if;
  select id into v_teacher from public.teachers where id=p_teacher_id and status='active';
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
     monthly_amount,term_title,term_body,created_by)
  values (pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'),
    p_model_id,p_teacher_id,p_plan_id,v_group,p_start_date,p_enrollment_date,p_due_day,
    p_monthly_amount,btrim(p_term_title),p_term_body,v_actor)
  returning id into v_offer;
  return pg_catalog.jsonb_build_object('id',v_offer,'token',v_token,'expires_in_days',7);
end
$fn$;

create or replace function public.eavra_dev_get_enrollment_offer(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
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
    'term_title',v_record.term_title,'term_body',v_record.term_body
  );
end
$fn$;

create or replace function public.eavra_dev_submit_enrollment(
  p_token text, p_student jsonb, p_accepted boolean
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
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
  if coalesce(length(v_name),0) not between 3 and 120
    or coalesce(length(v_email),0) not between 6 and 150 or position('@' in v_email)<2
    or length(v_phone) not between 10 and 15 or length(v_cpf)<>11
    or v_birth is null or v_birth !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(length(v_instrument),0) not between 2 and 120
  then raise exception 'invalid_student_data' using errcode='22023'; end if;
  if v_birth::date>current_date or v_birth::date<date '1900-01-01'
    then raise exception 'invalid_birth_date' using errcode='22023'; end if;
  if v_birth::date> (current_date - interval '18 years')::date
    and (coalesce(length(v_guardian),0) < 3 or coalesce(length(v_guardian_email),0)<6 or position('@' in coalesce(v_guardian_email,''))<2)
    then raise exception 'guardian_required' using errcode='22023'; end if;
  insert into app_private.eavra_dev_enrollment_submissions
    (offer_id,student_data)
  values (v_offer.id,pg_catalog.jsonb_build_object(
    'name',v_name,'email',v_email,'phone',v_phone,'cpf',v_cpf,
    'birth_date',v_birth,'instrument',v_instrument,
    'guardian_name',v_guardian,'guardian_email',v_guardian_email
  )) returning id into v_id;
  update app_private.eavra_dev_enrollment_offers set submitted_at=now() where id=v_offer.id;
  return pg_catalog.jsonb_build_object('submitted',true,'request_id',v_id);
end
$fn$;

create or replace function public.eavra_dev_admin_enrollment_inbox()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_actor text:=auth.uid()::text; v_records jsonb;
begin
  if v_actor is null or not exists(
    select 1 from public.profiles where id=v_actor and role='super_admin' and access_status='active'
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

create or replace function public.eavra_dev_approve_enrollment(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  v_actor text:=auth.uid()::text;
  v_request app_private.eavra_dev_enrollment_submissions%rowtype;
  v_offer app_private.eavra_dev_enrollment_offers%rowtype;
  v_student_id text;
  v_enrollment_id text;
  v_cpf text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles where id=v_actor and role='super_admin' and access_status='active'
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  select * into v_request from app_private.eavra_dev_enrollment_submissions
    where id=p_submission_id for update;
  if not found then raise exception 'request_not_found' using errcode='22023'; end if;
  if v_request.status='approved' then
    return pg_catalog.jsonb_build_object('approved',true,'already_approved',true,
      'student_id',v_request.student_id,'enrollment_id',v_request.enrollment_id);
  end if;
  if v_request.status<>'pending' then raise exception 'request_not_pending' using errcode='22023'; end if;
  select * into v_offer from app_private.eavra_dev_enrollment_offers
    where id=v_request.offer_id;
  if not found or not exists(select 1 from public.financial_plans where id=v_offer.plan_id and is_active is true)
    or not exists(select 1 from public.teachers where id=v_offer.teacher_id and status='active')
    or (v_offer.group_id is not null and not exists(
      select 1 from public.groups where id=v_offer.group_id and status is distinct from 'inactive'
        and (teacher_id is null or teacher_id=v_offer.teacher_id)))
    then raise exception 'registration_data_changed' using errcode='22023'; end if;
  v_cpf:=v_request.student_data->>'cpf';
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('eavra_dev_enrollment_cpf'), pg_catalog.hashtext(v_cpf));
  if exists(select 1 from public.students s where regexp_replace(coalesce(s.cpf,''),'[^0-9]','','g')=v_cpf) then
    raise exception 'student_cpf_already_exists_review_manually' using errcode='23505'; end if;
  v_student_id:='eavra-dev-'||pg_catalog.gen_random_uuid()::text;
  v_enrollment_id:='eavra-dev-'||pg_catalog.gen_random_uuid()::text;

  insert into public.students
    (id,name,email,phone,cpf,instrument,status,enrollment_date,birth_date)
  values (
    v_student_id,v_request.student_data->>'name',v_request.student_data->>'email',
    v_request.student_data->>'phone',v_cpf,v_request.student_data->>'instrument',
    'active',v_offer.enrollment_date,(v_request.student_data->>'birth_date')::date
  );
  insert into public.enrollments (
    id,student_id,plan_id,teacher_id,group_id,custom_price,status,
    start_date,enrollment_date,due_date_day,due_day
  ) values (
    v_enrollment_id,v_student_id,v_offer.plan_id,v_offer.teacher_id,
    v_offer.group_id,v_offer.monthly_amount,'active',
    v_offer.start_date,v_offer.enrollment_date,v_offer.due_day,v_offer.due_day
  );
  update app_private.eavra_dev_enrollment_submissions
     set status='approved', reviewed_at=now(), reviewed_by=v_actor,
         student_id=v_student_id,enrollment_id=v_enrollment_id
   where id=v_request.id;
  return pg_catalog.jsonb_build_object('approved',true,'already_approved',false,
    'student_id',v_student_id,'enrollment_id',v_enrollment_id);
end
$fn$;

-- Revoke implicit default API-function grants, then grant only intended principals.
revoke all on function public.eavra_dev_create_enrollment_offer(text,text,text,text,date,date,integer,numeric,text,text) from public,anon,authenticated,service_role;
revoke all on function public.eavra_dev_get_enrollment_offer(text) from public,anon,authenticated,service_role;
revoke all on function public.eavra_dev_submit_enrollment(text,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function public.eavra_dev_admin_enrollment_inbox() from public,anon,authenticated,service_role;
revoke all on function public.eavra_dev_approve_enrollment(uuid) from public,anon,authenticated,service_role;
grant execute on function public.eavra_dev_create_enrollment_offer(text,text,text,text,date,date,integer,numeric,text,text) to authenticated;
grant execute on function public.eavra_dev_admin_enrollment_inbox() to authenticated;
grant execute on function public.eavra_dev_approve_enrollment(uuid) to authenticated;
-- Intentional bearer-token-only public endpoints. No direct table grants, token is 256 bits, one use, seven days.
grant execute on function public.eavra_dev_get_enrollment_offer(text) to anon,authenticated;
grant execute on function public.eavra_dev_submit_enrollment(text,jsonb,boolean) to anon,authenticated;
