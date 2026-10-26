-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submission_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c05aaefa59906f3b
-- Trigger function of: submission.submission_belongs
CREATE OR REPLACE FUNCTION public.submission_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  version record;
  previous record;
  answer_kind text;
  answer_reopens boolean;
  answer_window date;
BEGIN
  IF app_session_is_job() THEN
    RAISE EXCEPTION 'a submission is logged in the person''s own request, never on the worker''s login' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app_actor_is_person() OR NEW.submitted_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'submission.log'), false) THEN
    RAISE EXCEPTION 'a submission is logged by a person who logs submissions, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('submission:' || NEW.case_id::text, 0));
  SELECT v.export_sha256, v.export_csv_sha256, v.exported_at, v.dispute_level, v.packet_id, v.version_no, p.current_version_id INTO version
    FROM packet_version v JOIN packet p ON p.id = v.packet_id
   WHERE v.id = NEW.packet_version_id AND p.case_id = NEW.case_id AND v.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a submission is of a version of its case''s packet' USING ERRCODE = 'check_violation';
  END IF;
  IF version.exported_at IS NULL THEN
    RAISE EXCEPTION 'a packet is submitted once it is exported' USING ERRCODE = 'check_violation';
  END IF;
  -- The current version, or one an edit replaced only when it was sent before the edit (the day before
  -- the next version was written, UTC): an edit clears the approval, so what was not sent is never logged.
  IF version.current_version_id IS DISTINCT FROM NEW.packet_version_id AND NOT EXISTS (
       SELECT 1 FROM packet_version n
        WHERE n.packet_id = version.packet_id AND n.version_no = version.version_no + 1 AND NEW.submitted_on < (n.created_at AT TIME ZONE 'UTC')::date) THEN
    RAISE EXCEPTION 'a submission sends the packet''s current version; one an edit replaced is logged only when it was sent before the edit' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.export_sha256, NEW.export_csv_sha256) IS DISTINCT FROM (version.export_sha256, version.export_csv_sha256) THEN
    RAISE EXCEPTION 'a submission carries the SHA-256 of the export it sent' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.submitted_on < (version.exported_at AT TIME ZONE 'UTC')::date OR NEW.submitted_on > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'a submission is dated from its export to today' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.state = 'closed_written_off') THEN
    RAISE EXCEPTION 'a case closed written off takes no submission' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.dispute_level IS DISTINCT FROM version.dispute_level THEN
    RAISE EXCEPTION 'a submission sends a version of the case''s dispute level' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.id, s.submitted_on INTO previous
    FROM submission s WHERE s.case_id = NEW.case_id AND s.id <> NEW.id ORDER BY s.submitted_on DESC, s.created_at DESC, s.id DESC LIMIT 1;
  IF FOUND THEN
    IF NEW.submitted_on < previous.submitted_on THEN
      RAISE EXCEPTION 'a submission is dated on or after the case''s last one' USING ERRCODE = 'check_violation';
    END IF;
    SELECT r.kind, r.reopens_case, r.next_window_ends_on INTO answer_kind, answer_reopens, answer_window FROM payer_response r WHERE r.id = submission_latest_response(previous.id);
    IF answer_kind IS NOT NULL AND NOT (answer_kind = 'info_requested' OR answer_reopens) THEN
      RAISE EXCEPTION 'the payer has answered this dispute; only a denial that reopens the case starts the next level' USING ERRCODE = 'check_violation';
    END IF;
    IF answer_reopens AND NEW.submitted_on > answer_window THEN
      RAISE EXCEPTION 'the next dispute level is submitted within its window' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.submission_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submission_belongs() FROM PUBLIC;
