-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- public_status_components()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 79a7ae3915c12b37
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.public_status_components()
 RETURNS TABLE(key text, name text, status text, changed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT c.key, c.name, c.status, c.changed_at FROM status_component c ORDER BY c.position
$function$;
ALTER FUNCTION public.public_status_components() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.public_status_components() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_status_components() TO tp_app;
