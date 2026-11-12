-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- payer_response_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7af96946dd6cb11a
-- Trigger function of: payer_response.payer_response_belongs
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.payer_response_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  sent record;
  previous date;
BEGIN
  IF app_actor_is_person() THEN
    IF NEW.recorded_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'submission.log'), false) THEN
      RAISE EXCEPTION 'a payer response is recorded by a person who logs submissions, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.recorded_by IS NOT NULL THEN
    RAISE EXCEPTION 'a job records a response in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.document_id IS NOT NULL THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'a payer response naming a document is recorded at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('document_use:' || NEW.document_id::text, 0));
  END IF;
  SELECT s.id, s.case_id, s.submitted_on INTO sent FROM submission s WHERE s.id = NEW.submission_id AND s.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a payer response is to a submission of its practice' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('submission:' || sent.case_id::text, 0));
  IF sent.id IS DISTINCT FROM case_latest_submission(sent.case_id) THEN
    RAISE EXCEPTION 'a payer response answers its case''s latest submission' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.received_on < sent.submitted_on OR NEW.received_on > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'a payer response is received from its submission to today' USING ERRCODE = 'check_violation';
  END IF;
  SELECT max(r.received_on) INTO previous FROM payer_response r WHERE r.submission_id = sent.id AND r.id <> NEW.id;
  IF previous IS NOT NULL AND NEW.received_on < previous THEN
    RAISE EXCEPTION 'a payer response is received on or after the submission''s last one' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.document_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM source_document d
        WHERE d.id = NEW.document_id AND d.practice_id = NEW.practice_id AND d.parent_document_id IS NULL
          AND d.kind IN ('payer_letter', 'other') AND d.scan_status = 'clean' AND d.status = 'stored'
          AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids))) THEN
    RAISE EXCEPTION 'a payer response''s document is a clean, stored payer letter or other document of its practice that no contract version names' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.remittance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM remittance m WHERE m.id = NEW.remittance_id AND m.practice_id = NEW.practice_id AND m.status = 'loaded') THEN
    RAISE EXCEPTION 'a payer response''s remittance is a loaded remittance of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.payer_response_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.payer_response_belongs() FROM PUBLIC;
