-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- model_hashes_valid(text[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 67115b68576eb415
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.model_hashes_valid(hashes text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT cardinality(hashes) BETWEEN 1 AND 10000 AND NOT EXISTS (SELECT 1 FROM unnest(hashes) h WHERE h IS NULL OR h !~ '^[0-9a-f]{64}$')
$function$;
ALTER FUNCTION public.model_hashes_valid(text[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.model_hashes_valid(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.model_hashes_valid(text[]) TO tp_app;
GRANT EXECUTE ON FUNCTION public.model_hashes_valid(text[]) TO tp_operator;
