-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_open_band(timestamp with time zone,timestamp with time zone)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5378a847ee1b6828
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.screening_open_band(uploaded timestamp with time zone, opened timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE WHEN d.days IS NULL THEN NULL WHEN d.days <= 0 THEN 'same_day' WHEN d.days <= 2 THEN '1_2_days'
              WHEN d.days <= 7 THEN '3_7_days' ELSE '8_30_days' END
    FROM (SELECT (opened AT TIME ZONE 'UTC')::date - (uploaded AT TIME ZONE 'UTC')::date AS days) d
$function$;
ALTER FUNCTION public.screening_open_band(timestamp with time zone,timestamp with time zone) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_open_band(timestamp with time zone,timestamp with time zone) FROM PUBLIC;
