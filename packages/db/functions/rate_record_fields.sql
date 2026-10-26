-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- rate_record_fields()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0cd3fc41fb7330df
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.rate_record_fields()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['scope', 'method', 'parameters', 'flags', 'rounding']
$function$;
ALTER FUNCTION public.rate_record_fields() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.rate_record_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_record_fields() TO tp_app;
