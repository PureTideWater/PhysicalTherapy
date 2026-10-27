-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_session_is_job()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 485a9f8002babbb6
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.app_session_is_job()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT pg_has_role(session_user, 'tp_job', 'MEMBER') AND NOT coalesce((SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = session_user), false)
$function$;
ALTER FUNCTION public.app_session_is_job() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_session_is_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_session_is_job() TO tp_app;
