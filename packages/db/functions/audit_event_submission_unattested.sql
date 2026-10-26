-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_event_submission_unattested()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8d18da3beb942ba9
-- Trigger function of: audit_event.audit_event_submission_unattested
CREATE OR REPLACE FUNCTION public.audit_event_submission_unattested()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_session_is_job() OR NOT app_actor_is_person() OR NEW.actor_kind IS DISTINCT FROM 'user' OR NEW.actor_id IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a submission sent without sign-off is recorded in the name of the person who logged it, never on the worker''s login' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.object_type IS DISTINCT FROM 'submission' OR NEW.practice_id IS NULL OR NOT practice_in_scope(NEW.practice_id) OR NOT EXISTS (
       SELECT 1 FROM submission s
        WHERE s.id = NEW.object_id AND s.practice_id = NEW.practice_id AND s.submitted_by = NEW.actor_id AND s.unattested_reason IS NOT DISTINCT FROM NEW.purpose AND s.unattested_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'a submission sent without sign-off is recorded of a submission of its practice that its person logged without the attestation, with its reason' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_event e WHERE e.object_type = 'submission' AND e.object_id = NEW.object_id AND e.action = 'submission_logged_unattested') THEN
    RAISE EXCEPTION 'a submission sent without sign-off is recorded once, as it is logged' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.audit_event_submission_unattested() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_event_submission_unattested() FROM PUBLIC;
