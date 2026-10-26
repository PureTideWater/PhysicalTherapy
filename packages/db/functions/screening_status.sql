-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_status()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 00660ad1e09bf1da
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_status()
 RETURNS TABLE(release_no integer, place_of_service_split_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN o.split IS NULL THEN NULL ELSE o.release END, CASE WHEN o.release IS NULL THEN NULL ELSE o.split END
    FROM (SELECT current_rule_release() AS release, place_of_service_split_in_force() AS split) o
$function$;
ALTER FUNCTION public.screening_status() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_status() TO tp_app;
