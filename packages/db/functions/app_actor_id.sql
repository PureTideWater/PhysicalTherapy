-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_id()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 02930d0d6a6f6caa
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid
$function$;
ALTER FUNCTION public.app_actor_id() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_id() TO tp_app;
