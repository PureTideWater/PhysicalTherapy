-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_group_practice_ids()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e8aecee1dd00dc17
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_group_practice_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT p.id), '{}')
    FROM practice p
    JOIN app_actor_memberships() m ON m.organization_id = p.organization_id
   WHERE m.organization_kind = 'group'
$function$;
ALTER FUNCTION public.app_actor_group_practice_ids() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_group_practice_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_group_practice_ids() TO tp_app;
