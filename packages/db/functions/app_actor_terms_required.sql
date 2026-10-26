-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_terms_required()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ef5705187db37687
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_terms_required()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT app_actor_id() IS NOT NULL
     AND current_terms_version() IS NOT NULL
     AND NOT user_is_internal(app_actor_id())
     AND NOT EXISTS (SELECT 1 FROM terms_acceptance a WHERE a.user_id = app_actor_id() AND a.terms_version_id = current_terms_version())
$function$;
ALTER FUNCTION public.app_actor_terms_required() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_terms_required() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_terms_required() TO tp_app;
