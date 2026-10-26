-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_site_required()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f9a3ef86d82aa7fc
-- Trigger function of: practice.practice_has_site
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_site_required()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM practice_site s WHERE s.practice_id = NEW.id) THEN
    RAISE EXCEPTION 'a practice is created with its pricing location (its billing ZIP) in the same transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'practice_has_site';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.practice_site_required() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_site_required() FROM PUBLIC;
