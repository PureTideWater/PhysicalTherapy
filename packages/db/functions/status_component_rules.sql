-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- status_component_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 82c436362d600ad2
-- Trigger function of: status_component.status_component_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.status_component_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.key, NEW.name, NEW.position, NEW.created_at) IS DISTINCT FROM (OLD.key, OLD.name, OLD.position, OLD.created_at) THEN
    RAISE EXCEPTION 'a status component keeps its key, name and place' USING ERRCODE = 'check_violation';
  END IF;
  NEW.changed_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.status_component_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.status_component_rules() FROM PUBLIC;
