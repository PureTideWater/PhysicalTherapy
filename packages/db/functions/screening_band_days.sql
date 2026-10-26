-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_band_days(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f912bb8d6e15fdd1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_band_days(band text)
 RETURNS daterange
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE WHEN band ~ '^20[0-9]{2}-Q[1-4]$'
              THEN daterange(make_date(substr(band, 1, 4)::integer, substr(band, 7, 1)::integer * 3 - 2, 1),
                             (make_date(substr(band, 1, 4)::integer, substr(band, 7, 1)::integer * 3 - 2, 1) + interval '3 months')::date, '[)') END
$function$;
ALTER FUNCTION public.screening_band_days(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_band_days(text) FROM PUBLIC;
