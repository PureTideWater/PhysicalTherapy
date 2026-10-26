-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5f8e981349178774
-- Trigger function of: packet_version.packet_version_belongs
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_version_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  the_case uuid;
BEGIN
  IF NOT app_actor_is_person() OR NEW.drafted_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'packet.draft'), false) THEN
    RAISE EXCEPTION 'a packet version is written by a person who drafts packets, in their own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT p.case_id INTO the_case FROM packet p WHERE p.id = NEW.packet_id AND p.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a packet version is of a packet of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version_no IS DISTINCT FROM 1 + coalesce((SELECT max(v.version_no) FROM packet_version v WHERE v.packet_id = NEW.packet_id AND v.id <> NEW.id), 0) THEN
    RAISE EXCEPTION 'a packet version is numbered after the last one' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = the_case AND c.state <> 'closed_written_off') THEN
    RAISE EXCEPTION 'a packet of a case closed written off takes no new version' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT packet_version_matches_case(the_case, NEW.content) THEN
    RAISE EXCEPTION 'a packet version asks for exactly its case''s lines not written off, at their priced amounts' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.dispute_level IS DISTINCT FROM 1 + case_reopened_levels(the_case) THEN
    RAISE EXCEPTION 'a packet version is of the case''s dispute level' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.packet_version_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_belongs() FROM PUBLIC;
