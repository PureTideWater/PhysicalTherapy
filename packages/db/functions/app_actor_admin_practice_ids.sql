-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_admin_practice_ids()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 728d8dae3d1ee057
-- Trigger function of: (none)
-- Called by policy: audit_event.audit_event_access_log
-- Called by policy: grant.grant_practice_administrators_and_grantee_read
-- Called by policy: practice.practice_administrators_update
CREATE OR REPLACE FUNCTION public.app_actor_admin_practice_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT p.id), '{}')
    FROM practice p
    JOIN app_actor_memberships() m ON m.organization_id = p.organization_id
   WHERE m.organization_kind = 'group' AND m.role = 'practice_admin'
$function$;
ALTER FUNCTION public.app_actor_admin_practice_ids() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_admin_practice_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_admin_practice_ids() TO tp_app;
