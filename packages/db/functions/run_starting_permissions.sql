-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- run_starting_permissions()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 532f9006e6ec8cf9
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.run_starting_permissions()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['mapping.edit', 'case.work', 'posting.reconcile', 'phi.export', 'file.upload']
$function$;
ALTER FUNCTION public.run_starting_permissions() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.run_starting_permissions() FROM PUBLIC;
