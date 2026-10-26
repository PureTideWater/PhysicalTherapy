-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_difference_band(bigint)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 02bf48b2aefc21ae
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_difference_band(gap_cents bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE WHEN gap_cents IS NULL OR gap_cents <= 0 THEN 'none' WHEN gap_cents < 100000 THEN 'under_1k'
              WHEN gap_cents < 1000000 THEN '1k_to_10k' WHEN gap_cents < 5000000 THEN '10k_to_50k'
              WHEN gap_cents < 25000000 THEN '50k_to_250k' ELSE '250k_or_more' END
$function$;
ALTER FUNCTION public.screening_difference_band(bigint) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_difference_band(bigint) FROM PUBLIC;
