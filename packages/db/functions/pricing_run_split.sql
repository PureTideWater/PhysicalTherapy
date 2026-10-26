-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- pricing_run_split(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 47bf3d098473fe75
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.pricing_run_split(run uuid)
 RETURNS TABLE(place_of_service_split_id uuid, settings jsonb, approved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.id, s.settings, s.approved_at
    FROM pricing_run r JOIN place_of_service_split s ON s.id = r.place_of_service_split_id
   WHERE r.id = $1 AND r.practice_id = ANY (nullif(current_setting('app.practice_ids', true), '')::uuid[])
$function$;
ALTER FUNCTION public.pricing_run_split(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.pricing_run_split(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pricing_run_split(uuid) TO tp_app;
