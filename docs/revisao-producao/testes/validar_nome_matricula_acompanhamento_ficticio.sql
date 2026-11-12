-- Disposable PostgreSQL only: verify enriched tracking preserves identification
-- and never exposes confidential invitation token.
DO $check$
DECLARE
 result jsonb;
 item jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 result:=public.eavra_dev_admin_enrollment_offers();
 IF jsonb_typeof(result)<>'array' THEN RAISE EXCEPTION 'not_array'; END IF;
 IF jsonb_array_length(result)=0 THEN RAISE EXCEPTION 'test_fixtures_missing'; END IF;
 SELECT value INTO item FROM pg_catalog.jsonb_array_elements(result) value
 WHERE value->>'submission_id' IS NOT NULL LIMIT 1;
 IF item IS NULL THEN RAISE EXCEPTION 'submission_not_found'; END IF;
 IF item->>'student_name' IS NULL THEN RAISE EXCEPTION 'student_name_missing'; END IF;
 IF NOT (item ? 'enrollment_id') OR NOT (item ? 'student_id')
 THEN RAISE EXCEPTION 'links_missing'; END IF;
 IF item ? 'token' OR item ? 'token_hash' THEN RAISE EXCEPTION 'private_token_exposed'; END IF;
 IF (SELECT amount FROM public.transactions WHERE id='pagamento-antigo')<>350
 THEN RAISE EXCEPTION 'finance_mutated'; END IF;
 RAISE NOTICE 'PASS: student name and enrollment link, no tokens, unchanged finances';
END $check$;
