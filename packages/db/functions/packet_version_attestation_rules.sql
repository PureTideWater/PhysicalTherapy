-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_attestation_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2ce013b23d374234
-- Trigger function of: packet_version.packet_version_attestation_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_version_attestation_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  the_case uuid;
  current_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.export_verifier_report, NEW.attested_by, NEW.attested_at, NEW.attestation) IS DISTINCT FROM (NULL::jsonb, NULL::uuid, NULL::timestamptz, NULL::jsonb) THEN
      RAISE EXCEPTION 'a packet version is written unexported and unattested' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.attested_by, NEW.attestation) IS DISTINCT FROM (OLD.attested_by, OLD.attestation) THEN
    IF OLD.attested_by IS NOT NULL OR NEW.attested_by IS NULL THEN
      RAISE EXCEPTION 'a packet version''s export is attested once' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.exported_at IS NULL THEN
      RAISE EXCEPTION 'a packet version is attested once its export is made' USING ERRCODE = 'check_violation';
    END IF;
    IF app_session_is_job() THEN
      RAISE EXCEPTION 'a packet''s export is attested in its reviewer''s own request, never on the worker''s login' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT app_actor_is_person() OR NEW.attested_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'audit_finding.validate'), false) THEN
      RAISE EXCEPTION 'a packet''s export is attested by a reimbursement reviewer, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Any version of the packet: its first drafter, every later writer and every approver, this version's too.
    IF app_actor_id() IS NOT DISTINCT FROM NEW.drafted_by OR app_actor_id() IS NOT DISTINCT FROM NEW.approved_by
       OR EXISTS (SELECT 1 FROM packet_version v WHERE v.packet_id = NEW.packet_id AND (v.drafted_by = app_actor_id() OR v.approved_by = app_actor_id())) THEN
      RAISE EXCEPTION 'the person who drafted, wrote or approved a packet does not attest its export' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT p.current_version_id, p.case_id INTO current_id, the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
    IF NEW.id IS DISTINCT FROM current_id OR NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = the_case AND c.state <> 'closed_written_off')
       OR NOT packet_version_matches_case(the_case, NEW.content) THEN
      RAISE EXCEPTION 'only a packet''s current version, still asking for its case''s lines, is attested' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.content ->> 'dispute_level')::integer IS DISTINCT FROM 1 + case_reopened_levels(the_case) THEN
      RAISE EXCEPTION 'only a version of the case''s dispute level is attested' USING ERRCODE = 'check_violation';
    END IF;
    -- A version whose export was logged sent without sign-off (its pricing went stale after the export; the founder's
    -- ruling of 2026-10-20) is never attested: the submission records it as sent unattested.
    IF EXISTS (SELECT 1 FROM submission s WHERE s.packet_version_id = NEW.id AND s.practice_id = NEW.practice_id AND s.unattested_reason IS NOT NULL) THEN
      RAISE EXCEPTION 'a packet version whose export was sent without sign-off is never attested' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM pricing_current_read_lock(NEW.practice_id);
    IF packet_version_pricing_check(NEW.content) IS DISTINCT FROM 'current' THEN
      RAISE EXCEPTION 'a packet version whose pricing is no longer current is not attested' USING ERRCODE = 'check_violation';
    END IF;
    IF packet_version_deadline_status(the_case, NEW.content) = 'unverified' THEN
      RAISE EXCEPTION 'a packet version whose deadline is not verified is not attested' USING ERRCODE = 'check_violation';
    END IF;
    -- The attester's own downloads of this version's two files since its export, each recorded by the web request
    -- that served it (none is recorded on the worker's login, nor for a job's actor).
    IF NOT (packet_export_downloads_of_actor(NEW.id) @> ARRAY['csv', 'pdf']) THEN
      RAISE EXCEPTION 'a packet''s export is attested once its reviewer has downloaded both its PDF and its CSV, each checked against its SHA-256' USING ERRCODE = 'check_violation';
    END IF;
    NEW.attested_at := now();
  ELSIF NEW.attested_at IS DISTINCT FROM OLD.attested_at THEN
    RAISE EXCEPTION 'an attestation''s time is the time it was made' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.packet_version_attestation_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_attestation_rules() FROM PUBLIC;
