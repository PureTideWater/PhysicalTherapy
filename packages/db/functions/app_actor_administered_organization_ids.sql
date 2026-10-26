-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_administered_organization_ids()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2de7ac183bc20342
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_administered_organization_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT organization_id), '{}') FROM app_actor_memberships()
   WHERE (organization_kind, role) IN (('group', 'practice_admin'), ('firm', 'firm_principal'), ('internal', 'platform_admin'))
$function$;
ALTER FUNCTION public.app_actor_administered_organization_ids() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_administered_organization_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_administered_organization_ids() TO tp_app;
