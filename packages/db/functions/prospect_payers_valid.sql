-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- prospect_payers_valid(text[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7cf431c07bbe1f8f
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.prospect_payers_valid(payers text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT cardinality(payers) BETWEEN 1 AND 50
     AND array_position(payers, NULL) IS NULL
     AND NOT EXISTS (SELECT 1 FROM unnest(payers) p WHERE btrim(p) = '' OR length(p) > 120)
$function$;
ALTER FUNCTION public.prospect_payers_valid(text[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.prospect_payers_valid(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospect_payers_valid(text[]) TO tp_app;
