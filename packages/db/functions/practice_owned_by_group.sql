-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_owned_by_group()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 000c12c0e426949e
-- Trigger function of: practice.practice_owned_by_group
CREATE OR REPLACE FUNCTION public.practice_owned_by_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.organization_id IS NOT NULL AND organization_kind_of(NEW.organization_id) IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'a practice is owned by a practice group' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.practice_owned_by_group() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_owned_by_group() FROM PUBLIC;
