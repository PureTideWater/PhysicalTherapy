-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- place_of_service_split_in_force()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3b0a914b290badc9
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.place_of_service_split_in_force()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT s.id FROM place_of_service_split s ORDER BY s.approved_at DESC, s.id DESC LIMIT 1
$function$;
ALTER FUNCTION public.place_of_service_split_in_force() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.place_of_service_split_in_force() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_of_service_split_in_force() TO tp_app;
