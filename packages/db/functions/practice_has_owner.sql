-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_has_owner()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 244ca9126c121a10
-- Trigger function of: practice.practice_has_owner
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_has_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.status <> 'deleted' THEN
    RAISE EXCEPTION 'a practice is owned by a practice group until it is deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.practice_has_owner() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_has_owner() FROM PUBLIC;
