-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_active_practice_ids()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b36b35df381aabd5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_active_practice_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT p.id FROM practice p WHERE p.status = 'active' ORDER BY p.id
$function$;
ALTER FUNCTION public.operator_active_practice_ids() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_active_practice_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_active_practice_ids() TO tp_operator;
