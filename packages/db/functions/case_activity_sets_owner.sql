-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_activity_sets_owner()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: bf9900a96bfa0fec
-- Trigger function of: case_activity.case_activity_sets_owner
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.case_activity_sets_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE "case" c SET owner_user_id = NEW.owner_user_id WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.case_activity_sets_owner() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_activity_sets_owner() FROM PUBLIC;
