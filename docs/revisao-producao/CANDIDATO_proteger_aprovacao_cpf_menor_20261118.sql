-- Bloqueio seguro de aprovacao de termo antigo com CPF do menor igual ao responsavel.
-- Nao modifica dados existentes.
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef(to_regprocedure('public.eavra_dev_approve_enrollment_review(uuid,boolean,boolean)')::oid))
    IS DISTINCT FROM 'd70ffec4922ff79e1c51503bcebd56c1' THEN
   RAISE EXCEPTION 'Rotina de aprovacao foi modificada; suspender aplicacao.';
 END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.eavra_dev_approve_enrollment_review(p_submission_id uuid, p_update_student boolean, p_force_new_enrollment boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 -- Protege a aprovacao de formularios antigos; o responsavel pode ser aluno,
 -- mas CPF do responsavel e CPF da crianca nao podem coincidir no mesmo termo.
 IF v_birth > (current_date - interval '18 years')::date THEN
   IF length(regexp_replace(coalesce(v_request.student_data->>'guardian_cpf',''),'[^0-9]','','g'))<>11 THEN
     RAISE EXCEPTION 'guardian_cpf_required_for_approval' USING errcode='22023';
   END IF;
   IF regexp_replace(coalesce(v_request.student_data->>'guardian_cpf',''),'[^0-9]','','g')=v_cpf THEN
     RAISE EXCEPTION 'guardian_cpf_matches_student' USING errcode='22023';
   END IF;
 END IF;
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
$function$
;
