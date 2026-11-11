-- CANDIDATO - NÃO EXECUTAR SEM TESTES ISOLADOS E APROVAÇÃO.
-- Acesso negado por padrão. A presença no catálogo NÃO concede acesso.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $check$
BEGIN
 IF to_regclass('app_private.eavra_admin_allowlist') IS NULL
 OR to_regclass('app_private.eavra_permission_catalog') IS NULL
 OR to_regclass('app_private.eavra_role_permissions') IS NULL
 OR to_regclass('app_private.eavra_user_permission_overrides') IS NULL
 THEN RAISE EXCEPTION 'permission_schema_not_initialized'; END IF;
END $check$;

INSERT INTO app_private.eavra_permission_catalog
(permission_key,module,action,reserved_super_admin,admin_only)
VALUES
 ('digital_enrollment.view','digital_enrollment','view',false,true),
 ('digital_enrollment.create','digital_enrollment','create',false,true),
 ('digital_enrollment.approve','digital_enrollment','approve',false,true),
 ('rooms.view','rooms','view',false,true),
 ('rooms.assign','rooms','assign',false,true),
 ('rooms.unassign','rooms','unassign',false,true)
ON CONFLICT (permission_key) DO NOTHING;

-- Função interna usada em cada RPC. Perfis comuns só são aceitos com
-- autorização explícita. Regras individuais prevalecem sobre as do perfil.
CREATE OR REPLACE FUNCTION app_private.eavra_actor_has_feature_permission(p_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $auth$
DECLARE
  v_actor text:=auth.uid()::text;
  v_role text;
  v_decision text;
  v_scope text;
BEGIN
  IF v_actor IS NULL OR p_key NOT IN
   ('digital_enrollment.view','digital_enrollment.create','digital_enrollment.approve',
    'rooms.view','rooms.assign','rooms.unassign')
  THEN RETURN false; END IF;

  SELECT p.role INTO v_role FROM public.profiles p
  WHERE p.id=v_actor AND p.access_status='active'
    AND p.role IN ('super_admin','admin');
  IF v_role IS NULL THEN RETURN false; END IF;

  IF v_role='super_admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM app_private.eavra_admin_allowlist a
      WHERE a.auth_user_id=auth.uid()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM app_private.eavra_permission_catalog c
       WHERE c.permission_key=p_key AND c.reserved_super_admin=false)
  THEN RETURN false; END IF;

  SELECT o.decision,o.scope INTO v_decision,v_scope
  FROM app_private.eavra_user_permission_overrides o
  WHERE o.profile_id=v_actor AND o.permission_key=p_key;
  IF NOT FOUND THEN
    SELECT r.decision,r.scope INTO v_decision,v_scope
    FROM app_private.eavra_role_permissions r
    WHERE r.role='admin' AND r.permission_key=p_key;
  END IF;

  RETURN COALESCE(v_decision='allow' AND v_scope='all',false);
END
$auth$;
REVOKE ALL ON FUNCTION app_private.eavra_actor_has_feature_permission(text)
FROM PUBLIC,anon,authenticated;

-- Apenas leitura das permissões efetivas do próprio usuário.
CREATE OR REPLACE FUNCTION public.eavra_current_feature_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $access$
SELECT pg_catalog.jsonb_build_object(
 'digital_enrollment', pg_catalog.jsonb_build_object(
   'view', app_private.eavra_actor_has_feature_permission('digital_enrollment.view'),
   'create', app_private.eavra_actor_has_feature_permission('digital_enrollment.view')
             AND app_private.eavra_actor_has_feature_permission('digital_enrollment.create'),
   'approve', app_private.eavra_actor_has_feature_permission('digital_enrollment.view')
              AND app_private.eavra_actor_has_feature_permission('digital_enrollment.approve')
 ),
 'rooms', pg_catalog.jsonb_build_object(
   'view', app_private.eavra_actor_has_feature_permission('rooms.view'),
   'assign', app_private.eavra_actor_has_feature_permission('rooms.view')
             AND app_private.eavra_actor_has_feature_permission('rooms.assign'),
   'unassign', app_private.eavra_actor_has_feature_permission('rooms.view')
               AND app_private.eavra_actor_has_feature_permission('rooms.unassign')
 ));
$access$;
REVOKE ALL ON FUNCTION public.eavra_current_feature_access() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_current_feature_access() TO authenticated;

-- Revalidar cada operação no banco: nunca confiar na interface.

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
  IF NOT (app_private.eavra_actor_has_feature_permission('digital_enrollment.view') AND app_private.eavra_actor_has_feature_permission('digital_enrollment.create')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
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
$function$;

create or replace function public.eavra_dev_admin_enrollment_inbox()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_actor text:=auth.uid()::text; v_records jsonb;
begin
  IF NOT (app_private.eavra_actor_has_feature_permission('digital_enrollment.view')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
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
 IF NOT (app_private.eavra_actor_has_feature_permission('digital_enrollment.view') AND app_private.eavra_actor_has_feature_permission('digital_enrollment.approve')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
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
 IF NOT (app_private.eavra_actor_has_feature_permission('digital_enrollment.view') AND app_private.eavra_actor_has_feature_permission('digital_enrollment.approve')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.eavra_dev_admin_read_term(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_result jsonb;
BEGIN
 IF NOT (app_private.eavra_actor_has_feature_permission('digital_enrollment.view')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
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

create or replace function public.eavra_dev_room_overview(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $f$
declare v_result jsonb;
begin
  IF NOT (app_private.eavra_actor_has_feature_permission('rooms.view')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
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
  IF NOT (app_private.eavra_actor_has_feature_permission('rooms.view') AND app_private.eavra_actor_has_feature_permission('rooms.assign')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;

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
  IF NOT (app_private.eavra_actor_has_feature_permission('rooms.view') AND app_private.eavra_actor_has_feature_permission('rooms.unassign')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
  delete from app_private.eavra_dev_class_rooms where class_id=p_class_id;
  return pg_catalog.jsonb_build_object('released',true);
end $f$;

COMMIT;
