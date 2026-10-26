-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- place_of_service_split_valid(jsonb)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 44ae8e24ea5d8386
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.place_of_service_split_valid(settings jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(settings) IS DISTINCT FROM 'object' THEN false ELSE coalesce(
       (SELECT count(*) FROM jsonb_object_keys(settings)) BETWEEN 1 AND 99
   AND NOT EXISTS (SELECT 1 FROM jsonb_each(settings) e
                    WHERE e.key !~ '^(0[1-9]|[1-9][0-9])$' OR jsonb_typeof(e.value) <> 'string' OR (e.value #>> '{}') NOT IN ('facility', 'non_facility')), false)
  END
$function$;
ALTER FUNCTION public.place_of_service_split_valid(jsonb) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.place_of_service_split_valid(jsonb) FROM PUBLIC;
