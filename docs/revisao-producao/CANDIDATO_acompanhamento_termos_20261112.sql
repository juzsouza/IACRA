-- CANDIDATE: tracking for digital enrollment invitations. NO changes to student, classes or finance data.
-- Apply only after disposable-postgres CI and a fresh production review.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

ALTER TABLE app_private.eavra_dev_enrollment_offers
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_label text;

DO $constraint$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE conrelid='app_private.eavra_dev_enrollment_offers'::regclass
  AND conname='eavra_offer_recipient_label_length'
 ) THEN
  ALTER TABLE app_private.eavra_dev_enrollment_offers
  ADD CONSTRAINT eavra_offer_recipient_label_length
  CHECK (recipient_label IS NULL OR length(recipient_label) BETWEEN 1 AND 120);
 END IF;
END
$constraint$;

-- Only a real browser with a valid invitation token can record an opening.
-- No IP/user-agent data, no token in public responses, and first opening only.
CREATE OR REPLACE FUNCTION public.eavra_dev_track_enrollment_open(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $track$
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
 UPDATE app_private.eavra_dev_enrollment_offers
 SET first_opened_at=now()
 WHERE token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
 AND submitted_at IS NULL AND expires_at>now() AND first_opened_at IS NULL;
END
$track$;

-- The secretariat marks sending manually. Generating or copying does not
-- prove delivery to WhatsApp.
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_mark_enrollment_sent(
 p_offer_id uuid,p_recipient_label text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mark$
DECLARE v_id uuid;
BEGIN
 IF NOT app_private.eavra_actor_has_feature_permission('digital_enrollment.create')
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
$mark$;

-- Administrative metadata includes all invitations, not only submitted terms.
-- Never return token_hash, invitation plaintext, or unapproved student details.
CREATE OR REPLACE FUNCTION public.eavra_dev_admin_enrollment_offers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $list$
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
  'submission_status',s.status
 ) ORDER BY o.created_at DESC),'[]'::jsonb) INTO v_result
 FROM (SELECT * FROM app_private.eavra_dev_enrollment_offers ORDER BY created_at DESC LIMIT 300) o
 JOIN public.financial_plans p ON p.id=o.plan_id
 JOIN public.teachers t ON t.id=o.teacher_id
 LEFT JOIN public.groups g ON g.id=o.group_id
 LEFT JOIN app_private.eavra_dev_enrollment_submissions s ON s.offer_id=o.id;
 RETURN v_result;
END
$list$;

REVOKE ALL ON FUNCTION public.eavra_dev_track_enrollment_open(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_track_enrollment_open(text)
 TO anon,authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_admin_mark_enrollment_sent(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_admin_mark_enrollment_sent(uuid,text)
 TO authenticated;
REVOKE ALL ON FUNCTION public.eavra_dev_admin_enrollment_offers()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eavra_dev_admin_enrollment_offers()
 TO authenticated;

COMMIT;
