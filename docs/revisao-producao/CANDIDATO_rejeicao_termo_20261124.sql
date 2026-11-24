-- CANDIDATO: uso apenas APOS aprovacao, verificacao e antes de ativar a interface.
-- IACRA: adiciona a rejeicao definitiva de termos; nao toca students/enrollments/transacoes.
-- Baseado nos contratos atuais de producao em 24/11/2026.
BEGIN;
ALTER TABLE app_private.eavra_dev_enrollment_submissions
  ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE app_private.eavra_dev_enrollment_submissions
  DROP CONSTRAINT IF EXISTS eavra_dev_enrollment_submissions_status_check;
ALTER TABLE app_private.eavra_dev_enrollment_submissions
  ADD CONSTRAINT eavra_dev_enrollment_submissions_status_check
  CHECK (status = ANY (ARRAY['pending'::text,'approved'::text,'changes_requested'::text,'rejected'::text]));
ALTER TABLE app_private.eavra_dev_enrollment_submissions
  ADD CONSTRAINT eavra_dev_enrollment_rejection_reason_check
  CHECK (status<>'rejected' OR char_length(btrim(coalesce(rejection_reason,''))) BETWEEN 10 AND 500);

CREATE OR REPLACE FUNCTION public.eavra_dev_reject_enrollment_review(
  p_submission_id uuid, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $reject$
DECLARE
 v_actor text:=auth.uid()::text;
 v_id uuid;
 v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
 IF v_actor IS NULL OR NOT (
   app_private.eavra_actor_has_feature_permission('digital_enrollment.view')
   AND app_private.eavra_actor_has_feature_permission('digital_enrollment.approve')
 ) THEN
   RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
 END IF;
 IF char_length(v_reason)<10 OR char_length(v_reason)>500 THEN
   RAISE EXCEPTION 'rejection_reason_invalid' USING ERRCODE='22023';
 END IF;
 -- Atualizacao atomica: recusa somente termo realmente pendente;
 -- nao cria aluno/matricula e jamais altera termos aprovados.
 UPDATE app_private.eavra_dev_enrollment_submissions
 SET status='rejected', rejection_reason=v_reason,
     reviewed_at=now(),reviewed_by=v_actor
 WHERE id=p_submission_id AND status='pending'
   AND student_id IS NULL AND enrollment_id IS NULL
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
   RAISE EXCEPTION 'request_not_pending' USING ERRCODE='22023';
 END IF;
 RETURN pg_catalog.jsonb_build_object('rejected',true,'id',v_id);
END
$reject$;
REVOKE ALL ON FUNCTION public.eavra_dev_reject_enrollment_review(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eavra_dev_reject_enrollment_review(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.eavra_dev_admin_enrollment_inbox()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor text:=auth.uid()::text; v_records jsonb;
begin
  IF NOT (app_private.eavra_actor_has_feature_permission('digital_enrollment.view')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',s.id,'status',s.status,'rejection_reason',s.rejection_reason,'reviewed_at',s.reviewed_at,'reviewed_by',s.reviewed_by,'student',s.student_data,
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
$function$
;
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_enrollment_offers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF NOT app_private.eavra_actor_has_feature_permission('enrollment_tracking.view')
 THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',o.id,
  'created_at',o.created_at,
  'expires_at',o.expires_at,
  'first_opened_at',o.first_opened_at,
  'sent_at',o.sent_at,
  'recipient_label',o.recipient_label,
  'submitted_at',o.submitted_at,
  'term_title',o.term_title,
  'model_id',o.model_id,
  'plan_name',p.name,
  'teacher_name',t.name,
  'group_name',g.name,
  'submission_status',s.status,
  'rejection_reason',s.rejection_reason,
  'reviewed_at',s.reviewed_at,
  'submission_id',s.id,
  'student_id',s.student_id,
  'student_name',coalesce(nullif(btrim(st.name),''),nullif(btrim(s.student_data->>'name'),'')),
  'enrollment_id',CASE WHEN en.id IS NOT NULL THEN en.id ELSE NULL END
 ) ORDER BY o.created_at DESC),'[]'::jsonb) INTO v_result
 FROM (SELECT * FROM app_private.eavra_dev_enrollment_offers ORDER BY created_at DESC LIMIT 300) o
 JOIN public.financial_plans p ON p.id=o.plan_id
 JOIN public.teachers t ON t.id=o.teacher_id
 LEFT JOIN public.groups g ON g.id=o.group_id
 LEFT JOIN app_private.eavra_dev_enrollment_submissions s ON s.offer_id=o.id
 LEFT JOIN public.students st ON st.id=s.student_id
 LEFT JOIN public.enrollments en ON en.id=s.enrollment_id;
 RETURN v_result;
END
$function$
;
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_read_term(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF NOT (app_private.eavra_actor_has_feature_permission('digital_enrollment.view')) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
 SELECT pg_catalog.jsonb_build_object(
   'status',s.status,'rejection_reason',s.rejection_reason,'term_title',o.term_title,'term_body',o.term_body,
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
$function$
;
COMMIT;
