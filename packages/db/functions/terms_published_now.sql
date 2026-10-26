-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- terms_published_now()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f63274938b5accb0
-- Trigger function of: terms_version.terms_version_published_now
CREATE OR REPLACE FUNCTION public.terms_published_now()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.published_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.terms_published_now() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.terms_published_now() FROM PUBLIC;
