-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_is_person()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b6531b04450fa24c
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_is_person()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = app_actor_id())
$function$;
ALTER FUNCTION public.app_actor_is_person() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_is_person() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_is_person() TO tp_app;
