-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7085f6474417523f
-- Trigger function of: packet.packet_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'a packet is opened with no version; writing one makes it current' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.case_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.case_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a packet''s case never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id
     AND NEW.current_version_id IS DISTINCT FROM (SELECT v.id FROM packet_version v WHERE v.packet_id = NEW.id ORDER BY v.version_no DESC LIMIT 1) THEN
    RAISE EXCEPTION 'a packet''s current version is the version written last' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.packet_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_rules() FROM PUBLIC;
