-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_administered_user_ids()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e0d0de37b8b4437f
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_administered_user_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT m.user_id), '{}')
    FROM membership m
   WHERE m.organization_id = ANY (app_actor_administered_organization_ids())
     AND (m.ends_at IS NULL OR m.ends_at > now())
$function$;
ALTER FUNCTION public.app_actor_administered_user_ids() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_administered_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_administered_user_ids() TO tp_app;
