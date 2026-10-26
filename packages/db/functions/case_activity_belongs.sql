-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_activity_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 692cbfcfb09ab88d
-- Trigger function of: case_activity.case_activity_belongs
CREATE OR REPLACE FUNCTION public.case_activity_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  version record;
BEGIN
  IF NOT app_actor_is_person() OR NEW.created_by IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a case''s activity is a person''s, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(app_actor_permitted(NEW.practice_id, CASE WHEN NEW.kind = 'approval_requested' THEN 'packet.draft' ELSE 'case.work' END), false) THEN
    RAISE EXCEPTION 'notes and assignments are a case worker''s; an approval request a packet drafter''s' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case''s activity is of a case of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'assigned' AND NEW.owner_user_id IS NOT NULL AND NOT case_owner_eligible(NEW.owner_user_id, NEW.practice_id) THEN
    RAISE EXCEPTION 'a case is assigned to a person who works the practice''s cases now' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'approval_requested' THEN
    SELECT v.verifier_passed, v.approved_by, p.current_version_id = v.id AS current INTO version
      FROM packet_version v JOIN packet p ON p.id = v.packet_id
     WHERE v.id = NEW.packet_version_id AND p.case_id = NEW.case_id AND v.practice_id = NEW.practice_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approval is requested of a version of the case''s packet' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT version.current OR NOT version.verifier_passed OR version.approved_by IS NOT NULL THEN
      RAISE EXCEPTION 'approval is requested of the packet''s current version, unapproved, once the verifier passes it' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.case_activity_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_activity_belongs() FROM PUBLIC;
