-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_location_status(uuid,integer,date,date)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 98ceb3d63dddd6dc
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_location_status(target uuid, release integer, period_from date, period_to date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN $2 IS NULL THEN 'no_release'
              WHEN s.practice_id IS NULL THEN 'zip_missing'
              ELSE (SELECT l.status FROM locality_status($2, s.zip, s.zip_plus_four, $3, $4) l) END
    FROM (SELECT 1) one LEFT JOIN practice_site s ON s.practice_id = $1
$function$;
ALTER FUNCTION public.practice_location_status(uuid,integer,date,date) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_location_status(uuid,integer,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_location_status(uuid,integer,date,date) TO tp_app;
