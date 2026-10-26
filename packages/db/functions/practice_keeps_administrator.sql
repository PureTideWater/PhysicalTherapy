-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_keeps_administrator()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d8f15c4c80b969bb
-- Trigger function of: practice.practice_keeps_administrator
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_keeps_administrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     AND OLD.organization_id IS NOT NULL AND organization_administrator_count(OLD.organization_id) > 0
     AND practice_administrator_count(NEW.id) = 0 THEN
    RAISE EXCEPTION 'a practice must always keep at least one practice administrator' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.practice_keeps_administrator() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_keeps_administrator() FROM PUBLIC;
