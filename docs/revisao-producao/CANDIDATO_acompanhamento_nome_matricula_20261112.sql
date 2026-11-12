-- Safe candidate: enrich restricted invitation tracking with verified enrollment identity.
-- No writes to students, enrollments, transactions or signed terms.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_enrollment_offers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF NOT app_private.eavra_actor_has_feature_permission('digital_enrollment.view')
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
$function$;
COMMIT;
