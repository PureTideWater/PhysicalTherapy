-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- maintenance_on()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1a688a810ac58550
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.maintenance_on()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce((SELECT f.value = 'true'::jsonb FROM feature_flag f WHERE f.key = 'platform.maintenance' AND f.scope = 'global'), false)
$function$;
ALTER FUNCTION public.maintenance_on() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.maintenance_on() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintenance_on() TO tp_app;
