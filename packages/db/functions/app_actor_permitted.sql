-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_permitted(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ba1bea731502d75b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_permitted(target_practice uuid, wanted text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT roles_permit(coalesce((SELECT array_agg(DISTINCT a.role) FROM effective_practice_access() a WHERE a.practice_id = target_practice), '{}'), wanted)
$function$;
ALTER FUNCTION public.app_actor_permitted(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_permitted(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_permitted(uuid,text) TO tp_app;
