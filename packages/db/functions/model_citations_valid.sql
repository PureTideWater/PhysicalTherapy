-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- model_citations_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9e885a47c2ab3c5e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.model_citations_valid(citations jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) <= 10000 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(citations) c
     WHERE jsonb_typeof(c) <> 'object'
        OR EXISTS (
          SELECT 1 FROM jsonb_each(c) e
           WHERE NOT (
             (e.key IN ('page', 'marker') AND jsonb_typeof(e.value) = 'number' AND (e.value #>> '{}') ~ '^[1-9][0-9]{0,5}$')
             OR (e.key = 'quote_sha256' AND jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') ~ '^[0-9a-f]{64}$')
             OR (e.key = 'field' AND jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') ~ '^[a-z][a-z0-9_.\[\]]{0,127}$')
           )
        )
  )
$function$;
ALTER FUNCTION public.model_citations_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.model_citations_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.model_citations_valid(jsonb) TO tp_app;
GRANT EXECUTE ON FUNCTION public.model_citations_valid(jsonb) TO tp_operator;
