-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_grants(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 99b8bdc1d3dee83b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.console_grants(of_organization uuid)
 RETURNS TABLE(grant_id uuid, organization_id uuid, practice_id uuid, scope jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, agreement_id uuid, approved_by_user_id uuid, revoked_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT g.id, g.organization_id, g.practice_id, g.scope, g.starts_at, g.ends_at, g.agreement_id, g.approved_by_user_id, g.revoked_at, g.created_at
    FROM "grant" g
    JOIN practice p ON p.id = g.practice_id
   WHERE app_actor_platform_permitted('organization.manage')
     AND (g.organization_id = of_organization OR p.organization_id = of_organization)
   ORDER BY g.created_at DESC, g.id
$function$;
ALTER FUNCTION public.console_grants(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_grants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_grants(uuid) TO tp_app;
