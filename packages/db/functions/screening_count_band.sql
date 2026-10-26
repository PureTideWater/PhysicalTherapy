-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_count_band(bigint)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3c43fb92e0243276
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_count_band(n bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE WHEN n IS NULL OR n <= 0 THEN 'none' WHEN n <= 100 THEN '1_100' WHEN n <= 1000 THEN '101_1k'
              WHEN n <= 10000 THEN '1k_10k' WHEN n <= 50000 THEN '10k_50k' ELSE 'over_50k' END
$function$;
ALTER FUNCTION public.screening_count_band(bigint) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_count_band(bigint) FROM PUBLIC;
