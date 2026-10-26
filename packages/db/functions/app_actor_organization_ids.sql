-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_organization_ids()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 77fb57cf51a4b039
-- Trigger function of: (none)
-- Called by policy: agreement.agreement_parties
-- Called by policy: agreement.agreement_read_by_parties
-- Called by policy: grant.grant_practice_administrators_and_grantee_read
-- Called by policy: organization.organization_members
CREATE OR REPLACE FUNCTION public.app_actor_organization_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT organization_id), '{}') FROM app_actor_memberships()
$function$;
ALTER FUNCTION public.app_actor_organization_ids() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_organization_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_organization_ids() TO tp_app;
