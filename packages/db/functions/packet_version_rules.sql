-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d6f5841a2aadbeea
-- Trigger function of: packet_version.packet_version_rules
CREATE OR REPLACE FUNCTION public.packet_version_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  the_case uuid;
  current_id uuid;
  drafter uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.regulation_confirmed_by, NEW.regulation_confirmed_at, NEW.approved_by, NEW.approved_at, NEW.approved_sha256, NEW.export_pdf_key, NEW.export_csv_key, NEW.export_sha256, NEW.export_csv_sha256, NEW.exported_at)
       IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::uuid, NULL::timestamptz, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz)
       OR NEW.approved_alone THEN
      RAISE EXCEPTION 'a packet version is written unapproved and unexported' USING ERRCODE = 'check_violation';
    END IF;
    -- The 24 hours of a single-user approval run from here.
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.practice_id, NEW.packet_id, NEW.version_no, NEW.content, NEW.narrative, NEW.content_sha256, NEW.verifier_passed, NEW.verifier_report, NEW.drafted_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.packet_id, OLD.version_no, OLD.content, OLD.narrative, OLD.content_sha256, OLD.verifier_passed, OLD.verifier_report, OLD.drafted_by, OLD.created_at) THEN
    RAISE EXCEPTION 'a packet version never changes once written; an edit is a new version' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.current_version_id, p.case_id INTO current_id, the_case FROM packet p WHERE p.id = NEW.packet_id;

  -- The specialist's confirmation that the regulation applies (a Medicare Advantage non-contracted case).
  IF (NEW.regulation_confirmed_by, NEW.regulation_confirmed_at) IS DISTINCT FROM (OLD.regulation_confirmed_by, OLD.regulation_confirmed_at) THEN
    IF OLD.regulation_confirmed_by IS NOT NULL OR NEW.regulation_confirmed_by IS NULL OR NEW.content -> 'citation' ->> 'kind' IS DISTINCT FROM 'regulation' OR OLD.approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'a regulation citation is confirmed once, before approval' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.regulation_confirmed_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'pricing.answer'), false) THEN
      RAISE EXCEPTION 'a regulation''s application to a case is confirmed by a contract specialist, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.regulation_confirmed_at := now();
  END IF;

  -- Approval (CAS-09, CAS-10).
  IF (NEW.approved_by, NEW.approved_at, NEW.approved_sha256, NEW.approved_alone) IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.approved_sha256, OLD.approved_alone) THEN
    IF OLD.approved_by IS NOT NULL OR NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'a packet version is approved once, and an approval is never withdrawn; an edit is a new version' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT NEW.verifier_passed THEN
      RAISE EXCEPTION 'a packet version the verifier failed cannot be approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.approved_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.approve'), false) THEN
      RAISE EXCEPTION 'a packet is approved by a person who approves packets, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.id IS DISTINCT FROM current_id THEN
      RAISE EXCEPTION 'only a packet''s current version is approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.approved_sha256 IS DISTINCT FROM NEW.content_sha256 THEN
      RAISE EXCEPTION 'an approval names the hash of the version it approves' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.content -> 'citation' ->> 'kind' = 'regulation' AND NEW.regulation_confirmed_by IS NULL THEN
      RAISE EXCEPTION 'a contract specialist confirms the regulation applies to the case before its packet is approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = the_case AND c.state <> 'closed_written_off') OR NOT packet_version_matches_case(the_case, NEW.content) THEN
      RAISE EXCEPTION 'the case''s lines have changed since this version was written; a new version is written first' USING ERRCODE = 'check_violation';
    END IF;
    SELECT v.drafted_by INTO drafter FROM packet_version v WHERE v.packet_id = NEW.packet_id AND v.version_no = 1;
    IF app_actor_id() IN (drafter, NEW.drafted_by) AND NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.approve_own_draft'), false) THEN
      IF practice_has_other_packet_approver(NEW.practice_id, app_actor_id()) THEN
        RAISE EXCEPTION 'the person who drafted or last edited a packet cannot approve it' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF now() < NEW.created_at + interval '24 hours' THEN
        RAISE EXCEPTION 'with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written' USING ERRCODE = 'check_violation';
      END IF;
      NEW.approved_alone := true;
    ELSE
      NEW.approved_alone := false;
    END IF;
    NEW.approved_at := now();
  END IF;

  -- The export, by the export job (CAS-12).
  IF (NEW.export_pdf_key, NEW.export_csv_key, NEW.export_sha256, NEW.export_csv_sha256, NEW.exported_at) IS DISTINCT FROM (OLD.export_pdf_key, OLD.export_csv_key, OLD.export_sha256, OLD.export_csv_sha256, OLD.exported_at) THEN
    IF OLD.exported_at IS NOT NULL OR NEW.export_sha256 IS NULL THEN
      RAISE EXCEPTION 'a packet version is exported once' USING ERRCODE = 'check_violation';
    END IF;
    IF app_actor_is_person() THEN
      RAISE EXCEPTION 'only the export job exports a packet' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.approved_by IS NULL THEN
      RAISE EXCEPTION 'exporting a packet needs an approved version' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM current_id OR NOT packet_version_matches_case(the_case, NEW.content) THEN
      RAISE EXCEPTION 'only a packet''s current version, still asking for its case''s lines, is exported' USING ERRCODE = 'check_violation';
    END IF;
    NEW.exported_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.packet_version_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_rules() FROM PUBLIC;
