-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_export_guard()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7d2abcd182a2a48a
-- Trigger function of: packet_version.packet_version_export_guard
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_version_export_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  the_case uuid;
  contact jsonb;
BEGIN
  IF OLD.export_sha256 IS NULL AND NEW.export_sha256 IS NOT NULL THEN
    SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
    -- The content's level (a BEFORE trigger sees no generated column of NEW; the content never changes).
    IF the_case IS NULL OR (NEW.content ->> 'dispute_level')::integer IS DISTINCT FROM 1 + case_reopened_levels(the_case) THEN
      RAISE EXCEPTION 'only a version of the case''s dispute level is exported; write the packet again at this level' USING ERRCODE = 'check_violation';
    END IF;
    -- Its pricing is still current (audit item #4): every line on the pricing in effect, its release not
    -- withdrawn, the plan's mapping in force, its contract version signed off and covering the service date;
    -- read after the lock that orders it with the writes that make pricing stale.
    PERFORM pricing_current_read_lock(NEW.practice_id);
    IF packet_version_pricing_check(NEW.content) IS DISTINCT FROM 'current' THEN
      RAISE EXCEPTION 'a packet version is exported only while its pricing is current: every line on the pricing in effect, under a rule release not withdrawn and the mapping in force for its plan, with its contract version signed off and covering the service date' USING ERRCODE = 'check_violation';
    END IF;
    IF packet_version_deadline_status(the_case, NEW.content) = 'unverified' THEN
      RAISE EXCEPTION 'a packet version whose deadline is not verified is not exported' USING ERRCODE = 'check_violation';
    END IF;
    SELECT pr.settings -> 'correspondence_contact' INTO contact FROM practice pr WHERE pr.id = NEW.practice_id;
    IF NOT coalesce(jsonb_typeof(contact) = 'object'
                    AND jsonb_typeof(contact -> 'name') = 'string' AND btrim(contact ->> 'name') <> ''
                    AND jsonb_typeof(contact -> 'phone') = 'string' AND (contact ->> 'phone') ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$', false) THEN
      RAISE EXCEPTION 'a packet version is exported only once its practice has a correspondence contact the payer''s copy can print: a name or office and a phone' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT coalesce(packet_verifier_report_valid(NEW.export_verifier_report) AND NEW.export_verifier_report ->> 'format' = 'tp-packet-verifier/2'
                    AND (NEW.export_verifier_report ->> 'passed')::boolean AND NEW.export_verifier_report ->> 'narrative_sha256' = NEW.verifier_report ->> 'narrative_sha256', false) THEN
      RAISE EXCEPTION 'a packet version is exported with the verifier''s passing report over the narrative it rendered' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.export_verifier_report IS DISTINCT FROM OLD.export_verifier_report THEN
    RAISE EXCEPTION 'an export''s verifier report is written with the export, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.packet_version_export_guard() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_export_guard() FROM PUBLIC;
