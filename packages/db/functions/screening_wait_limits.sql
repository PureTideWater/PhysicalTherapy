-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_wait_limits()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9366f730bda41f40
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_wait_limits()
 RETURNS TABLE(account_rows integer, daily_rows integer)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT 100000, 1000000
$function$;
ALTER FUNCTION public.screening_wait_limits() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_wait_limits() FROM PUBLIC;
