-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_practice_key(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8908831954ae9c4f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_practice_key(practice text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT lower(regexp_replace(btrim(practice), '\s+', ' ', 'g'))
$function$;
ALTER FUNCTION public.screening_practice_key(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_practice_key(text) FROM PUBLIC;
