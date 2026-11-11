-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_step_began()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8259707bef4d9f9f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.sign_in_step_began()
 RETURNS timestamp with time zone
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT date_trunc('milliseconds', clock_timestamp())
$function$;
ALTER FUNCTION public.sign_in_step_began() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_step_began() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_step_began() TO tp_app;
