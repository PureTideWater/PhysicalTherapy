-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_practices(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 76b2df303a07e7c7
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.console_practices(of_organization uuid)
 RETURNS TABLE(practice_id uuid, organization_id uuid, name text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT p.id, p.organization_id, p.name, p.status, p.created_at
    FROM practice p
   WHERE app_actor_platform_permitted('organization.manage')
     AND (of_organization IS NULL OR p.organization_id = of_organization)
   ORDER BY p.name, p.id
$function$;
ALTER FUNCTION public.console_practices(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_practices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_practices(uuid) TO tp_app;
