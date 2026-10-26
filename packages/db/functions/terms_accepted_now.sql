-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- terms_accepted_now()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 657b65330865e56b
-- Trigger function of: terms_acceptance.terms_acceptance_accepted_now
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.terms_accepted_now()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.accepted_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.terms_accepted_now() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.terms_accepted_now() FROM PUBLIC;
