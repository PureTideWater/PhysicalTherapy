-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_has_administrator()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b91b77291d143b70
-- Trigger function of: practice.practice_has_administrator
CREATE OR REPLACE FUNCTION public.practice_has_administrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status <> 'deleted' AND NEW.organization_id IS NOT NULL AND organization_administrator_count(NEW.organization_id) = 0 THEN
    RAISE EXCEPTION 'invite the practice group''s administrator before creating or moving its practice: a practice always has an administrator' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.practice_has_administrator() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_has_administrator() FROM PUBLIC;
