-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- packet_version_becomes_current()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3842998ab0d8a17a
-- Trigger function of: packet_version.packet_version_becomes_current
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.packet_version_becomes_current()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE packet p SET current_version_id = NEW.id WHERE p.id = NEW.packet_id;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.packet_version_becomes_current() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.packet_version_becomes_current() FROM PUBLIC;
