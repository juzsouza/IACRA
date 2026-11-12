-- Candidate: independently controlled tracking module (default denied for admins).
-- No grant to teacher, no general enrollment editing, no finance writes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
INSERT INTO app_private.eavra_permission_catalog
 (permission_key,module,action,reserved_super_admin,admin_only)
VALUES
 ('enrollment_tracking.view','enrollment_tracking','view',false,true),
 ('enrollment_tracking.mark_sent','enrollment_tracking','mark_sent',false,true)
ON CONFLICT (permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION app_private.eavra_actor_has_feature_permission(p_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor text:=auth.uid()::text;
  v_role text;
  v_decision text;
  v_scope text;
BEGIN
  IF v_actor IS NULL OR p_key NOT IN
   ('digital_enrollment.view','digital_enrollment.create','digital_enrollment.approve',
    'rooms.view','rooms.assign','rooms.unassign',
    'enrollment_tracking.view','enrollment_tracking.mark_sent')
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
$function$
;
CREATE OR REPLACE FUNCTION public.eavra_current_feature_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
SELECT pg_catalog.jsonb_build_object(
 'digital_enrollment', pg_catalog.jsonb_build_object(
   'view', app_private.eavra_actor_has_feature_permission('digital_enrollment.view'),
   'create', app_private.eavra_actor_has_feature_permission('digital_enrollment.view')
             AND app_private.eavra_actor_has_feature_permission('digital_enrollment.create'),
   'approve', app_private.eavra_actor_has_feature_permission('digital_enrollment.view')
              AND app_private.eavra_actor_has_feature_permission('digital_enrollment.approve')
 ),
 'enrollment_tracking', pg_catalog.jsonb_build_object(
   'view', app_private.eavra_actor_has_feature_permission('enrollment_tracking.view'),
   'mark_sent', app_private.eavra_actor_has_feature_permission('enrollment_tracking.view')
                 AND app_private.eavra_actor_has_feature_permission('enrollment_tracking.mark_sent')
 ),
 'rooms', pg_catalog.jsonb_build_object(
   'view', app_private.eavra_actor_has_feature_permission('rooms.view'),
   'assign', app_private.eavra_actor_has_feature_permission('rooms.view')
             AND app_private.eavra_actor_has_feature_permission('rooms.assign'),
   'unassign', app_private.eavra_actor_has_feature_permission('rooms.view')
               AND app_private.eavra_actor_has_feature_permission('rooms.unassign')
 ));
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
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_mark_enrollment_sent(p_offer_id uuid, p_recipient_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
 IF NOT (app_private.eavra_actor_has_feature_permission('enrollment_tracking.view')
     AND app_private.eavra_actor_has_feature_permission('enrollment_tracking.mark_sent'))
 THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 IF p_offer_id IS NULL OR length(btrim(coalesce(p_recipient_label,'')))>120
 THEN RAISE EXCEPTION 'invalid_recipient' USING errcode='22023'; END IF;
 UPDATE app_private.eavra_dev_enrollment_offers o
 SET sent_at=coalesce(o.sent_at,now()),
 recipient_label=coalesce(nullif(btrim(p_recipient_label),''),o.recipient_label)
 WHERE o.id=p_offer_id
 RETURNING o.id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'offer_not_found' USING errcode='22023'; END IF;
 RETURN pg_catalog.jsonb_build_object('updated',true);
END
$function$
;
CREATE OR REPLACE FUNCTION public.eavra_dev_tracking_read_approved_request(p_submission_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $approved$
DECLARE v_result jsonb;
BEGIN
 IF NOT app_private.eavra_actor_has_feature_permission('enrollment_tracking.view')
 THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'id',s.id,'status',s.status,
  'student',pg_catalog.jsonb_build_object('name',coalesce(nullif(pg_catalog.btrim(st.name),''),s.student_data->>'name')),
  'plan_name',p.name,'teacher_name',t.name,'group_name',g.name,
  'monthly_amount',o.monthly_amount,'accepted_at',s.accepted_at,
  'student_id',s.student_id,'enrollment_id',s.enrollment_id,
  'start_date',o.start_date,'enrollment_date',o.enrollment_date,'due_day',o.due_day
 ) INTO v_result
 FROM app_private.eavra_dev_enrollment_submissions s
 JOIN app_private.eavra_dev_enrollment_offers o ON o.id=s.offer_id
 JOIN public.financial_plans p ON p.id=o.plan_id
 JOIN public.teachers t ON t.id=o.teacher_id
 LEFT JOIN public.groups g ON g.id=o.group_id
 JOIN public.students st ON st.id=s.student_id
 JOIN public.enrollments en ON en.id=s.enrollment_id
 WHERE s.id=p_submission_id AND s.status='approved';
 IF v_result IS NULL THEN RAISE EXCEPTION 'approved_record_not_found' USING errcode='22023'; END IF;
 RETURN v_result;
END
$approved$;
CREATE OR REPLACE FUNCTION public.eavra_dev_tracking_read_approved_term(p_submission_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $audit$
DECLARE v_result jsonb;
BEGIN
 IF NOT app_private.eavra_actor_has_feature_permission('enrollment_tracking.view')
 THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'status',s.status,'term_title',o.term_title,'term_body',o.term_body,
  'accepted_at',s.accepted_at,'reviewed_at',s.reviewed_at,
  'reviewed_by',s.reviewed_by,'student_id',s.student_id,
  'enrollment_id',s.enrollment_id
 ) INTO v_result
 FROM app_private.eavra_dev_enrollment_submissions s
 JOIN app_private.eavra_dev_enrollment_offers o ON o.id=s.offer_id
 JOIN public.enrollments en ON en.id=s.enrollment_id
 WHERE s.id=p_submission_id AND s.status='approved' AND s.student_id IS NOT NULL;
 IF v_result IS NULL THEN RAISE EXCEPTION 'approved_term_not_found' USING errcode='22023'; END IF;
 RETURN v_result;
END
$audit$;
REVOKE ALL ON FUNCTION public.eavra_dev_tracking_read_approved_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_tracking_read_approved_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_tracking_read_approved_term(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_tracking_read_approved_term(uuid) TO authenticated;
COMMIT;
