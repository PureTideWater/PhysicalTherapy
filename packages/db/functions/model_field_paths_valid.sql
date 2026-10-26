-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- model_field_paths_valid(text[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4b1eb8673b5b4828
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.model_field_paths_valid(paths text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT cardinality(paths) <= 1000 AND NOT EXISTS (SELECT 1 FROM unnest(paths) p WHERE p IS NULL OR p !~ '^[a-z][a-z0-9_.\[\]]{0,127}$')
$function$;
ALTER FUNCTION public.model_field_paths_valid(text[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.model_field_paths_valid(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.model_field_paths_valid(text[]) TO tp_app;
GRANT EXECUTE ON FUNCTION public.model_field_paths_valid(text[]) TO tp_operator;
